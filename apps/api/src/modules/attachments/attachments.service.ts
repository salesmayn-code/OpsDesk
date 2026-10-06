import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { fromBuffer } from 'file-type';
import type { Response } from 'express';
import { DomainError, errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { TicketsService } from '../tickets/tickets.service';
import { isAdminOverride } from '../tickets/tickets.policy';
import type { Env } from '../../config/env';
import type { AuthUser } from '../../common/auth-user';

/** Magic-byte allow-list (TKT-10). SVG/HTML/executables are never accepted. */
const SIGNATURE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
]);

const TEXT_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
};

type AttachmentRow = Prisma.TicketAttachmentGetPayload<Record<string, never>>;

function sanitizeFilename(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? 'file';
  const withoutControlChars = [...base]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  const cleaned = withoutControlChars.replace(/[<>:"|?*]/g, '_').trim();
  return (cleaned.length > 0 ? cleaned : 'file').slice(0, 255);
}

function isProbablyText(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 8192);
  return !head.includes(0);
}

@Injectable()
export class AttachmentsService {
  private readonly maxPerTicket: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {
    this.maxPerTicket = config.get('UPLOAD_MAX_PER_TICKET', { infer: true });
  }

  private map(attachment: AttachmentRow) {
    return {
      id: attachment.id,
      ticketId: attachment.ticketId,
      uploadedById: attachment.uploadedById,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      isInternal: attachment.isInternal,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  async list(idOrKey: string, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(idOrKey, actor);
    const canViewInternal = actor.permissions.includes('ticket:view_internal');
    const attachments = await this.prisma.ticketAttachment.findMany({
      where: {
        ticketId: ticket.id,
        deletedAt: null,
        ...(canViewInternal ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return { data: attachments.map((attachment) => this.map(attachment)) };
  }

  async upload(
    idOrKey: string,
    file: Express.Multer.File | undefined,
    isInternalRaw: string | undefined,
    actor: AuthUser,
  ) {
    const ticket = await this.tickets.loadVisible(idOrKey, actor);
    if (
      (ticket.status === 'CLOSED' || ticket.status === 'CANCELLED') &&
      !isAdminOverride(actor)
    ) {
      throw errors.businessRule('TICKET_READ_ONLY', 'Closed tickets are read-only.');
    }
    if (!file) {
      throw errors.businessRule('VALIDATION_FAILED', 'No file was uploaded.');
    }

    const isInternal = isInternalRaw === 'true';
    if (isInternal && !actor.permissions.includes('ticket:view_internal')) {
      throw errors.forbidden('You cannot upload internal attachments.');
    }

    const existingCount = await this.prisma.ticketAttachment.count({
      where: { ticketId: ticket.id, deletedAt: null },
    });
    if (existingCount >= this.maxPerTicket) {
      throw new DomainError(
        'ATTACHMENT_LIMIT_REACHED',
        422,
        `A ticket can have at most ${this.maxPerTicket} attachments.`,
      );
    }

    const detected = await fromBuffer(file.buffer);
    const extension = extname(file.originalname).toLowerCase();
    let mimeType: string;
    let storedExtension: string;

    if (detected && SIGNATURE_MIME.has(detected.mime)) {
      mimeType = detected.mime;
      storedExtension = `.${detected.ext}`;
    } else if (
      !detected &&
      TEXT_MIME[extension] !== undefined &&
      isProbablyText(file.buffer)
    ) {
      mimeType = TEXT_MIME[extension]!;
      storedExtension = extension;
    } else {
      throw new DomainError(
        'ATTACHMENT_TYPE_NOT_ALLOWED',
        415,
        'This file type is not allowed. Attach images, PDFs, ZIPs, or text-based files.',
      );
    }

    const storageKey = await this.storage.save(file.buffer, storedExtension);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const attachmentId = uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketAttachment.create({
        data: {
          id: attachmentId,
          ticketId: ticket.id,
          uploadedById: actor.id,
          originalName: sanitizeFilename(file.originalname),
          storageKey,
          mimeType,
          sizeBytes: file.size,
          sha256,
          isInternal,
        },
      });
      await tx.ticketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: ticket.id,
          actorId: actor.id,
          type: 'ATTACHMENT_ADDED',
          isInternal,
          metadata: { attachmentId, originalName: sanitizeFilename(file.originalname) },
        },
      });
      await this.audit.record(tx, {
        action: 'attachment.uploaded',
        entityType: 'ticket_attachment',
        entityId: attachmentId,
        metadata: { ticketId: ticket.id, mimeType, sizeBytes: file.size },
      });
    });

    const created = await this.prisma.ticketAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    return { data: this.map(created) };
  }

  async download(attachmentId: string, actor: AuthUser, res: Response) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.deletedAt) {
      throw errors.notFound('ATTACHMENT_NOT_FOUND', 'Attachment not found.');
    }
    // Visibility: 404 for invisible tickets and for internal files without permission.
    await this.tickets.loadVisible(attachment.ticketId, actor);
    if (attachment.isInternal && !actor.permissions.includes('ticket:view_internal')) {
      throw errors.notFound('ATTACHMENT_NOT_FOUND', 'Attachment not found.');
    }

    const content = await this.storage.read(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', content.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.originalName.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    res.status(200).end(content);
  }

  async remove(attachmentId: string, actor: AuthUser) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.deletedAt) {
      throw errors.notFound('ATTACHMENT_NOT_FOUND', 'Attachment not found.');
    }
    await this.tickets.loadVisible(attachment.ticketId, actor);
    const isUploader = attachment.uploadedById === actor.id;
    if (!isUploader && !actor.permissions.includes('attachment:delete')) {
      throw errors.forbidden('You cannot delete this attachment.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketAttachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date(), deletedById: actor.id },
      });
      await tx.ticketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: attachment.ticketId,
          actorId: actor.id,
          type: 'ATTACHMENT_REMOVED',
          isInternal: attachment.isInternal,
          metadata: { attachmentId },
        },
      });
      await this.audit.record(tx, {
        action: 'attachment.deleted',
        entityType: 'ticket_attachment',
        entityId: attachmentId,
        metadata: { ticketId: attachment.ticketId },
      });
    });
    await this.storage.delete(attachment.storageKey);
  }
}

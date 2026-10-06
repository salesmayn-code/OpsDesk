import type { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import type { CreateCommentInput, UpdateCommentInput } from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { TicketsService } from '../tickets/tickets.service';
import { isAdminOverride } from '../tickets/tickets.policy';
import type { AuthUser } from '../../common/auth-user';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

type CommentRow = Prisma.TicketCommentGetPayload<{
  include: { author: { select: { id: true; firstName: true; lastName: true; email: true } } };
}>;

const COMMENT_INCLUDE = {
  author: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.TicketCommentInclude;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly sla: SlaService,
    private readonly audit: AuditService,
  ) {}

  private map(comment: CommentRow) {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      author: {
        id: comment.author.id,
        firstName: comment.author.firstName,
        lastName: comment.author.lastName,
        email: comment.author.email,
      },
      visibility: comment.visibility,
      body: comment.body,
      editedAt: comment.editedAt?.toISOString() ?? null,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  /** Internal notes are filtered at the query level (TKT-9 / BR-8). */
  async list(idOrKey: string, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(idOrKey, actor);
    const canViewInternal = actor.permissions.includes('ticket:view_internal');
    const comments = await this.prisma.ticketComment.findMany({
      where: { ticketId: ticket.id, ...(canViewInternal ? {} : { visibility: 'PUBLIC' }) },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return { data: comments.map((comment) => this.map(comment)) };
  }

  async create(idOrKey: string, input: CreateCommentInput, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(idOrKey, actor);
    if (
      (ticket.status === 'CLOSED' || ticket.status === 'CANCELLED') &&
      !isAdminOverride(actor)
    ) {
      throw errors.businessRule('TICKET_READ_ONLY', 'Closed tickets are read-only.');
    }
    if (input.visibility === 'INTERNAL' && !actor.permissions.includes('ticket:comment_internal')) {
      throw errors.forbidden('You cannot post internal notes.');
    }

    const isStaff = actor.permissions.includes('ticket:view_team');
    const isRequester = ticket.requesterId === actor.id;
    const now = new Date();
    const commentId = uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketComment.create({
        data: {
          id: commentId,
          ticketId: ticket.id,
          authorId: actor.id,
          visibility: input.visibility,
          body: input.body,
        },
      });
      await tx.ticketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: ticket.id,
          actorId: actor.id,
          type: input.visibility === 'INTERNAL' ? 'INTERNAL_NOTE_ADDED' : 'COMMENT_ADDED',
          isInternal: input.visibility === 'INTERNAL',
          metadata: { commentId },
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv7(),
          type: 'ticket.comment_added',
          aggregateType: 'ticket',
          aggregateId: ticket.id,
          payload: {
            ticketId: ticket.id,
            commentId,
            visibility: input.visibility,
            authorId: actor.id,
            requesterId: ticket.requesterId,
            assigneeId: ticket.assigneeId,
          },
        },
      });

      // TKT-18: first public staff reply captures firstResponseAt and completes the response SLA.
      if (input.visibility === 'PUBLIC' && isStaff && !ticket.firstResponseAt) {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { firstResponseAt: now },
        });
        await this.sla.completeResponseTimer(tx, ticket.id, now);
      }

      // Requester reply while waiting automatically resumes work.
      if (input.visibility === 'PUBLIC' && isRequester && ticket.status === 'WAITING_FOR_USER') {
        const updated = await tx.ticket.updateMany({
          where: { id: ticket.id, version: ticket.version, status: 'WAITING_FOR_USER' },
          data: { status: 'IN_PROGRESS', version: { increment: 1 } },
        });
        if (updated.count === 1) {
          await tx.ticketEvent.create({
            data: {
              id: uuidv7(),
              ticketId: ticket.id,
              actorId: actor.id,
              type: 'STATUS_CHANGED',
              fromValue: 'WAITING_FOR_USER',
              toValue: 'IN_PROGRESS',
              metadata: { auto: true, commentId },
            },
          });
          await this.sla.applyEffects(tx, ticket, { resumeResolution: true });
          await tx.outboxEvent.create({
            data: {
              id: uuidv7(),
              type: 'ticket.status_changed',
              aggregateType: 'ticket',
              aggregateId: ticket.id,
              payload: {
                ticketId: ticket.id,
                key: ticket.key,
                from: 'WAITING_FOR_USER',
                to: 'IN_PROGRESS',
                auto: true,
              },
            },
          });
        }
      }
    });

    const created = await this.prisma.ticketComment.findUniqueOrThrow({
      where: { id: commentId },
      include: COMMENT_INCLUDE,
    });
    return { data: this.map(created) };
  }

  async update(idOrKey: string, commentId: string, input: UpdateCommentInput, actor: AuthUser) {
    const ticket = await this.tickets.loadVisible(idOrKey, actor);
    const comment = await this.prisma.ticketComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.ticketId !== ticket.id) {
      throw errors.notFound('COMMENT_NOT_FOUND', 'Comment not found.');
    }
    if (comment.authorId !== actor.id) {
      throw errors.forbidden('You can only edit your own comments.');
    }
    if (Date.now() - comment.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw errors.businessRule(
        'VALIDATION_FAILED',
        'Comments can only be edited within 15 minutes of posting.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketComment.update({
        where: { id: commentId },
        data: { body: input.body, editedAt: new Date() },
      });
      await tx.ticketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: ticket.id,
          actorId: actor.id,
          type: 'UPDATED',
          metadata: { commentId, edited: true },
        },
      });
      await this.audit.record(tx, {
        action: 'ticket.status_changed',
        entityType: 'ticket_comment',
        entityId: commentId,
        metadata: { edited: true },
      });
    });

    const updated = await this.prisma.ticketComment.findUniqueOrThrow({
      where: { id: commentId },
      include: COMMENT_INCLUDE,
    });
    return { data: this.map(updated) };
  }
}

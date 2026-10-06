import { Injectable } from '@nestjs/common';
import { NotificationType, type Prisma } from '@prisma/client';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { errors } from '../../common/errors';
import type { AuthUser } from '../../common/auth-user';

interface NotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  dedupeKey: string;
}

/**
 * Notification fan-out (NTF-1/NTF-3). Resolves recipients from domain-event payloads;
 * rows are created by the outbox dispatcher, never in the request path.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async handleEvent(
    tx: Prisma.TransactionClient,
    type: string,
    payload: Record<string, unknown>,
    aggregateId: string,
  ): Promise<void> {
    const items: NotificationInput[] = [];
    const str = (key: string): string | null =>
      typeof payload[key] === 'string' ? (payload[key] as string) : null;

    switch (type) {
      case 'ticket.assigned':
      case 'ticket.created': {
        const assigneeId = str('assigneeId');
        if (!assigneeId) break;
        const key = str('key') ?? '';
        items.push({
          recipientId: assigneeId,
          type: 'TICKET_ASSIGNED',
          title: `Ticket ${key} assigned to you`,
          message: 'Open the ticket to review and start work.',
          entityType: 'ticket',
          entityId: aggregateId,
          link: `/tickets/${key}`,
          dedupeKey: `ticket.assigned:${aggregateId}:${assigneeId}`,
        });
        break;
      }
      case 'ticket.status_changed': {
        const key = str('key') ?? '';
        const to = str('to') ?? '';
        const from = str('from') ?? '';
        const requesterId = str('requesterId');
        const assigneeId = str('assigneeId');
        const isResolved = to === 'RESOLVED';
        const recipients = new Set<string>();
        if (requesterId) recipients.add(requesterId);
        if (assigneeId) recipients.add(assigneeId);
        for (const recipientId of recipients) {
          items.push({
            recipientId,
            type: isResolved ? 'TICKET_RESOLVED' : 'TICKET_STATUS_CHANGED',
            title: isResolved
              ? `Ticket ${key} was resolved`
              : `Ticket ${key} moved to ${to.toLowerCase().replaceAll('_', ' ')}`,
            message: isResolved
              ? 'Please confirm the resolution or reopen if the issue persists.'
              : `Status changed from ${from.toLowerCase().replaceAll('_', ' ')}.`,
            entityType: 'ticket',
            entityId: aggregateId,
            link: `/tickets/${key}`,
            dedupeKey: `ticket.status:${aggregateId}:${to}:${recipientId}`,
          });
        }
        break;
      }
      case 'ticket.comment_added': {
        let key = str('key');
        if (!key) {
          const ticket = await tx.ticket.findUnique({
            where: { id: aggregateId },
            select: { key: true },
          });
          key = ticket?.key ?? '';
        }
        const visibility = str('visibility');
        if (visibility !== 'PUBLIC') break;
        const commentId = str('commentId') ?? aggregateId;
        const authorId = str('authorId');
        const recipients = new Set<string>();
        const requesterId = str('requesterId');
        const assigneeId = str('assigneeId');
        if (requesterId) recipients.add(requesterId);
        if (assigneeId) recipients.add(assigneeId);
        recipients.delete(authorId ?? '');
        for (const recipientId of recipients) {
          items.push({
            recipientId,
            type: 'TICKET_COMMENT_ADDED',
            title: `New reply on ticket ${key}`,
            message: 'A public reply was added to your ticket.',
            entityType: 'ticket',
            entityId: aggregateId,
            link: `/tickets/${key}`,
            dedupeKey: `ticket.comment:${commentId}:${recipientId}`,
          });
        }
        break;
      }
      case 'sla.warning':
      case 'sla.escalated':
      case 'sla.breached': {
        const kind = str('kind') ?? 'SLA';
        const ticket = await tx.ticket.findUnique({
          where: { id: aggregateId },
          select: {
            id: true,
            key: true,
            assigneeId: true,
            requesterId: true,
            team: { select: { leadId: true, managerId: true } },
          },
        });
        if (!ticket) break;
        const typeMap = {
          'sla.warning': 'SLA_WARNING',
          'sla.escalated': 'SLA_ESCALATION',
          'sla.breached': 'SLA_BREACHED',
        } as const;
        const recipients = new Set<string>();
        if (ticket.assigneeId) recipients.add(ticket.assigneeId);
        if (type === 'sla.escalated' || type === 'sla.breached') {
          if (ticket.team?.leadId) recipients.add(ticket.team.leadId);
          if (ticket.team?.managerId) recipients.add(ticket.team.managerId);
        }
        const breached = type === 'sla.breached';
        for (const recipientId of recipients) {
          items.push({
            recipientId,
            type: typeMap[type],
            title: breached
              ? `SLA breached on ${ticket.key}`
              : `SLA ${kind === 'RESPONSE' ? 'response' : 'resolution'} at risk on ${ticket.key}`,
            message: breached
              ? 'The SLA target was missed. Review the ticket now.'
              : 'The SLA target is close. Review the ticket now.',
            entityType: 'ticket',
            entityId: ticket.id,
            link: `/tickets/${ticket.key}`,
            dedupeKey: `${type}:${str('timerId') ?? ticket.id}:${recipientId}`,
          });
        }
        break;
      }
      case 'asset.assigned': {
        const userId = str('userId');
        if (!userId) break;
        const tag = str('tag') ?? '';
        items.push({
          recipientId: userId,
          type: 'ASSET_ASSIGNED',
          title: `Asset ${tag} assigned to you`,
          message: 'Company equipment has been assigned to your name.',
          entityType: 'asset',
          entityId: aggregateId,
          link: `/assets/${tag}`,
          dedupeKey: `asset.assigned:${aggregateId}:${userId}`,
        });
        break;
      }
      default:
        break;
    }

    if (items.length === 0) return;
    await tx.notification.createMany({
      data: items.map((item) => ({
        id: uuidv7(),
        recipientId: item.recipientId,
        type: item.type,
        title: item.title.slice(0, 200),
        message: item.message.slice(0, 1000),
        entityType: item.entityType,
        entityId: item.entityId,
        link: item.link,
        dedupeKey: item.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }

  // ───────── Queries ─────────

  async list(actor: AuthUser, options: { unread?: boolean; cursor?: string; limit: number }) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        recipientId: actor.id,
        ...(options.unread ? { readAt: null } : {}),
        ...(options.cursor ? { id: { lt: options.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: options.limit + 1,
    });
    const hasMore = notifications.length > options.limit;
    const page = hasMore ? notifications.slice(0, options.limit) : notifications;
    return {
      data: page.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entityType: notification.entityType,
        entityId: notification.entityId,
        link: notification.link,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
      meta: { nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async unreadCount(actor: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { recipientId: actor.id, readAt: null },
    });
    return { data: { count } };
  }

  async markRead(actor: AuthUser, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      // Already read or not owned: return success (idempotent) but verify ownership.
      const exists = await this.prisma.notification.count({ where: { id, recipientId: actor.id } });
      if (exists === 0) throw errors.notFound('NOT_FOUND', 'Notification not found.');
    }
    return { data: { success: true } };
  }

  async markAllRead(actor: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { recipientId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { success: true } };
  }

  // ───────── Preferences (NTF-5) ─────────

  private static readonly MANDATORY: NotificationType[] = ['SLA_BREACHED', 'INCIDENT_DECLARED'];

  async listPreferences(actor: AuthUser) {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId: actor.id },
    });
    const byType = new Map(stored.map((preference) => [preference.type, preference]));
    return {
      data: (Object.values(NotificationType) as NotificationType[]).map((type) => ({
        type,
        inApp: NotificationsService.MANDATORY.includes(type)
          ? true
          : (byType.get(type)?.inApp ?? true),
        email: byType.get(type)?.email ?? false,
      })),
    };
  }

  async updatePreferences(
    actor: AuthUser,
    input: { preferences: { type: NotificationType; inApp: boolean; email: boolean }[] },
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const preference of input.preferences) {
        const inApp = NotificationsService.MANDATORY.includes(preference.type)
          ? true
          : preference.inApp;
        await tx.notificationPreference.upsert({
          where: { userId_type: { userId: actor.id, type: preference.type } },
          update: { inApp, email: preference.email },
          create: { userId: actor.id, type: preference.type, inApp, email: preference.email },
        });
      }
    });
    return this.listPreferences(actor);
  }
}

import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const DEFAULT_REOPEN_WINDOW_DAYS = 7;

/** Scheduled ticket maintenance (TRD §8: `tickets` queue). */
@Injectable()
export class TicketJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Auto-closes resolved tickets whose reopen window has passed (TKT-13). */
  async autoCloseResolved(now: Date = new Date()): Promise<{ closed: number }> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'reopen_window_days' },
    });
    const windowDays =
      typeof setting?.value === 'number' ? setting.value : DEFAULT_REOPEN_WINDOW_DAYS;
    const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const tickets = await this.prisma.ticket.findMany({
      where: { status: 'RESOLVED', resolvedAt: { lte: cutoff } },
      select: { id: true, key: true, version: true },
      take: 500,
    });

    let closed = 0;
    for (const ticket of tickets) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.updateMany({
          where: { id: ticket.id, version: ticket.version, status: 'RESOLVED' },
          data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
        });
        if (updated.count === 0) return;
        closed += 1;

        await tx.ticketEvent.create({
          data: {
            id: uuidv7(),
            ticketId: ticket.id,
            type: 'CLOSED',
            metadata: { auto: true, reason: 'reopen_window_elapsed' },
          },
        });
        await this.audit.record(tx, {
          action: 'ticket.closed',
          entityType: 'ticket',
          entityId: ticket.id,
          entityKey: ticket.key,
          after: { status: 'CLOSED', auto: true },
        });
        await tx.outboxEvent.create({
          data: {
            id: uuidv7(),
            type: 'ticket.status_changed',
            aggregateType: 'ticket',
            aggregateId: ticket.id,
            payload: {
              ticketId: ticket.id,
              key: ticket.key,
              from: 'RESOLVED',
              to: 'CLOSED',
              auto: true,
            },
          },
        });
      });
    }
    return { closed };
  }
}

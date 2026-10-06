import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';

interface OutboxRow {
  id: string;
  type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;

/**
 * Transactional outbox dispatcher (TRD §4.3): polls unprocessed rows with
 * FOR UPDATE SKIP LOCKED and fans them out to notification recipients.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async dispatchBatch(): Promise<{ processed: number }> {
    const processed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, type, aggregate_id, payload, attempts
        FROM outbox_events
        WHERE processed_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      let handled = 0;
      for (const row of rows) {
        try {
          await this.notifications.handleEvent(tx, row.type, row.payload, row.aggregate_id);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { processedAt: new Date(), attempts: { increment: 1 } },
          });
          handled += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts: { increment: 1 },
              lastError: String(error).slice(0, 500),
              // Poison messages stop being retried after MAX_ATTEMPTS.
              ...(attempts >= MAX_ATTEMPTS ? { processedAt: new Date() } : {}),
            },
          });
          this.logger.warn(`Outbox event ${row.id} (${row.type}) failed: ${String(error)}`);
        }
      }
      return handled;
    });
    return { processed };
  }
}

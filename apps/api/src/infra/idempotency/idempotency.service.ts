import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredIdempotentResponse {
  statusCode: number;
  response: Prisma.JsonValue;
}

/** Idempotency-Key storage (TRD §4.5). Keys are scoped per user + route. */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async find(
    userId: string,
    route: string,
    key: string,
  ): Promise<StoredIdempotentResponse | null> {
    const row = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!row || row.userId !== userId || row.route !== route) return null;
    return { statusCode: row.statusCode, response: row.response };
  }

  /** ponytail: fire-and-forget; a concurrent duplicate may double-run the handler, response stays consistent. */
  async store(
    userId: string,
    route: string,
    key: string,
    statusCode: number,
    response: unknown,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          userId,
          route,
          statusCode,
          response: (response ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.debug(`Idempotency key not stored (${key}): ${String(error)}`);
    }
  }
}

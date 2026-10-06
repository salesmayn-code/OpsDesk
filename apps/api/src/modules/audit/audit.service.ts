import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { currentContext } from '../../common/request-context';
import { uuidv7 } from '../../common/id';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityKey?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  actorId?: string | null;
  actorEmail?: string | null;
}

const REDACTED_KEYS = new Set([
  'passwordHash',
  'password',
  'newPassword',
  'token',
  'tokenHash',
  'refreshToken',
  'refreshTokenHash',
]);

function redact(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REDACTED_KEYS.has(key)) continue;
    out[key] = entry === undefined ? null : entry;
  }
  return out as Prisma.InputJsonValue;
}

/** Append-only audit writer (TRD §9). Always called inside the use-case transaction. */
@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    const ctx = currentContext();
    await tx.auditLog.create({
      data: {
        id: uuidv7(),
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        entityKey: entry.entityKey ?? null,
        before: redact(entry.before),
        after: redact(entry.after),
        metadata: redact(entry.metadata),
        actorId: entry.actorId !== undefined ? entry.actorId : (ctx?.actorId ?? null),
        actorEmail: entry.actorEmail !== undefined ? entry.actorEmail : (ctx?.actorEmail ?? null),
        requestId: ctx?.requestId ?? null,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent?.slice(0, 300) ?? null,
      },
    });
  }
}

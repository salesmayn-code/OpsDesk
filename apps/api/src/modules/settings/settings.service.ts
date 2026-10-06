import { Injectable } from '@nestjs/common';
import type { UpdateSettingsInput } from '@opsdesk/contracts';
import { errors } from '../../common/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Runtime organization settings (TRD §15), admin-managed and audited. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const rows = await this.prisma.setting.findMany();
    return {
      data: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    };
  }

  async update(input: UpdateSettingsInput) {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return this.get();

    if (input.default_sla_policy_id) {
      const policy = await this.prisma.slaPolicy.findUnique({
        where: { id: input.default_sla_policy_id },
      });
      if (!policy) throw errors.notFound('SLA_POLICY_NOT_FOUND', 'SLA policy not found.');
    }
    if (input.default_calendar_id) {
      const calendar = await this.prisma.businessCalendar.findUnique({
        where: { id: input.default_calendar_id },
      });
      if (!calendar) throw errors.notFound('NOT_FOUND', 'Business calendar not found.');
    }

    const before = Object.fromEntries(
      (await this.prisma.setting.findMany({ where: { key: { in: entries.map(([key]) => key) } } })).map(
        (row) => [row.key, row.value],
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.setting.upsert({
          where: { key },
          update: { value: value as never },
          create: { key, value: value as never },
        });
      }
      await this.audit.record(tx, {
        action: 'settings.updated',
        entityType: 'setting',
        before,
        after: input as Record<string, unknown>,
      });
    });

    return this.get();
  }
}

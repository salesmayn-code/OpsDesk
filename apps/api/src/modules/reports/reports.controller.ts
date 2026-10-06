import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { REPORT_KEYS, reportQuerySchema, type ReportKey } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { errors } from '../../common/errors';

class ReportQueryDto extends createZodDto(reportQuerySchema) {}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':reportKey')
  @RequirePermissions('reports:view')
  async report(
    @Param('reportKey') reportKey: string,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!REPORT_KEYS.includes(reportKey as ReportKey)) {
      throw errors.notFound('REPORT_NOT_FOUND', 'Unknown report.');
    }
    const result = await this.reports.report(reportKey as ReportKey, query);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportKey}.csv"`);
      return this.reports.toCsv(result.rows as unknown as Record<string, unknown>[]);
    }
    return {
      data: result.rows,
      meta: { reportKey, from: result.from.toISOString(), to: result.to.toISOString() },
    };
  }
}

import { z } from 'zod';

export const REPORT_KEYS = [
  'volume',
  'sla-compliance',
  'breaches',
  'categories',
  'response-times',
] as const;
export const reportKeySchema = z.enum(REPORT_KEYS);
export type ReportKey = z.infer<typeof reportKeySchema>;

export const reportQuerySchema = z.strictObject({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

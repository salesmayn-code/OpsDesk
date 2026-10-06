import { z } from 'zod';

/** Runtime org settings (TRD §15). */
export const settingsSchema = z.strictObject({
  reopen_window_days: z.number().int().min(0).max(365),
  auto_close_enabled: z.boolean(),
  default_sla_policy_id: z.uuid(),
  default_calendar_id: z.uuid(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

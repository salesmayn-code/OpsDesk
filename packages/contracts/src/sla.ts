import { z } from 'zod';
import { prioritySchema, slaEventTypeSchema, ticketStatusSchema, ticketTypeSchema } from './enums';
import { uuidSchema } from './common';

export const businessCalendarSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  is24x7: z.boolean(),
  schedule: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      start: z.string(),
      end: z.string(),
    }),
  ),
  holidays: z.array(z.object({ date: z.string(), name: z.string() })),
});
export type BusinessCalendar = z.infer<typeof businessCalendarSchema>;

export const upsertBusinessCalendarSchema = z.strictObject({
  name: z.string().min(1).max(100),
  timezone: z.string().min(1).max(64),
  is24x7: z.boolean().default(false),
  schedule: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
  holidays: z
    .array(z.object({ date: z.iso.date(), name: z.string().min(1).max(100) }))
    .optional(),
});
export type UpsertBusinessCalendarInput = z.infer<typeof upsertBusinessCalendarSchema>;

export const slaPolicySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priority: prioritySchema.nullable(),
  ticketType: ticketTypeSchema.nullable(),
  categoryId: uuidSchema.nullable(),
  calendarId: uuidSchema,
  firstResponseMinutes: z.number().int(),
  resolutionMinutes: z.number().int(),
  warningPercent: z.number().int(),
  escalationPercent: z.number().int(),
  pauseOnStatuses: z.array(ticketStatusSchema),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type SlaPolicy = z.infer<typeof slaPolicySchema>;

export const createSlaPolicySchema = z.strictObject({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  priority: prioritySchema.nullable().optional(),
  ticketType: ticketTypeSchema.nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  calendarId: uuidSchema,
  firstResponseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
  warningPercent: z.number().int().min(1).max(99).default(75),
  escalationPercent: z.number().int().min(1).max(99).default(90),
  pauseOnStatuses: z.array(ticketStatusSchema).default(['WAITING_FOR_USER']),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CreateSlaPolicyInput = z.infer<typeof createSlaPolicySchema>;

export const updateSlaPolicySchema = createSlaPolicySchema.partial().extend({
  name: z.string().min(1).max(100).optional(),
});
export type UpdateSlaPolicyInput = z.infer<typeof updateSlaPolicySchema>;

export const slaPreviewSchema = z.strictObject({
  priority: prioritySchema,
  type: ticketTypeSchema,
  categoryId: uuidSchema.nullable().optional(),
  createdAt: z.iso.datetime().optional(),
});
export type SlaPreviewInput = z.infer<typeof slaPreviewSchema>;

export const slaEventSchema = z.object({
  id: z.uuid(),
  timerId: z.uuid(),
  ticketId: z.uuid(),
  type: slaEventTypeSchema,
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type SlaEvent = z.infer<typeof slaEventSchema>;

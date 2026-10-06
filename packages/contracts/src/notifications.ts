import { z } from 'zod';
import { notificationTypeSchema } from './enums';
import { uuidSchema } from './common';

export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  entityType: z.string().nullable(),
  entityId: uuidSchema.nullable(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const NOTIFICATION_SENSITIVE_TYPES = ['SLA_BREACHED', 'INCIDENT_DECLARED'] as const;

export const notificationPreferenceSchema = z.strictObject({
  type: notificationTypeSchema,
  inApp: z.boolean(),
  email: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const putNotificationPreferencesSchema = z.strictObject({
  preferences: z.array(notificationPreferenceSchema).max(30),
});
export type PutNotificationPreferencesInput = z.infer<typeof putNotificationPreferencesSchema>;

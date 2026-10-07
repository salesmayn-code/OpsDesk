import { z } from 'zod';
import { permissionKeySchema } from './permissions';
import { userStatusSchema } from './enums';

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128);

export const loginSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.strictObject({
  email: z.email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.strictObject({
  token: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z.strictObject({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const registerSchema = z.strictObject({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email(),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const roleSummarySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

export const meSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  status: userStatusSchema,
  timezone: z.string(),
  departmentId: z.uuid().nullable(),
  departmentName: z.string().nullable(),
  roles: z.array(roleSummarySchema),
  permissions: z.array(permissionKeySchema),
  teamIds: z.array(z.uuid()),
});
export type Me = z.infer<typeof meSchema>;

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

import { z } from 'zod';
import { userStatusSchema } from './enums';
import { paginationQuerySchema } from './pagination';
import { uuidSchema } from './common';

export const userSummarySchema = z.object({
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
  roles: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string() })),
  teamIds: z.array(z.uuid()),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const inviteUserSchema = z.strictObject({
  email: z.email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  jobTitle: z.string().max(120).optional(),
  departmentId: uuidSchema.optional(),
  managerId: uuidSchema.optional(),
  roleIds: z.array(uuidSchema).min(1),
  teamIds: z.array(uuidSchema).default([]),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.strictObject({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  departmentId: uuidSchema.nullable().optional(),
  managerId: uuidSchema.nullable().optional(),
  timezone: z.string().max(64).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateProfileSchema = z.strictObject({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  timezone: z.string().max(64).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changeUserStatusSchema = z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
  reason: z.string().max(500).optional(),
});
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;

export const updateUserRolesSchema = z.strictObject({
  roleIds: z.array(uuidSchema).min(1),
});
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;

export const userQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(100).optional(),
  status: userStatusSchema.optional(),
  role: z.string().max(50).optional(),
  departmentId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  sort: z.string().max(50).optional(),
});
export type UserQuery = z.infer<typeof userQuerySchema>;

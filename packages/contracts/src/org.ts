import { z } from 'zod';
import { uuidSchema } from './common';

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  headId: uuidSchema.nullable(),
  archivedAt: z.string().nullable(),
  memberCount: z.number().int(),
});
export type Department = z.infer<typeof departmentSchema>;

export const createDepartmentSchema = z.strictObject({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  headId: uuidSchema.nullable().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
  headId: uuidSchema.nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const teamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  email: z.string().nullable(),
  leadId: uuidSchema.nullable(),
  managerId: uuidSchema.nullable(),
  archivedAt: z.string().nullable(),
  memberCount: z.number().int(),
});
export type Team = z.infer<typeof teamSchema>;

export const createTeamSchema = z.strictObject({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  email: z.email().optional(),
  leadId: uuidSchema.nullable().optional(),
  managerId: uuidSchema.nullable().optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  email: z.email().nullable().optional(),
  leadId: uuidSchema.nullable().optional(),
  managerId: uuidSchema.nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const setTeamMembersSchema = z.strictObject({
  userIds: z.array(uuidSchema),
  leadId: uuidSchema.nullable().optional(),
});
export type SetTeamMembersInput = z.infer<typeof setTeamMembersSchema>;

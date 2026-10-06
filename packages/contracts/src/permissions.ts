import { z } from 'zod';

export const PERMISSION_KEYS = [
  'ticket:create',
  'ticket:view',
  'ticket:view_team',
  'ticket:view_all',
  'ticket:view_internal',
  'ticket:update',
  'ticket:triage',
  'ticket:assign',
  'ticket:reassign',
  'ticket:resolve',
  'ticket:reopen',
  'ticket:close',
  'ticket:cancel',
  'ticket:delete',
  'ticket:comment_internal',
  'ticket:admin_override',
  'attachment:upload',
  'attachment:delete',
  'asset:view',
  'asset:view_all',
  'asset:create',
  'asset:update',
  'asset:assign',
  'asset:retire',
  'asset:dispose',
  'category:manage',
  'asset_type:manage',
  'sla:manage',
  'incident:create',
  'incident:view',
  'incident:manage',
  'incident:close',
  'postmortem:manage',
  'change:create',
  'change:view',
  'change:update',
  'change:approve',
  'change:implement',
  'workflow:create',
  'workflow:view',
  'workflow:manage',
  'kb:view',
  'kb:create',
  'kb:publish',
  'user:view',
  'user:create',
  'user:update',
  'user:disable',
  'role:manage',
  'team:manage',
  'department:manage',
  'audit:view',
  'reports:view',
  'settings:manage',
] as const;

export const permissionKeySchema = z.enum(PERMISSION_KEYS);
export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const roleKeySchema = z.enum(['EMPLOYEE', 'AGENT', 'MANAGER', 'ADMIN']);
export type RoleKey = z.infer<typeof roleKeySchema>;

export const updateRolePermissionsSchema = z.strictObject({
  permissionKeys: z.array(permissionKeySchema),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

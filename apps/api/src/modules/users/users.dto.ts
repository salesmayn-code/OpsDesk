import { inviteUserSchema, updateUserSchema, userQuerySchema } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class UserQueryDto extends createZodDto(userQuerySchema) {}
export class InviteUserDto extends createZodDto(inviteUserSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class ChangeUserStatusDto extends createZodDto(
  z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']), reason: z.string().max(500).optional() }).strict(),
) {}
export class UpdateUserRolesDto extends createZodDto(
  z.object({ roleIds: z.array(z.uuid()).min(1) }).strict(),
) {}
export class UpdateProfileDto extends createZodDto(
  z
    .object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().max(30).nullable().optional(),
      timezone: z.string().max(64).optional(),
    })
    .strict(),
) {}

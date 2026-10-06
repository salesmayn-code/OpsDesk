import {
  createDepartmentSchema,
  createTeamSchema,
  setTeamMembersSchema,
  updateDepartmentSchema,
  updateTeamSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateDepartmentDto extends createZodDto(createDepartmentSchema) {}
export class UpdateDepartmentDto extends createZodDto(updateDepartmentSchema) {}
export class CreateTeamDto extends createZodDto(createTeamSchema) {}
export class UpdateTeamDto extends createZodDto(updateTeamSchema) {}
export class SetTeamMembersDto extends createZodDto(setTeamMembersSchema) {}

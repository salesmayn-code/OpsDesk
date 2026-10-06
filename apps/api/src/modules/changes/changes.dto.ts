import {
  changeQuerySchema,
  changeTransitionSchema,
  createChangeSchema,
  putChangeApprovalRulesSchema,
  recordApprovalSchema,
  updateChangeSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class ChangeQueryDto extends createZodDto(changeQuerySchema) {}
export class CreateChangeDto extends createZodDto(createChangeSchema) {}
export class UpdateChangeDto extends createZodDto(updateChangeSchema) {}
export class ChangeTransitionDto extends createZodDto(changeTransitionSchema) {}
export class RecordApprovalDto extends createZodDto(recordApprovalSchema) {}
export class PutChangeApprovalRulesDto extends createZodDto(putChangeApprovalRulesSchema) {}

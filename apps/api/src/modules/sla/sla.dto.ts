import {
  createSlaPolicySchema,
  slaPreviewSchema,
  upsertBusinessCalendarSchema,
  updateSlaPolicySchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateSlaPolicyDto extends createZodDto(createSlaPolicySchema) {}
export class UpdateSlaPolicyDto extends createZodDto(updateSlaPolicySchema) {}
export class SlaPreviewDto extends createZodDto(slaPreviewSchema) {}
export class UpsertCalendarDto extends createZodDto(upsertBusinessCalendarSchema) {}

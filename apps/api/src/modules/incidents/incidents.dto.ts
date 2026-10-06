import {
  createIncidentSchema,
  createPostmortemActionSchema,
  createServiceSchema,
  incidentNoteSchema,
  incidentQuerySchema,
  incidentTransitionSchema,
  linkIncidentTicketsSchema,
  notifyRequestersSchema,
  updateIncidentSchema,
  updatePostmortemActionSchema,
  upsertPostmortemSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class IncidentQueryDto extends createZodDto(incidentQuerySchema) {}
export class CreateIncidentDto extends createZodDto(createIncidentSchema) {}
export class UpdateIncidentDto extends createZodDto(updateIncidentSchema) {}
export class IncidentTransitionDto extends createZodDto(incidentTransitionSchema) {}
export class IncidentNoteDto extends createZodDto(incidentNoteSchema) {}
export class LinkIncidentTicketsDto extends createZodDto(linkIncidentTicketsSchema) {}
export class NotifyRequestersDto extends createZodDto(notifyRequestersSchema) {}
export class UpsertPostmortemDto extends createZodDto(upsertPostmortemSchema) {}
export class CreatePostmortemActionDto extends createZodDto(createPostmortemActionSchema) {}
export class UpdatePostmortemActionDto extends createZodDto(updatePostmortemActionSchema) {}
export class CreateServiceDto extends createZodDto(createServiceSchema) {}
export class LinkTicketIncidentDto extends createZodDto(
  z.strictObject({ incidentId: z.uuid() }),
) {}

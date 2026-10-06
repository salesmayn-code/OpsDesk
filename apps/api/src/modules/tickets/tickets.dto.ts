import {
  assignTicketSchema,
  createTicketSchema,
  transitionTicketSchema,
  updateTicketSchema,
} from '@opsdesk/contracts';
import { ticketQuerySchema } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class TicketQueryDto extends createZodDto(ticketQuerySchema) {}
export class CreateTicketDto extends createZodDto(createTicketSchema) {}
export class UpdateTicketDto extends createZodDto(updateTicketSchema) {}
export class TransitionTicketDto extends createZodDto(transitionTicketSchema) {}
export class AssignTicketDto extends createZodDto(assignTicketSchema) {}

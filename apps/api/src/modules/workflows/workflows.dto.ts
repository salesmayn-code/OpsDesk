import {
  createWorkflowRequestSchema,
  createWorkflowTemplateSchema,
  taskTransitionSchema,
  updateWorkflowTaskSchema,
  updateWorkflowTemplateSchema,
  workflowQuerySchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkflowRequestDto extends createZodDto(createWorkflowRequestSchema) {}
export class WorkflowQueryDto extends createZodDto(workflowQuerySchema) {}
export class TaskTransitionDto extends createZodDto(taskTransitionSchema) {}
export class UpdateWorkflowTaskDto extends createZodDto(updateWorkflowTaskSchema) {}
export class CreateWorkflowTemplateDto extends createZodDto(createWorkflowTemplateSchema) {}
export class UpdateWorkflowTemplateDto extends createZodDto(updateWorkflowTemplateSchema) {}

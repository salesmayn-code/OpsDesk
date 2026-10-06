import { Module } from '@nestjs/common';
import {
  OffboardingController,
  OnboardingController,
  WorkflowTasksController,
  WorkflowTemplatesController,
} from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  controllers: [
    OnboardingController,
    OffboardingController,
    WorkflowTasksController,
    WorkflowTemplatesController,
  ],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}

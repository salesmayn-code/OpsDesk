import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { WorkflowKind } from '@opsdesk/contracts';
import {
  CreateWorkflowRequestDto,
  CreateWorkflowTemplateDto,
  TaskTransitionDto,
  UpdateWorkflowTaskDto,
  UpdateWorkflowTemplateDto,
  WorkflowQueryDto,
} from './workflows.dto';
import { WorkflowsService } from './workflows.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

abstract class WorkflowControllerBase {
  constructor(
    protected readonly workflows: WorkflowsService,
    protected readonly kind: WorkflowKind,
  ) {}

  list(query: WorkflowQueryDto, actor: AuthUser) {
    return this.workflows.list(this.kind, query, actor);
  }

  create(body: CreateWorkflowRequestDto, actor: AuthUser) {
    return this.workflows.createRequest(this.kind, body, actor);
  }

  getById(id: string, actor: AuthUser) {
    return this.workflows.getRequest(id, actor);
  }
}

@Controller('onboarding')
export class OnboardingController extends WorkflowControllerBase {
  constructor(workflows: WorkflowsService) {
    super(workflows, 'ONBOARDING');
  }

  @Get()
  @RequirePermissions('workflow:view')
  override list(@Query() query: WorkflowQueryDto, @CurrentUser() actor: AuthUser) {
    return super.list(query, actor);
  }

  @Post()
  @RequirePermissions('workflow:create')
  override create(@Body() body: CreateWorkflowRequestDto, @CurrentUser() actor: AuthUser) {
    return super.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('workflow:view')
  override getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return super.getById(id, actor);
  }
}

@Controller('offboarding')
export class OffboardingController extends WorkflowControllerBase {
  constructor(workflows: WorkflowsService) {
    super(workflows, 'OFFBOARDING');
  }

  @Get()
  @RequirePermissions('workflow:view')
  override list(@Query() query: WorkflowQueryDto, @CurrentUser() actor: AuthUser) {
    return super.list(query, actor);
  }

  @Post()
  @RequirePermissions('workflow:create')
  override create(@Body() body: CreateWorkflowRequestDto, @CurrentUser() actor: AuthUser) {
    return super.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('workflow:view')
  override getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return super.getById(id, actor);
  }
}

@Controller('workflow-tasks')
export class WorkflowTasksController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Patch(':id')
  @RequirePermissions('workflow:view')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWorkflowTaskDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.workflows.updateTask(id, body, actor);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @RequirePermissions('workflow:view')
  transition(
    @Param('id') id: string,
    @Body() body: TaskTransitionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.workflows.transitionTask(id, body, actor);
  }
}

@Controller('workflow-templates')
export class WorkflowTemplatesController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @RequirePermissions('workflow:view')
  list(@Query('kind') kind?: WorkflowKind) {
    return this.workflows.listTemplates(kind);
  }

  @Post()
  @RequirePermissions('workflow:manage')
  create(@Body() body: CreateWorkflowTemplateDto, @CurrentUser() actor: AuthUser) {
    return this.workflows.createTemplate(body, actor);
  }

  @Patch(':id')
  @RequirePermissions('workflow:manage')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWorkflowTemplateDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.workflows.updateTemplate(id, body, actor);
  }
}

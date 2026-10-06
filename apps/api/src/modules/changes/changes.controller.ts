import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ChangeQueryDto,
  ChangeTransitionDto,
  CreateChangeDto,
  PutChangeApprovalRulesDto,
  RecordApprovalDto,
  UpdateChangeDto,
} from './changes.dto';
import { ChangesService } from './changes.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller()
export class ChangesController {
  constructor(private readonly changes: ChangesService) {}

  @Get('changes')
  @RequirePermissions('change:view')
  list(@Query() query: ChangeQueryDto, @CurrentUser() actor: AuthUser) {
    return this.changes.list(query, actor);
  }

  @Post('changes')
  @RequirePermissions('change:create')
  create(@Body() body: CreateChangeDto, @CurrentUser() actor: AuthUser) {
    return this.changes.create(body, actor);
  }

  @Get('changes/calendar')
  @RequirePermissions('change:view')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    const now = new Date();
    return this.changes.calendar(
      from ?? now.toISOString(),
      to ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }

  @Get('change-approval-rules')
  @RequirePermissions('change:view')
  getRules() {
    return this.changes.getRules();
  }

  @Put('change-approval-rules')
  @RequirePermissions('settings:manage')
  putRules(@Body() body: PutChangeApprovalRulesDto, @CurrentUser() actor: AuthUser) {
    return this.changes.putRules(body, actor);
  }

  @Get('changes/:id')
  @RequirePermissions('change:view')
  getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.changes.getDetail(id, actor);
  }

  @Patch('changes/:id')
  @RequirePermissions('change:update')
  update(@Param('id') id: string, @Body() body: UpdateChangeDto, @CurrentUser() actor: AuthUser) {
    return this.changes.update(id, body, actor);
  }

  @Post('changes/:id/submit')
  @HttpCode(200)
  @RequirePermissions('change:view')
  submit(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.changes.submit(id, actor);
  }

  @Post('changes/:id/transitions')
  @HttpCode(200)
  @RequirePermissions('change:view')
  transition(
    @Param('id') id: string,
    @Body() body: ChangeTransitionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.changes.transition(id, body, actor);
  }

  @Get('changes/:id/approvals')
  @RequirePermissions('change:view')
  async approvals(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const detail = await this.changes.getDetail(id, actor);
    return { data: detail.data.approvals };
  }

  @Post('changes/:id/approvals')
  @RequirePermissions('change:approve')
  recordApproval(
    @Param('id') id: string,
    @Body() body: RecordApprovalDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.changes.recordApproval(id, body, actor);
  }

  @Get('changes/:id/history')
  @RequirePermissions('change:view')
  history(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.changes.history(id, actor);
  }
}

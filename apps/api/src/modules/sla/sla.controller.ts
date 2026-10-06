import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  CreateSlaPolicyDto,
  SlaPreviewDto,
  UpdateSlaPolicyDto,
  UpsertCalendarDto,
} from './sla.dto';
import { SlaService } from './sla.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller()
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('sla-policies')
  @RequirePermissions('sla:manage')
  listPolicies() {
    return this.sla.listPolicies();
  }

  @Post('sla-policies')
  @RequirePermissions('sla:manage')
  createPolicy(@Body() body: CreateSlaPolicyDto) {
    return this.sla.createPolicy(body);
  }

  @Patch('sla-policies/:id')
  @RequirePermissions('sla:manage')
  updatePolicy(@Param('id') id: string, @Body() body: UpdateSlaPolicyDto) {
    return this.sla.updatePolicy(id, body);
  }

  @Post('sla-policies/preview')
  @HttpCode(200)
  @RequirePermissions('sla:manage')
  preview(@Body() body: SlaPreviewDto) {
    return this.sla.preview(body);
  }

  @Get('business-calendars')
  @RequirePermissions('sla:manage')
  listCalendars() {
    return this.sla.listCalendars();
  }

  @Post('business-calendars')
  @RequirePermissions('sla:manage')
  createCalendar(@Body() body: UpsertCalendarDto) {
    return this.sla.createCalendar(body);
  }

  @Get('tickets/:id/sla')
  @RequirePermissions('ticket:view')
  getTicketSla(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.sla.getTicketSla(id, actor);
  }
}

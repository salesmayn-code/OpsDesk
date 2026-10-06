import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('employee')
  @RequirePermissions('ticket:view')
  employee(@CurrentUser() actor: AuthUser) {
    return this.dashboard.employee(actor);
  }

  @Get('agent')
  @RequirePermissions('ticket:view_team')
  agent(@CurrentUser() actor: AuthUser) {
    return this.dashboard.agent(actor);
  }

  @Get('manager')
  @RequirePermissions('ticket:view_all')
  manager(@CurrentUser() actor: AuthUser) {
    return this.dashboard.manager(actor);
  }

  @Get('admin')
  @RequirePermissions('settings:manage')
  admin(@CurrentUser() actor: AuthUser) {
    return this.dashboard.admin(actor);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CreateTeamDto, SetTeamMembersDto, UpdateTeamDto } from './org.dto';
import { OrgService } from './org.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('teams')
export class TeamsController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('user:view')
  list() {
    return this.orgService.listTeams();
  }

  @Get(':id')
  @RequirePermissions('user:view')
  getById(@Param('id') id: string) {
    return this.orgService.getTeam(id);
  }

  @Post()
  @RequirePermissions('team:manage')
  create(@Body() body: CreateTeamDto) {
    return this.orgService.createTeam(body);
  }

  @Patch(':id')
  @RequirePermissions('team:manage')
  update(@Param('id') id: string, @Body() body: UpdateTeamDto) {
    return this.orgService.updateTeam(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('team:manage')
  async remove(@Param('id') id: string) {
    await this.orgService.deleteTeam(id);
  }

  @Put(':id/members')
  @RequirePermissions('team:manage')
  setMembers(@Param('id') id: string, @Body() body: SetTeamMembersDto) {
    return this.orgService.setTeamMembers(id, body);
  }
}

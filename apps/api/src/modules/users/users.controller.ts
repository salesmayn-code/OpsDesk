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
  ChangeUserStatusDto,
  InviteUserDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserRolesDto,
  UserQueryDto,
} from './users.dto';
import { UsersService } from './users.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('user:view')
  async list(@Query() query: UserQueryDto) {
    return this.usersService.list(query);
  }

  @Post()
  @RequirePermissions('user:create')
  async invite(@Body() body: InviteUserDto, @CurrentUser() actor: AuthUser) {
    return { data: await this.usersService.invite(body, actor) };
  }

  @Get('me')
  async me(@CurrentUser() actor: AuthUser) {
    return { data: await this.usersService.getById(actor.id) };
  }

  @Patch('me')
  async updateMe(@Body() body: UpdateProfileDto, @CurrentUser() actor: AuthUser) {
    return { data: await this.usersService.updateProfile(actor.id, body) };
  }

  @Get(':id')
  @RequirePermissions('user:view')
  async getById(@Param('id') id: string) {
    return { data: await this.usersService.getById(id) };
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return { data: await this.usersService.update(id, body) };
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions('user:disable')
  async changeStatus(@Param('id') id: string, @Body() body: ChangeUserStatusDto) {
    return { data: await this.usersService.changeStatus(id, body.status, body.reason) };
  }

  @Put(':id/roles')
  @RequirePermissions('role:manage')
  async updateRoles(@Param('id') id: string, @Body() body: UpdateUserRolesDto) {
    return { data: await this.usersService.updateRoles(id, body.roleIds) };
  }
}

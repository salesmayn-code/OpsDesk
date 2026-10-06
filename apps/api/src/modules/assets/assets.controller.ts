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
import {
  AssetQueryDto,
  AssetTransitionDto,
  AssignAssetDto,
  CreateAssetDto,
  UnassignAssetDto,
  UpdateAssetDto,
} from './assets.dto';
import { AssetsService } from './assets.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions('asset:view')
  list(@Query() query: AssetQueryDto, @CurrentUser() actor: AuthUser) {
    return this.assets.list(query, actor);
  }

  @Post()
  @RequirePermissions('asset:create')
  async create(@Body() body: CreateAssetDto, @CurrentUser() actor: AuthUser) {
    return this.assets.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('asset:view')
  getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.assets.getDetail(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('asset:update')
  update(@Param('id') id: string, @Body() body: UpdateAssetDto, @CurrentUser() actor: AuthUser) {
    return this.assets.update(id, body, actor);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions('asset:assign')
  assign(@Param('id') id: string, @Body() body: AssignAssetDto, @CurrentUser() actor: AuthUser) {
    return this.assets.assign(id, body, actor);
  }

  @Post(':id/unassign')
  @HttpCode(200)
  @RequirePermissions('asset:assign')
  unassign(
    @Param('id') id: string,
    @Body() body: UnassignAssetDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.assets.unassign(id, body, actor);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @RequirePermissions('asset:view')
  transition(
    @Param('id') id: string,
    @Body() body: AssetTransitionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.assets.transition(id, body, actor);
  }

  @Get(':id/history')
  @RequirePermissions('asset:view')
  history(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.assets.history(id, actor);
  }

  @Get(':id/assignments')
  @RequirePermissions('asset:view')
  async assignments(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const detail = await this.assets.getDetail(id, actor);
    return { data: detail.data.assignments };
  }

  @Get(':id/tickets')
  @RequirePermissions('asset:view')
  tickets(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.assets.tickets(id, actor);
  }
}

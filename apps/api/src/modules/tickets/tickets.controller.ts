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
  AssignTicketDto,
  CreateTicketDto,
  TicketQueryDto,
  TransitionTicketDto,
  UpdateTicketDto,
} from './tickets.dto';
import { TicketsService } from './tickets.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermissions('ticket:view')
  async list(@Query() query: TicketQueryDto, @CurrentUser() actor: AuthUser) {
    return this.tickets.list(query, actor);
  }

  @Post()
  @RequirePermissions('ticket:create')
  async create(@Body() body: CreateTicketDto, @CurrentUser() actor: AuthUser) {
    return { data: await this.tickets.create(body, actor) };
  }

  @Get(':id')
  @RequirePermissions('ticket:view')
  async getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return { data: await this.tickets.getDetail(id, actor) };
  }

  @Patch(':id')
  @RequirePermissions('ticket:update')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTicketDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return { data: await this.tickets.update(id, body, actor) };
  }

  @Get(':id/allowed-transitions')
  @RequirePermissions('ticket:view')
  async allowedTransitions(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.tickets.getAllowedTransitions(id, actor);
  }

  @Get(':id/history')
  @RequirePermissions('ticket:view')
  async history(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.tickets.history(id, actor);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  async transition(
    @Param('id') id: string,
    @Body() body: TransitionTicketDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return { data: await this.tickets.transition(id, body, actor) };
  }

  @Post(':id/assignment')
  @HttpCode(200)
  @RequirePermissions('ticket:assign')
  async assign(
    @Param('id') id: string,
    @Body() body: AssignTicketDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return { data: await this.tickets.assign(id, body, actor) };
  }
}

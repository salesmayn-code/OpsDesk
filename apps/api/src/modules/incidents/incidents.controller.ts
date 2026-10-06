import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CreateIncidentDto,
  CreatePostmortemActionDto,
  CreateServiceDto,
  IncidentNoteDto,
  IncidentQueryDto,
  IncidentTransitionDto,
  LinkIncidentTicketsDto,
  LinkTicketIncidentDto,
  NotifyRequestersDto,
  UpdateIncidentDto,
  UpdatePostmortemActionDto,
  UpsertPostmortemDto,
} from './incidents.dto';
import { IncidentsService } from './incidents.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions('incident:view')
  list(@Query() query: IncidentQueryDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.list(query, actor);
  }

  @Post()
  @RequirePermissions('incident:create')
  create(@Body() body: CreateIncidentDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.create(body, actor);
  }

  @Get(':id')
  @RequirePermissions('incident:view')
  getById(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.incidents.getDetail(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('incident:manage')
  update(@Param('id') id: string, @Body() body: UpdateIncidentDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.update(id, body, actor);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @RequirePermissions('incident:view')
  transition(
    @Param('id') id: string,
    @Body() body: IncidentTransitionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.transition(id, body, actor);
  }

  @Get(':id/timeline')
  @RequirePermissions('incident:view')
  timeline(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.incidents.timeline(id, actor);
  }

  @Post(':id/timeline')
  @RequirePermissions('incident:create')
  addNote(
    @Param('id') id: string,
    @Body() body: IncidentNoteDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.addNote(id, body, actor);
  }

  @Post(':id/tickets')
  @RequirePermissions('incident:manage')
  linkTickets(
    @Param('id') id: string,
    @Body() body: LinkIncidentTicketsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.linkTickets(id, body, actor);
  }

  @Delete(':id/tickets/:ticketId')
  @RequirePermissions('incident:manage')
  unlinkTicket(
    @Param('id') id: string,
    @Param('ticketId') ticketId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.unlinkTicket(id, ticketId, actor);
  }

  @Post(':id/notify-requesters')
  @HttpCode(200)
  @RequirePermissions('incident:manage')
  notifyRequesters(
    @Param('id') id: string,
    @Body() body: NotifyRequestersDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.notifyRequesters(id, body.message, actor);
  }

  @Get(':id/postmortem')
  @RequirePermissions('incident:view')
  getPostmortem(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.incidents.getPostmortem(id, actor);
  }

  @Put(':id/postmortem')
  @RequirePermissions('postmortem:manage')
  upsertPostmortem(
    @Param('id') id: string,
    @Body() body: UpsertPostmortemDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.upsertPostmortem(id, body, actor);
  }

  @Post(':id/postmortem/publish')
  @HttpCode(200)
  @RequirePermissions('postmortem:manage')
  publishPostmortem(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.incidents.publishPostmortem(id, actor);
  }

  @Post(':id/postmortem/actions')
  @RequirePermissions('postmortem:manage')
  createAction(
    @Param('id') id: string,
    @Body() body: CreatePostmortemActionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.createAction(id, body, actor);
  }

  @Patch(':id/postmortem/actions/:actionId')
  @RequirePermissions('postmortem:manage')
  updateAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() body: UpdatePostmortemActionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.updateAction(id, actionId, body, actor);
  }
}

@Controller('services')
export class ServicesController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions('incident:view')
  list() {
    return this.incidents.listServices();
  }

  @Post()
  @RequirePermissions('incident:manage')
  create(@Body() body: CreateServiceDto, @CurrentUser() actor: AuthUser) {
    return this.incidents.createService(body, actor);
  }
}

/** Link an incident from the ticket side (TRD §10.3). */
@Controller('tickets/:id/incident')
export class TicketIncidentController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  @RequirePermissions('incident:manage')
  link(
    @Param('id') ticketId: string,
    @Body() body: LinkTicketIncidentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.incidents.linkTickets(body.incidentId, { ticketIds: [ticketId] }, actor);
  }
}

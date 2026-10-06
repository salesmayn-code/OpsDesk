import { Module } from '@nestjs/common';
import {
  IncidentsController,
  ServicesController,
  TicketIncidentController,
} from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  controllers: [IncidentsController, ServicesController, TicketIncidentController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}

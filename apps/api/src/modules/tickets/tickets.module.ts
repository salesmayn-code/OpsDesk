import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsRepository } from './tickets.repository';
import { TicketJobsService } from './tickets.jobs';
import { SlaModule } from '../sla/sla.module';

@Module({
  imports: [SlaModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsRepository, TicketJobsService],
  exports: [TicketsService, TicketJobsService, TicketsRepository],
})
export class TicketsModule {}

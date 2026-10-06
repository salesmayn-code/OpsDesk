import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TicketsModule } from '../tickets/tickets.module';
import { SlaModule } from '../sla/sla.module';

@Module({
  imports: [TicketsModule, SlaModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}

import { Module } from '@nestjs/common';
import {
  KnowledgeController,
  KnowledgeSuggestController,
  TicketArticlesController,
} from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [KnowledgeController, KnowledgeSuggestController, TicketArticlesController],
  providers: [KnowledgeService],
})
export class KnowledgeModule {}

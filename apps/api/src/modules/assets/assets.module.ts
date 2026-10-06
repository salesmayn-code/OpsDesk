import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { MyAssetsController } from './my-assets.controller';
import { AssetsService } from './assets.service';
import { AssetsRepository } from './assets.repository';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [AssetsController, MyAssetsController],
  providers: [AssetsService, AssetsRepository],
  exports: [AssetsService],
})
export class AssetsModule {}

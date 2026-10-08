import { Global, Module } from '@nestjs/common';
import { LocalDiskStorageService, StorageService } from './storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorageService }],
  exports: [StorageService],
})
export class StorageModule {}

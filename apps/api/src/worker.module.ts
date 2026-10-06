import { Module } from '@nestjs/common';
import { AppModule } from './app.module';

/** Worker process shares the application graph but binds no HTTP listener (TRD §8). */
@Module({ imports: [AppModule] })
export class WorkerModule {}

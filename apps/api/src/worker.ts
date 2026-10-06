import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';
import { OutboxDispatcher } from './infra/outbox/outbox.dispatcher';
import { ReportsService } from './modules/reports/reports.service';
import { SlaService } from './modules/sla/sla.service';
import { TicketJobsService } from './modules/tickets/tickets.jobs';
import type { Env } from './config/env';

/**
 * Background worker (TRD §8): currently hosts the repeatable SLA evaluator.
 * The outbox dispatcher and notification fan-out join here in Sprint 1.6.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  const logger = app.get(Logger);

  const config = app.get(ConfigService<Env, true>);
  const redisUrl = config.get('REDIS_URL', { infer: true });
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const queue = new Queue('sla', { connection });
  await queue.upsertJobScheduler('sla-evaluate', { every: 60_000 }, { name: 'evaluate' });

  const worker = new Worker(
    'sla',
    async (job) => {
      if (job.name === 'evaluate') {
        const sla = app.get(SlaService);
        const result = await sla.evaluate(new Date());
        if (result.warned || result.escalated || result.breached) {
          logger.log(
            `SLA evaluation: scanned=${result.scanned} warned=${result.warned} escalated=${result.escalated} breached=${result.breached}`,
          );
        }
        return result;
      }
      return null;
    },
    { connection },
  );

  worker.on('failed', (job, error) => {
    logger.error(`SLA job ${job?.id ?? 'unknown'} failed: ${String(error)}`);
  });

  const ticketQueue = new Queue('tickets', { connection });
  await ticketQueue.upsertJobScheduler(
    'tickets-autoclose',
    { every: 3_600_000 },
    { name: 'autoClose' },
  );

  const ticketWorker = new Worker(
    'tickets',
    async (job) => {
      if (job.name === 'autoClose') {
        const jobs = app.get(TicketJobsService);
        const result = await jobs.autoCloseResolved();
        if (result.closed > 0) logger.log(`Auto-closed ${result.closed} ticket(s).`);
        return result;
      }
      if (job.name === 'maintenance') {
        return null;
      }
      return null;
    },
    { connection },
  );

  ticketWorker.on('failed', (job, error) => {
    logger.error(`Ticket job ${job?.id ?? 'unknown'} failed: ${String(error)}`);
  });

  const outboxQueue = new Queue('outbox', { connection });
  await outboxQueue.upsertJobScheduler('outbox-dispatch', { every: 2_000 }, { name: 'dispatch' });

  const outboxWorker = new Worker(
    'outbox',
    async (job) => {
      if (job.name === 'dispatch') {
        return app.get(OutboxDispatcher).dispatchBatch();
      }
      return null;
    },
    { connection },
  );

  outboxWorker.on('failed', (job, error) => {
    logger.error(`Outbox job ${job?.id ?? 'unknown'} failed: ${String(error)}`);
  });

  const reportsQueue = new Queue('reports', { connection });
  await reportsQueue.upsertJobScheduler(
    'reports-rollup',
    { pattern: '15 0 * * *' },
    { name: 'rollup' },
  );

  const reportsWorker = new Worker(
    'reports',
    async (job) => {
      if (job.name === 'rollup') {
        const reports = app.get(ReportsService);
        const yesterday = new Date(Date.now() - 86_400_000);
        const result = await reports.rollupDay(yesterday);
        logger.log(`Daily rollup: ${result.rows} stat row(s) for ${yesterday.toISOString().slice(0, 10)}.`);
        return result;
      }
      return null;
    },
    { connection },
  );

  reportsWorker.on('failed', (job, error) => {
    logger.error(`Reports job ${job?.id ?? 'unknown'} failed: ${String(error)}`);
  });

  logger.log(
    'Worker started: sla.evaluate 60s, tickets.autoClose hourly, outbox.dispatch 2s, reports.rollup daily 00:15.',
  );

  const shutdown = async () => {
    logger.log('Worker shutting down…');
    await worker.close();
    await ticketWorker.close();
    await outboxWorker.close();
    await reportsWorker.close();
    await queue.close();
    await ticketQueue.close();
    await outboxQueue.close();
    await reportsQueue.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();

import { startWorkerRuntime } from './worker-runtime';

/** Standalone worker process: `node dist/worker.js`. */
async function bootstrap() {
  const runtime = await startWorkerRuntime();

  const shutdown = async () => {
    await runtime.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();

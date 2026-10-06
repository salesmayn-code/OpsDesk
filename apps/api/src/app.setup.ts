import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Shared application wiring used by main.ts and integration tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  return app;
}

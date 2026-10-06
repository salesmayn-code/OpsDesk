import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService<Env, true>);

  app.use(helmet());
  app.enableCors({
    origin: config.get('APP_URL', { infer: true }),
    credentials: true,
  });
  configureApp(app);

  const openApi = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('OpsDesk API').setVersion('1.0').build(),
  );
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(openApi));

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();

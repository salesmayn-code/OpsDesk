import { randomUUID } from 'node:crypto';
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import type { IncomingMessage } from 'node:http';
import { validateEnv, type Env } from './config/env';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { GlobalThrottlerGuard } from './common/guards/global-throttler.guard';
import { PrismaModule } from './infra/prisma/prisma.module';
import { IdempotencyModule } from './infra/idempotency/idempotency.module';
import { OutboxModule } from './infra/outbox/outbox.module';
import { StorageModule } from './infra/storage/storage.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { AccessModule } from './modules/access/access.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ChangesModule } from './modules/changes/changes.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgModule } from './modules/org/org.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SlaModule } from './modules/sla/sla.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { UsersModule } from './modules/users/users.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-request-id'] as string | undefined) ?? `req_${randomUUID()}`,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          autoLogging: true,
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    IdempotencyModule,
    OutboxModule,
    StorageModule,
    AuditModule,
    MailModule,
    AccessModule,
    AuthModule,
    UsersModule,
    OrgModule,
    CatalogModule,
    SlaModule,
    TicketsModule,
    CommentsModule,
    AttachmentsModule,
    AssetsModule,
    NotificationsModule,
    SearchModule,
    DashboardModule,
    SettingsModule,
    IncidentsModule,
    ChangesModule,
    WorkflowsModule,
    KnowledgeModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: GlobalThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

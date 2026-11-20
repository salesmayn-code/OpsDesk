import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Prisma's defaults (2s to acquire a connection, 5s to finish) fail under a remote
    // database or a small CPU busy with argon2 — e.g. concurrent logins on a free-tier host.
    super({ transactionOptions: { maxWait: 10_000, timeout: 15_000 } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

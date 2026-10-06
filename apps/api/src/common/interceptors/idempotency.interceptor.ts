import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { of, tap, type Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { IdempotencyService } from '../../infra/idempotency/idempotency.service';

/**
 * Replays the stored response when a POST retries with the same Idempotency-Key
 * header (same user + endpoint, 24h retention per TRD §4.5).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const header = request.headers['idempotency-key'];
    const user = request.user;
    const key = typeof header === 'string' ? header.trim() : '';

    if (request.method !== 'POST' || !user || key.length < 8 || key.length > 100) {
      return next.handle();
    }

    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const existing = await this.idempotency.find(user.id, route, key);
    if (existing) {
      http.getResponse<Response>().status(existing.statusCode);
      return of(existing.response);
    }

    return next.handle().pipe(
      tap((body) => {
        const statusCode = http.getResponse<Response>().statusCode;
        void this.idempotency.store(user.id, route, key, statusCode, body);
      }),
    );
  }
}

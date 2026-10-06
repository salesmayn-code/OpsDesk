import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const pinoId = typeof req.id === 'string' ? req.id : undefined;
    const requestId =
      req.requestId ??
      pinoId ??
      (req.headers['x-request-id'] as string | undefined) ??
      `req_${randomUUID()}`;
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    requestContext.run(
      {
        requestId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      next,
    );
  }
}

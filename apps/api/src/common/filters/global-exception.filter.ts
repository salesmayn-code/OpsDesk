import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ZodError } from 'zod';
import { ZodValidationException } from 'nestjs-zod';
import type { Request, Response } from 'express';
import type { ErrorCode, ErrorDetail } from '@opsdesk/contracts';
import { DomainError } from '../errors';
import { currentContext } from '../request-context';

function fallbackCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'AUTH_REQUIRED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'ATTACHMENT_TOO_LARGE';
    case 415:
      return 'ATTACHMENT_TYPE_NOT_ALLOWED';
    case 422:
      return 'VALIDATION_FAILED';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}

/** Maps domain, validation, Prisma, and unknown errors to the documented error body. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? currentContext()?.requestId ?? 'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: ErrorDetail[] | undefined;

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'Validation failed.';
      const zodError = exception.getZodError() as ZodError | null | undefined;
      details = (zodError?.issues ?? []).map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'Invalid data provided.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = fallbackCode(status);
      } else if (body && typeof body === 'object') {
        const obj = body as { code?: ErrorCode; message?: string | string[] };
        message = Array.isArray(obj.message)
          ? obj.message.join('; ')
          : (obj.message ?? fallbackCode(status));
        code = obj.code ?? fallbackCode(status);
      }
    }

    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} -> ${status} (${code}) ${message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details?.length ? { details } : {}),
      requestId,
    });
  }
}

function mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: ErrorCode;
  message: string;
} {
  switch (exception.code) {
    case 'P2002': {
      const target = Array.isArray(exception.meta?.target)
        ? (exception.meta.target as string[]).join(',')
        : String(exception.meta?.target ?? '');
      return target.includes('email')
        ? { status: 409, code: 'EMAIL_TAKEN', message: 'That email address is already in use.' }
        : { status: 409, code: 'CONFLICT', message: 'A record with these values already exists.' };
    }
    case 'P2003':
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'This record is referenced by other data.',
      };
    case 'P2025':
      return { status: 404, code: 'NOT_FOUND', message: 'Record not found.' };
    default:
      return {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
  }
}

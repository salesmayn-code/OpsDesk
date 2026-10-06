import type { ErrorCode, ErrorDetail } from '@opsdesk/contracts';

/** Typed business-rule violation, mapped to HTTP by GlobalExceptionFilter. */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const errors = {
  notFound: (code: ErrorCode, message: string) => new DomainError(code, 404, message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new DomainError('FORBIDDEN', 403, message),
  conflict: (code: ErrorCode, message: string) => new DomainError(code, 409, message),
  businessRule: (code: ErrorCode, message: string, details?: ErrorDetail[]) =>
    new DomainError(code, 422, message, details),
};

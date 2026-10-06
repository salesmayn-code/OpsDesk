import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PermissionKey } from '@opsdesk/contracts';
import { DomainError } from '../errors';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<Request>();
    if (!user) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Authentication required.');
    }
    const missing = required.filter((permission) => !user.permissions.includes(permission));
    if (missing.length > 0) {
      throw new DomainError(
        'FORBIDDEN',
        403,
        'You do not have permission to perform this action.',
      );
    }
    return true;
  }
}

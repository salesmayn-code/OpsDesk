import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DomainError } from '../errors';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { currentContext } from '../request-context';
import { PermissionService } from '../../modules/access/permission.service';
import { ACCESS_COOKIE, TokenService } from '../../modules/auth/token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Authentication required.');
    }

    let userId: string;
    try {
      const payload = this.tokenService.verifyAccessToken(token);
      userId = payload.sub;
      request.sessionId = payload.sid;
    } catch {
      throw new DomainError('AUTH_TOKEN_EXPIRED', 401, 'Your session has expired. Sign in again.');
    }

    const user = await this.permissionService.getAuthUser(userId);
    if (!user) {
      throw new DomainError('AUTH_REQUIRED', 401, 'Authentication required.');
    }
    if (user.status !== 'ACTIVE') {
      throw new DomainError('ACCOUNT_NOT_ACTIVE', 403, 'Your account is not active. Contact IT.');
    }

    request.user = user;
    const ctx = currentContext();
    if (ctx) {
      ctx.actorId = user.id;
      ctx.actorEmail = user.email;
    }
    return true;
  }
}

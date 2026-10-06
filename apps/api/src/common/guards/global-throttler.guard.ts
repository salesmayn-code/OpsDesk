import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../auth-user';

/**
 * Global rate limiting (TRD §12): keyed by user id when authenticated,
 * otherwise by IP + submitted email so login/forgot are limited per identity.
 */
@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as AuthUser | undefined;
    if (user?.id) return Promise.resolve(`user:${user.id}`);
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
    return Promise.resolve(`ip:${String(req.ip)}:${email}`);
  }
}

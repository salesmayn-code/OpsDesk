import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../../config/env';
import { DomainError } from '../errors';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../modules/auth/token.service';

export const CSRF_COOKIE = 'opsdesk_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Signed double-submit token: `<random>.<hmac(random)>`, so a planted cookie can't be forged. */
export function issueCsrfToken(secret: string): string {
  const nonce = randomBytes(18).toString('base64url');
  return `${nonce}.${sign(nonce, secret)}`;
}

export function isValidCsrfToken(token: string | undefined, secret: string): boolean {
  const [nonce, signature, extra] = (token ?? '').split('.');
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(nonce, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * CSRF is a browser attack: only browsers attach ambient cookies on a forged request, and
 * they always send Fetch Metadata or Origin on state-changing requests. Scripts and tests
 * (no such headers) can't be tricked into sending a victim's cookies, so they are exempt.
 */
export function requiresCsrfCheck(req: Pick<Request, 'method' | 'headers' | 'cookies'>): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const fromBrowser = Boolean(req.headers['sec-fetch-site'] ?? req.headers.origin);
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const hasSession = Boolean(cookies[ACCESS_COOKIE] ?? cookies[REFRESH_COOKIE]);
  return fromBrowser && hasSession;
}

function sign(nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(nonce).digest('base64url');
}

/**
 * TRD §12: SameSite=Lax cookies plus a double-submit `X-CSRF-Token` header on mutating
 * requests. The token cookie is readable by the web app (not HttpOnly) by design.
 * shortcut: unauthenticated endpoints (login, register, forgot password) are not covered —
 * login CSRF is low impact here; add a pre-session token if that changes.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService<Env, true>) {}

  use(req: Request, res: Response, next: NextFunction) {
    const secret = this.config.get('CSRF_SECRET', { infer: true });
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const cookieToken = cookies[CSRF_COOKIE];

    if (!isValidCsrfToken(cookieToken, secret)) {
      const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
      res.cookie(CSRF_COOKIE, issueCsrfToken(secret), {
        httpOnly: false,
        sameSite,
        secure: this.config.get('NODE_ENV', { infer: true }) === 'production' || sameSite === 'none',
        path: '/',
      });
    }

    if (requiresCsrfCheck(req)) {
      const headerToken = req.headers[CSRF_HEADER];
      const valid =
        typeof headerToken === 'string' &&
        headerToken === cookieToken &&
        isValidCsrfToken(headerToken, secret);
      if (!valid) {
        throw new DomainError('CSRF_INVALID', 403, 'Your session token is missing or expired. Retry the action.');
      }
    }
    next();
  }
}

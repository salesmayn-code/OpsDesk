import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import { randomToken, sha256 } from '../../common/crypto/password';
import { uuidv7 } from '../../common/id';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { Env } from '../../config/env';

export const ACCESS_COOKIE = 'opsdesk_access';
export const REFRESH_COOKIE = 'opsdesk_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface CreatedSession {
  sessionId: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(userId: string, sessionId: string): string {
    return jwt.sign({ sub: userId, sid: sessionId }, this.accessSecret(), {
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  verifyAccessToken(token: string): { sub: string; sid?: string } {
    const payload = jwt.verify(token, this.accessSecret());
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new Error('Malformed token payload');
    }
    return { sub: payload.sub, sid: typeof payload.sid === 'string' ? payload.sid : undefined };
  }

  private accessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async createSession(
    tx: Prisma.TransactionClient,
    userId: string,
    userAgent: string | undefined,
    ip: string | undefined,
    familyId?: string,
  ): Promise<CreatedSession> {
    const refreshToken = randomToken();
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const session = await tx.session.create({
      data: {
        id: uuidv7(),
        userId,
        refreshTokenHash: sha256(refreshToken),
        familyId: familyId ?? uuidv7(),
        userAgent: userAgent?.slice(0, 255) ?? null,
        ip: ip ?? null,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { sessionId: session.id, refreshToken };
  }

  private baseCookie(): CookieOptions {
    const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true });
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production' || sameSite === 'none',
      sameSite,
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...this.baseCookie(),
      path: '/',
      maxAge: this.config.get('JWT_ACCESS_TTL', { infer: true }) * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.baseCookie(),
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.get('REFRESH_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.baseCookie(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.baseCookie(), path: REFRESH_COOKIE_PATH });
  }
}

import type { AuthUser } from '../auth-user';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      sessionId?: string;
      user?: AuthUser;
    }
  }
}

export {};

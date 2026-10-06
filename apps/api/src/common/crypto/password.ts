import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** TRD §12: argon2id, m=19 MiB, t=2, p=1. */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password, ARGON2_OPTIONS);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Opaque 256-bit token for refresh/reset/invitation links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

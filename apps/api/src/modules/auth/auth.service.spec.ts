import type { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { Env } from '../../config/env';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { MailService } from '../mail/mail.service';
import type { TokenService } from './token.service';

function serviceWith(allowSelfRegistration: boolean): AuthService {
  return new AuthService(
    {} as PrismaService,
    {} as TokenService,
    {} as AuditService,
    {} as MailService,
    { get: () => allowSelfRegistration } as unknown as ConfigService<Env, true>,
  );
}

const input = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'correct-horse-battery',
};

describe('AuthService.register', () => {
  it('rejects registration when ALLOW_SELF_REGISTRATION is off', async () => {
    await expect(serviceWith(false).register(input, undefined, undefined)).rejects.toMatchObject({
      code: 'REGISTRATION_DISABLED',
      httpStatus: 403,
    });
  });
});

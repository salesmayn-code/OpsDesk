import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(loginSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}

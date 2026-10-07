import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AcceptInviteDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, TokenService } from './token.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      body.email,
      body.password,
      req.ip,
      req.headers['user-agent'],
    );
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { data: result.me };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(body, req.ip, req.headers['user-agent']);
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { data: result.me };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const result = await this.authService.refresh(raw, req.ip, req.headers['user-agent']);
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { data: result.me };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.authService.logout(raw);
    this.tokenService.clearAuthCookies(res);
    return { data: { success: true } };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.authService.forgotPassword(body.email);
    return { data: { success: true } };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { data: { success: true } };
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvitation(@Body() body: AcceptInviteDto) {
    await this.authService.acceptInvitation(body.token, body.password);
    return { data: { success: true } };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { data: await this.authService.getMe(user.id) };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return { data: await this.authService.listSessions(user.id, req.sessionId) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.authService.revokeSession(user.id, id);
  }
}

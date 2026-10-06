import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  async send(options: { to: string; subject: string; html: string; text: string }): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, ...options });
    } catch (error) {
      // Dev Mailpit may be down; email must never fail the originating request.
      this.logger.warn(`Failed to send "${options.subject}" to ${options.to}: ${String(error)}`);
    }
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your OpsDesk password',
      text: `Reset your password within 30 minutes: ${link}`,
      html: `<p>We received a request to reset your OpsDesk password.</p><p><a href="${link}">Set a new password</a> — the link expires in 30 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  async sendInvitation(to: string, link: string, invitedByName: string): Promise<void> {
    await this.send({
      to,
      subject: 'You have been invited to OpsDesk',
      text: `${invitedByName} invited you to OpsDesk. Set your password: ${link}`,
      html: `<p>${invitedByName} invited you to OpsDesk, the IT service desk.</p><p><a href="${link}">Set your password and get started</a></p>`,
    });
  }
}

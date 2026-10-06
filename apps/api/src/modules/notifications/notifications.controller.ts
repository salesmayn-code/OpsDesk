import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { putNotificationPreferencesSchema } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

class PutPreferencesDto extends createZodDto(putNotificationPreferencesSchema) {}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query('unread') unread?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(actor, {
      unread: unread === 'true',
      cursor,
      limit: Math.min(100, Math.max(1, Number(limit) || 25)),
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthUser) {
    return this.notifications.unreadCount(actor);
  }

  @Get('preferences')
  listPreferences(@CurrentUser() actor: AuthUser) {
    return this.notifications.listPreferences(actor);
  }

  @Put('preferences')
  updatePreferences(@Body() body: PutPreferencesDto, @CurrentUser() actor: AuthUser) {
    return this.notifications.updatePreferences(actor, body);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(actor, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.notifications.markAllRead(actor);
  }
}

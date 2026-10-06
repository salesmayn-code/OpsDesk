import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { createCommentSchema, updateCommentSchema } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { CommentsService } from './comments.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

class CreateCommentDto extends createZodDto(createCommentSchema) {}
class UpdateCommentDto extends createZodDto(updateCommentSchema) {}

@Controller('tickets/:id/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @RequirePermissions('ticket:view')
  list(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.comments.list(id, actor);
  }

  @Post()
  @RequirePermissions('ticket:view')
  create(
    @Param('id') id: string,
    @Body() body: CreateCommentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.comments.create(id, body, actor);
  }

  @Patch(':commentId')
  @HttpCode(200)
  @RequirePermissions('ticket:view')
  update(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() body: UpdateCommentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.comments.update(id, commentId, body, actor);
  }
}

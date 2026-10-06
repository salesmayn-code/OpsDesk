import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('tickets/:id/attachments')
  @RequirePermissions('ticket:view')
  list(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.attachments.list(id, actor);
  }

  @Post('tickets/:id/attachments')
  @RequirePermissions('attachment:upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('isInternal') isInternal: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.attachments.upload(id, file, isInternal, actor);
  }

  @Get('attachments/:id/download')
  @RequirePermissions('ticket:view')
  download(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ) {
    return this.attachments.download(id, actor, res);
  }

  @Delete('attachments/:id')
  @HttpCode(204)
  @RequirePermissions('ticket:view')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    await this.attachments.remove(id, actor);
  }
}

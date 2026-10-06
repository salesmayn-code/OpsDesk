import { Controller, Get } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

@Controller('users/me/assets')
export class MyAssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions('asset:view')
  myAssets(@CurrentUser() actor: AuthUser) {
    return this.assets.myAssets(actor);
  }
}

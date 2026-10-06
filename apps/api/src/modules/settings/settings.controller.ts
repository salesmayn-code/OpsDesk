import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateSettingsSchema } from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { SettingsService } from './settings.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

class UpdateSettingsDto extends createZodDto(updateSettingsSchema) {}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('settings:manage')
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions('settings:manage')
  update(@Body() body: UpdateSettingsDto) {
    return this.settings.update(body);
  }
}

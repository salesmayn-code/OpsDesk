import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { RolesController } from './roles.controller';

@Global()
@Module({
  controllers: [RolesController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class AccessModule {}

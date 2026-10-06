import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createAssetTypeSchema,
  createCategorySchema,
  updateCategorySchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';
import { CatalogService } from './catalog.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/auth-user';

class CreateCategoryDto extends createZodDto(createCategorySchema) {}
class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
class CreateAssetTypeDto extends createZodDto(createAssetTypeSchema) {}

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @RequirePermissions('ticket:view')
  async categories(@Query('includeInactive') includeInactive?: string) {
    return { data: await this.catalog.categoryTree(includeInactive === 'true') };
  }

  @Post('categories')
  @RequirePermissions('category:manage')
  createCategory(@Body() body: CreateCategoryDto, @CurrentUser() actor: AuthUser) {
    return this.catalog.createCategory(body, actor.id);
  }

  @Patch('categories/:id')
  @RequirePermissions('category:manage')
  updateCategory(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.catalog.updateCategory(id, body, actor.id);
  }

  @Get('resolution-codes')
  @RequirePermissions('ticket:view')
  async resolutionCodes() {
    return { data: await this.catalog.listResolutionCodes() };
  }

  @Get('asset-types')
  @RequirePermissions('asset:view')
  async assetTypes() {
    return { data: await this.catalog.listAssetTypes() };
  }

  @Post('asset-types')
  @RequirePermissions('asset_type:manage')
  createAssetType(@Body() body: CreateAssetTypeDto, @CurrentUser() actor: AuthUser) {
    return this.catalog.createAssetType(body, actor.id);
  }
}

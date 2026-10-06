import {
  assetQuerySchema,
  assetTransitionSchema,
  assignAssetSchema,
  createAssetSchema,
  unassignAssetSchema,
  updateAssetSchema,
} from '@opsdesk/contracts';
import { createZodDto } from 'nestjs-zod';

export class AssetQueryDto extends createZodDto(assetQuerySchema) {}
export class CreateAssetDto extends createZodDto(createAssetSchema) {}
export class UpdateAssetDto extends createZodDto(updateAssetSchema) {}
export class AssignAssetDto extends createZodDto(assignAssetSchema) {}
export class UnassignAssetDto extends createZodDto(unassignAssetSchema) {}
export class AssetTransitionDto extends createZodDto(assetTransitionSchema) {}

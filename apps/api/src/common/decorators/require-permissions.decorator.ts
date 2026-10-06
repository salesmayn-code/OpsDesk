import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@opsdesk/contracts';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Coarse permission gate; resource policies still apply ownership/scope. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

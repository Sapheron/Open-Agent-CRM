import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@wacrm/shared';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Require one or more feature permissions to access this endpoint.
 * ADMIN / SUPER_ADMIN bypass automatically (checked in PermissionsGuard).
 * AGENT users must have at least one of the listed permissions.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

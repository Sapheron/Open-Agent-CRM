import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@wacrm/shared';
import { hasPermission } from '@wacrm/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard that enforces feature-level permissions.
 *
 * - If @Public() is set → bypass (public routes like webhooks)
 * - If no @RequirePermissions() is set → allow
 * - ADMIN / SUPER_ADMIN → always allow
 * - AGENT / MANAGER → must have at least one of the required permissions
 *   in their user.permissions array
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public routes (webhooks, public pages) bypass permission checks
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    // No user yet — JwtAuthGuard (controller-level) hasn't run yet because
    // this is a global APP_GUARD. Let it through; JwtAuthGuard will 401 if
    // the token is missing or invalid.
    if (!user) return true;

    // Check if the user has any of the required permissions
    const allowed = required.some((perm) =>
      hasPermission(user.role, user.permissions ?? [], perm),
    );

    if (!allowed) {
      throw new ForbiddenException('You do not have permission to access this feature');
    }

    return true;
  }
}

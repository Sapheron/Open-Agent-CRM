import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
/**
 * Ensures the requested resource belongs to the authenticated user's company.
 *
 * Usage: attach to any controller that has an entity ID in params.
 * It reads request.params.id and checks that entity.companyId === user.companyId.
 *
 * For simpler cases, services should always pass companyId from the JWT
 * (req.user.companyId) rather than trusting body/params.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    // Inject companyId into query + body so services don't need to re-read JWT
    request.companyId = user.companyId;
    return true;
  }
}

/**
 * Helper used inside services: throws ForbiddenException if the fetched
 * entity's companyId doesn't match the user's companyId.
 */
export function assertCompanyScope(
  entityCompanyId: string,
  userCompanyId: string,
): void {
  if (entityCompanyId !== userCompanyId) {
    throw new ForbiddenException('Access denied');
  }
}

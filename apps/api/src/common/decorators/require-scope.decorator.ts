import { SetMetadata } from '@nestjs/common';

/**
 * Marks a controller method as requiring one or more API key scopes.
 * Enforced by `ApiKeyAuthGuard`. Multiple scopes are AND-ed (the key must
 * carry every listed scope).
 *
 * Example:
 *   @UseGuards(ApiKeyAuthGuard)
 *   @RequireScope('leads:write')
 *   @Post()
 *   create(...) { ... }
 */
export const REQUIRE_SCOPE_KEY = 'requireScope';
export const RequireScope = (...scopes: string[]) => SetMetadata(REQUIRE_SCOPE_KEY, scopes);

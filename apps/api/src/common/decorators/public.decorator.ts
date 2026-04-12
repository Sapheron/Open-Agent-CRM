import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Mark a route as public (no auth/permission check required).
 * Used for webhooks and public-facing pages.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

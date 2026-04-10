/**
 * ApiKeyAuthGuard — validates `Authorization: Bearer wacrm_<key>` (or
 * `X-API-Key: wacrm_<key>`) against the hashed key in the `ApiKey` table.
 *
 * Drop-in replacement for `JwtAuthGuard` on routes that should be reachable
 * by external systems without a user session — e.g. the leads-intake custom
 * webhook. Use with `@RequireScope('leads:write')` to gate by scope.
 *
 * On success the guard attaches `request.apiKey` and `request.companyId`
 * for downstream handlers, and fire-and-forgets a `lastUsedAt` update.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { prisma } from '@wacrm/database';
import { REQUIRE_SCOPE_KEY } from '../decorators/require-scope.decorator';

interface ApiKeyRequestExtras {
  apiKey?: { id: string; companyId: string; scopes: string[]; prefix: string };
  companyId?: string;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Record<string, unknown> & ApiKeyRequestExtras>();
    const rawKey = extractRawKey(req);
    if (!rawKey) {
      throw new UnauthorizedException('Missing API key. Send Authorization: Bearer wacrm_<key>.');
    }
    if (!rawKey.startsWith('wacrm_')) {
      throw new UnauthorizedException('Invalid API key format.');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        companyId: true,
        scopes: true,
        prefix: true,
        isActive: true,
        expiresAt: true,
      },
    });

    if (!record) throw new UnauthorizedException('Unknown API key.');
    if (!record.isActive) throw new UnauthorizedException('API key is revoked.');
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('API key has expired.');
    }

    // Scope enforcement (AND across all required scopes)
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredScopes?.length) {
      const missing = requiredScopes.filter((s) => !record.scopes.includes(s));
      if (missing.length > 0) {
        throw new ForbiddenException(`API key missing required scope(s): ${missing.join(', ')}`);
      }
    }

    // Attach to request for downstream handlers
    req.apiKey = {
      id: record.id,
      companyId: record.companyId,
      scopes: record.scopes,
      prefix: record.prefix,
    };
    req.companyId = record.companyId;

    // Fire-and-forget lastUsedAt update — don't block the request
    void prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return true;
  }
}

function extractRawKey(req: Record<string, unknown>): string | null {
  const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const auth = (headers.authorization ?? headers.Authorization) as string | undefined;
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const xKey = (headers['x-api-key'] ?? headers['X-Api-Key']) as string | undefined;
  if (xKey) return String(xKey).trim();
  return null;
}

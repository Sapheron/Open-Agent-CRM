/**
 * Eligibility helper — decides whether the CRM is hosted on a real domain
 * that Meta (and other webhook providers) can actually reach.
 *
 * Priority order for determining public URL:
 *   1. process.env.API_PUBLIC_URL (global default)
 *   2. Company.publicUrl (per-company override from settings UI)
 *   3. Auto-detect from request headers (X-Forwarded-Host, Host)
 *
 * The integrations dashboard calls this on mount via `GET /lead-integrations/eligibility`
 * so the UI can disable the Meta-connection panel with an explanation when the gate fails.
 */

import type { IncomingHttpHeaders } from 'http';

export interface EligibilityResult {
  eligible: boolean;
  publicUrl?: string;
  webhookBaseUrl?: string;
  customWebhookUrl?: string;
  reason?: string;
  source?: 'env' | 'company' | 'detected';
}

const PRIVATE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

const RFC1918_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local
  /^fc[0-9a-f]{2}:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 link-local
];

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host)) return true;
  if (RFC1918_PATTERNS.some((re) => re.test(host))) return true;
  // common docker compose service names
  if (host === 'api' || host === 'dashboard' || host === 'whatsapp') return true;
  return false;
}

/**
 * Extract protocol from headers. Assumes HTTPS if X-Forwarded-Proto is set
 * or the connection is secure. Falls back to http for local dev.
 */
function getProtocol(headers: IncomingHttpHeaders, isSecure: boolean): string {
  const proto = headers['x-forwarded-proto'];
  if (proto) {
    // X-Forwarded-Proto can be comma-separated (e.g., "https,http")
    const protoStr = Array.isArray(proto) ? proto[0] : proto;
    return protoStr.split(',')[0].trim() + ':';
  }
  return isSecure ? 'https:' : 'http:';
}

/**
 * Extract host from headers, preferring X-Forwarded-Host (set by reverse proxies)
 * over the Host header.
 */
function getHost(headers: IncomingHttpHeaders): string | null {
  const forwardedHost = headers['x-forwarded-host'];
  if (forwardedHost) {
    // X-Forwarded-Host can be comma-separated (e.g., "example.com,localhost:8080")
    const hostStr = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    return hostStr.split(',')[0].trim();
  }
  const host = headers.host;
  if (host) {
    const hostStr = Array.isArray(host) ? host[0] : host;
    return hostStr.split(':')[0] ?? null;
  }
  return null;
}

/**
 * Auto-detect public URL from request headers. Works behind reverse proxies
 * like nginx that set X-Forwarded-* headers.
 */
export function detectPublicUrlFromRequest(
  headers: IncomingHttpHeaders,
  isSecure = false,
): string | null {
  const host = getHost(headers);
  if (!host) return null;
  if (isPrivateHost(host)) return null; // Don't auto-detect private hosts

  const protocol = getProtocol(headers, isSecure);
  const url = `${protocol}//${host}`;

  // Strip trailing slash
  return url.replace(/\/+$/, '');
}

/**
 * Core eligibility check that validates a URL string.
 */
function validatePublicUrl(publicUrl: string): EligibilityResult {
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return {
      eligible: false,
      publicUrl,
      reason: `"${publicUrl}" is not a valid URL.`,
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      eligible: false,
      publicUrl,
      reason: `URL must use http or https (got ${parsed.protocol}).`,
    };
  }

  // Meta requires HTTPS for production webhooks. Allow http only if the hostname is hosted (for testing with ngrok etc.)
  if (parsed.protocol === 'http:' && !isPrivateHost(parsed.hostname)) {
    // Tolerate http on a real domain (ngrok / dev tunnels) but warn
    // Continue — Meta will reject it on their side, which surfaces to the user
  }

  if (isPrivateHost(parsed.hostname)) {
    return {
      eligible: false,
      publicUrl,
      reason: `URL points at a private/local host (${parsed.hostname}). Meta cannot reach this — configure a reverse proxy + public domain first.`,
    };
  }

  // Strip trailing slash for clean concatenation
  const base = publicUrl.replace(/\/+$/, '');
  const webhookBaseUrl = `${base}/api/webhooks/leads`;

  return {
    eligible: true,
    publicUrl: base,
    webhookBaseUrl,
    customWebhookUrl: `${webhookBaseUrl}/custom`,
  };
}

/**
 * Check eligibility with fallback chain:
 *   1. Company.publicUrl (from settings UI)
 *   2. process.env.API_PUBLIC_URL (global env var)
 *   3. Request headers (auto-detect)
 *
 * @param companyPublicUrl The publicUrl stored in Company model
 * @param headers Request headers for auto-detection (optional)
 * @param isSecure Whether the original request was HTTPS (optional)
 */
export function checkLeadIntakeEligibility(
  companyPublicUrl?: string | null,
  headers?: IncomingHttpHeaders,
  isSecure = false,
): EligibilityResult {
  // Priority 1: Company-specific public URL (from settings UI)
  if (companyPublicUrl?.trim()) {
    const result = validatePublicUrl(companyPublicUrl.trim());
    if (result.eligible) {
      return { ...result, source: 'company' };
    }
    // If company URL is invalid, continue to other sources but note the issue
    return {
      ...result,
      reason: `Company URL is invalid: ${result.reason}. Fix it in Settings, or use API_PUBLIC_URL env var.`,
    };
  }

  // Priority 2: Global API_PUBLIC_URL environment variable
  const envUrl = (process.env.API_PUBLIC_URL || '').trim();
  if (envUrl) {
    const result = validatePublicUrl(envUrl);
    if (result.eligible) {
      return { ...result, source: 'env' };
    }
    return {
      ...result,
      source: 'env',
      reason: `API_PUBLIC_URL is invalid: ${result.reason}. Update your .env file.`,
    };
  }

  // Priority 3: Auto-detect from request headers (for reverse proxy setups)
  if (headers) {
    const detected = detectPublicUrlFromRequest(headers, isSecure);
    if (detected) {
      const result = validatePublicUrl(detected);
      if (result.eligible) {
        return { ...result, source: 'detected' };
      }
    }
  }

  // No valid URL found
  return {
    eligible: false,
    reason: 'Public URL not configured. Go to Settings → Integrations to set your domain, or set API_PUBLIC_URL in .env and restart.',
  };
}

/**
 * Build the public Meta webhook URL for a given integration ID.
 * Returns null when ineligible so callers can surface a "not configured" UI.
 */
export function buildMetaWebhookUrl(
  integrationId: string,
  companyPublicUrl?: string | null,
): string | null {
  const result = checkLeadIntakeEligibility(companyPublicUrl);
  if (!result.eligible || !result.webhookBaseUrl) return null;
  return `${result.webhookBaseUrl}/meta/${integrationId}`;
}

/**
 * Build the public custom webhook URL.
 */
export function buildCustomWebhookUrl(companyPublicUrl?: string | null): string | null {
  const result = checkLeadIntakeEligibility(companyPublicUrl);
  if (!result.eligible || !result.customWebhookUrl) return null;
  return result.customWebhookUrl;
}

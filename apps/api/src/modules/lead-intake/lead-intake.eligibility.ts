/**
 * Eligibility helper — decides whether the CRM is hosted on a real domain
 * that Meta (and other webhook providers) can actually reach.
 *
 * Pure function. Reads `process.env.API_PUBLIC_URL` and refuses any URL that
 * resolves to localhost / a loopback interface / an RFC1918 private range /
 * an obvious docker hostname. The integrations dashboard calls this on mount
 * via `GET /lead-integrations/eligibility` so the UI can disable the
 * Meta-connection panel with an explanation when the gate fails.
 */

export interface EligibilityResult {
  eligible: boolean;
  publicUrl?: string;
  webhookBaseUrl?: string;
  reason?: string;
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

export function checkLeadIntakeEligibility(): EligibilityResult {
  const publicUrl = (process.env.API_PUBLIC_URL || '').trim();

  if (!publicUrl) {
    return {
      eligible: false,
      reason: 'API_PUBLIC_URL is not set. Configure your reverse proxy + DNS, then set API_PUBLIC_URL=https://your-domain in .env and restart the API.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return {
      eligible: false,
      publicUrl,
      reason: `API_PUBLIC_URL "${publicUrl}" is not a valid URL.`,
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      eligible: false,
      publicUrl,
      reason: `API_PUBLIC_URL must use http or https (got ${parsed.protocol}).`,
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
      reason: `API_PUBLIC_URL points at a private/local host (${parsed.hostname}). Meta cannot reach this — configure a reverse proxy + public domain first.`,
    };
  }

  // Strip trailing slash for clean concatenation
  const base = publicUrl.replace(/\/+$/, '');
  return {
    eligible: true,
    publicUrl: base,
    webhookBaseUrl: `${base}/api/webhooks/leads`,
  };
}

/**
 * Build the public Meta webhook URL for a given integration ID.
 * Returns null when ineligible so callers can surface a "not configured" UI.
 */
export function buildMetaWebhookUrl(integrationId: string): string | null {
  const result = checkLeadIntakeEligibility();
  if (!result.eligible || !result.webhookBaseUrl) return null;
  return `${result.webhookBaseUrl}/meta/${integrationId}`;
}

/**
 * Build the public custom webhook URL.
 */
export function buildCustomWebhookUrl(): string | null {
  const result = checkLeadIntakeEligibility();
  if (!result.eligible || !result.webhookBaseUrl) return null;
  return `${result.webhookBaseUrl}/custom`;
}

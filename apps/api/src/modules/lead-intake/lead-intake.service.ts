/**
 * LeadIntakeService — orchestrates lead creation from external sources.
 *
 *   - `ingestMetaLead(integrationId, leadgenId)`
 *       Looks up the integration, decrypts the page access token, calls
 *       Graph API to fetch the full lead, maps `field_data` → CreateLeadDto,
 *       and delegates to `LeadsService.create()` with `{type:'system'}`.
 *
 *   - `ingestCustomLead(companyId, dto, apiKeyId)`
 *       Direct create for the API-key-protected `/webhooks/leads/custom`
 *       endpoint. The body shape is the same `CreateLeadDto` we use
 *       everywhere else, with `source: WEBHOOK` defaulted.
 *
 * Both methods are best-effort and update the integration's `lastEventAt` /
 * `lastError` columns so the dashboard can show health status. We never let
 * an exception escape — Meta retries forever on non-2xx, which would spam
 * us with duplicates.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '@wacrm/database';
import type {
  LeadIntakeIntegration,
  LeadIntegrationProvider,
  LeadIntegrationStatus,
  LeadPriority,
  Prisma,
} from '@wacrm/database';
import { decrypt, encrypt } from '@wacrm/shared';
import { LeadsService } from '../leads/leads.service';
import type { CreateLeadDto, LeadActor } from '../leads/leads.types';
import { checkLeadIntakeEligibility } from './lead-intake.eligibility';

const META_GRAPH_VERSION = 'v19.0';
const SYSTEM_ACTOR: LeadActor = { type: 'system' };

interface MetaLeadFieldDatum {
  name: string;
  values: string[];
}

interface MetaLeadResponse {
  id?: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: MetaLeadFieldDatum[];
}

interface CreateIntegrationDto {
  provider: LeadIntegrationProvider;
  name: string;
  metaPageId?: string;
  metaPageName?: string;
  metaAppSecret?: string;
  metaPageAccessToken?: string;
  defaultTags?: string[];
  defaultPriority?: LeadPriority;
}

interface UpdateIntegrationDto {
  name?: string;
  status?: LeadIntegrationStatus;
  metaPageId?: string;
  metaPageName?: string;
  metaAppSecret?: string;
  metaPageAccessToken?: string;
  defaultTags?: string[];
  defaultPriority?: LeadPriority;
}

@Injectable()
export class LeadIntakeService {
  constructor(private readonly leads: LeadsService) {}

  // ── Integration CRUD (called by controller for the dashboard) ────────────

  async listIntegrations(companyId: string) {
    const rows = await prisma.leadIntakeIntegration.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublicIntegration(r));
  }

  async getIntegration(companyId: string, id: string) {
    const row = await prisma.leadIntakeIntegration.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Integration not found');
    return this.toPublicIntegration(row);
  }

  async createIntegration(companyId: string, dto: CreateIntegrationDto) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (dto.provider === 'META_ADS') {
      const eligibility = checkLeadIntakeEligibility();
      if (!eligibility.eligible) {
        throw new BadRequestException(
          `Hosted domain required: ${eligibility.reason ?? 'API_PUBLIC_URL is not configured'}`,
        );
      }
      if (!dto.metaPageId) throw new BadRequestException('metaPageId is required for META_ADS');
      if (!dto.metaAppSecret) throw new BadRequestException('metaAppSecret is required for META_ADS');
      if (!dto.metaPageAccessToken) {
        throw new BadRequestException('metaPageAccessToken is required for META_ADS');
      }
    }

    const verifyToken = generateVerifyToken();

    const row = await prisma.leadIntakeIntegration.create({
      data: {
        companyId,
        provider: dto.provider,
        name: dto.name.trim(),
        metaPageId: dto.metaPageId,
        metaPageName: dto.metaPageName,
        metaAppSecretEnc: dto.metaAppSecret ? encrypt(dto.metaAppSecret) : null,
        metaPageAccessTokenEnc: dto.metaPageAccessToken ? encrypt(dto.metaPageAccessToken) : null,
        metaVerifyToken: verifyToken,
        defaultTags: dto.defaultTags ?? [],
        defaultPriority: dto.defaultPriority ?? 'MEDIUM',
      },
    });

    // Return the public shape, but also include the raw verifyToken so the
    // dashboard can show it once after creation.
    return {
      ...this.toPublicIntegration(row),
      metaVerifyToken: row.metaVerifyToken,
      _onceOnly: true,
    };
  }

  async updateIntegration(companyId: string, id: string, dto: UpdateIntegrationDto) {
    const existing = await prisma.leadIntakeIntegration.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Integration not found');

    const data: Prisma.LeadIntakeIntegrationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.metaPageId !== undefined) data.metaPageId = dto.metaPageId;
    if (dto.metaPageName !== undefined) data.metaPageName = dto.metaPageName;
    if (dto.defaultTags !== undefined) data.defaultTags = dto.defaultTags;
    if (dto.defaultPriority !== undefined) data.defaultPriority = dto.defaultPriority;
    if (dto.metaAppSecret !== undefined && dto.metaAppSecret !== '') {
      data.metaAppSecretEnc = encrypt(dto.metaAppSecret);
    }
    if (dto.metaPageAccessToken !== undefined && dto.metaPageAccessToken !== '') {
      data.metaPageAccessTokenEnc = encrypt(dto.metaPageAccessToken);
    }

    const row = await prisma.leadIntakeIntegration.update({ where: { id }, data });
    return this.toPublicIntegration(row);
  }

  async deleteIntegration(companyId: string, id: string) {
    const existing = await prisma.leadIntakeIntegration.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Integration not found');
    await prisma.leadIntakeIntegration.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'PAUSED' },
    });
    return { ok: true };
  }

  async rotateVerifyToken(companyId: string, id: string) {
    const existing = await prisma.leadIntakeIntegration.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Integration not found');
    const newToken = generateVerifyToken();
    await prisma.leadIntakeIntegration.update({
      where: { id },
      data: { metaVerifyToken: newToken },
    });
    return { metaVerifyToken: newToken };
  }

  // ── Webhook ingestion ────────────────────────────────────────────────────

  /**
   * Look up an integration by id WITHOUT the company scope. Webhook handlers
   * use this because they're authenticated by signature, not by JWT.
   * Returns the raw row (with encrypted secrets) for the handler to decrypt.
   */
  async loadRawIntegration(integrationId: string): Promise<LeadIntakeIntegration | null> {
    return prisma.leadIntakeIntegration.findFirst({
      where: { id: integrationId, deletedAt: null },
    });
  }

  /**
   * Decrypt the Meta app secret for the given integration. Returns null if
   * the integration doesn't have one set.
   */
  decryptAppSecret(integration: LeadIntakeIntegration): string | null {
    if (!integration.metaAppSecretEnc) return null;
    try {
      return decrypt(integration.metaAppSecretEnc);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a single Meta lead by leadgen_id and create a corresponding Lead
   * in our database. Best-effort: failures are logged to the integration's
   * `lastError` and surfaced in the dashboard.
   */
  async ingestMetaLead(integrationId: string, leadgenId: string): Promise<void> {
    const integration = await this.loadRawIntegration(integrationId);
    if (!integration) return;
    if (integration.status === 'PAUSED') return;

    try {
      if (!integration.metaPageAccessTokenEnc) {
        throw new Error('Meta page access token is not configured');
      }
      const accessToken = decrypt(integration.metaPageAccessTokenEnc);

      // Dedup: if we've already created a lead for this leadgen_id, skip.
      const existing = await prisma.lead.findFirst({
        where: {
          companyId: integration.companyId,
          deletedAt: null,
          customFields: { path: ['metaLeadgenId'], equals: leadgenId },
        },
        select: { id: true },
      });
      if (existing) return;

      const lead = await fetchMetaLead(leadgenId, accessToken);
      const dto = mapMetaLeadToDto(lead, integration);

      await this.leads.create(integration.companyId, dto, SYSTEM_ACTOR);

      await prisma.leadIntakeIntegration.update({
        where: { id: integration.id },
        data: {
          lastEventAt: new Date(),
          lastError: null,
          status: 'ACTIVE',
          totalLeads: { increment: 1 },
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.leadIntakeIntegration
        .update({
          where: { id: integration.id },
          data: { lastError: message.slice(0, 500), status: 'ERROR' },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Direct lead creation from the authenticated custom webhook.
   * Returns the created lead so the caller (and the API user) can confirm.
   */
  async ingestCustomLead(
    companyId: string,
    body: CreateLeadDto,
  ) {
    if (!body.title?.trim()) {
      throw new BadRequestException('title is required');
    }
    const dto: CreateLeadDto = {
      ...body,
      source: body.source ?? 'WEBHOOK',
    };
    const lead = await this.leads.create(companyId, dto, SYSTEM_ACTOR);
    return { id: lead.id, status: lead.status, score: lead.score, source: lead.source };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Strip the encrypted columns and surface only what the dashboard needs.
   * `metaVerifyToken` is included so the user can copy it; tokens are stored
   * server-side already.
   */
  private toPublicIntegration(row: LeadIntakeIntegration) {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: row.status,
      metaPageId: row.metaPageId,
      metaPageName: row.metaPageName,
      metaVerifyToken: row.metaVerifyToken,
      // Never return raw secrets — replaced with a presence flag
      hasAppSecret: !!row.metaAppSecretEnc,
      hasPageAccessToken: !!row.metaPageAccessTokenEnc,
      lastEventAt: row.lastEventAt,
      lastError: row.lastError,
      totalLeads: row.totalLeads,
      defaultTags: row.defaultTags,
      defaultPriority: row.defaultPriority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ── Module-level pure helpers ──────────────────────────────────────────────

function generateVerifyToken(): string {
  // 32 hex chars is plenty — token is for the Meta handshake only.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchMetaLead(leadgenId: string, accessToken: string): Promise<MetaLeadResponse> {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meta Graph API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as MetaLeadResponse;
}

/**
 * Map a Meta lead's `field_data` array into our `CreateLeadDto`. Tries to
 * pick out a phone number (any field whose name contains "phone") and a
 * display name ("name", "full_name", or first/last). Everything else goes
 * into `customFields` so the data is preserved without us pretending to
 * know the schema.
 */
function mapMetaLeadToDto(
  lead: MetaLeadResponse,
  integration: LeadIntakeIntegration,
): CreateLeadDto {
  const fields = lead.field_data ?? [];
  const fieldMap: Record<string, string> = {};
  for (const f of fields) {
    fieldMap[f.name.toLowerCase()] = (f.values?.[0] ?? '').trim();
  }

  const phone =
    fieldMap['phone_number'] ?? fieldMap['phone'] ?? fieldMap['mobile'] ?? fieldMap['mobile_number'];

  const name =
    fieldMap['full_name'] ??
    fieldMap['name'] ??
    [fieldMap['first_name'], fieldMap['last_name']].filter(Boolean).join(' ').trim() ??
    undefined;

  const title = name ? `Meta Ads lead — ${name}` : `Meta Ads lead — ${lead.id ?? 'unknown'}`;

  return {
    title,
    phoneNumber: phone || undefined,
    contactName: name || undefined,
    source: 'META_ADS',
    priority: integration.defaultPriority,
    tags: integration.defaultTags,
    customFields: {
      metaLeadgenId: lead.id,
      metaCreatedTime: lead.created_time,
      metaAdId: lead.ad_id,
      metaFormId: lead.form_id,
      metaPageId: integration.metaPageId,
      metaPageName: integration.metaPageName,
      ...fieldMap,
    },
    force: true, // Webhook leads bypass duplicate detection — Meta is the source of truth
  };
}

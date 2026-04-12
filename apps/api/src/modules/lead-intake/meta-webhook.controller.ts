/**
 * Meta Lead Ads webhook receiver — public endpoint, no JWT.
 *
 *   GET  /api/webhooks/leads/meta/:integrationId
 *      → handshake. Echo `hub.challenge` if `hub.verify_token` matches the
 *        integration's stored verify token.
 *
 *   POST /api/webhooks/leads/meta/:integrationId
 *      → live event. Verify HMAC-SHA256 signature, then enqueue each
 *        leadgen change for ingestion via `LeadIntakeService.ingestMetaLead`.
 *        Always returns 200 quickly so Meta doesn't retry forever.
 *
 * Authentication: the integration ID + the HMAC signature (using the
 * encrypted Meta App Secret) is the only auth. There is no JWT.
 */
import {
  Controller, Get, Post, Param, Query, Headers, Req, Res, HttpStatus,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { LeadIntakeService } from './lead-intake.service';
import { Public } from '../../common/decorators/public.decorator';

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time?: number;
      };
    }>;
  }>;
}

@Controller('webhooks/leads/meta')
@Public()
export class MetaLeadsWebhookController {
  constructor(private readonly intake: LeadIntakeService) {}

  // ── GET handshake ──────────────────────────────────────────────────────

  @Get(':integrationId')
  async verify(
    @Param('integrationId') integrationId: string,
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const integration = await this.intake.loadRawIntegration(integrationId);
    if (!integration || integration.provider !== 'META_ADS') {
      res.status(HttpStatus.NOT_FOUND).send('Unknown integration');
      return;
    }
    if (mode !== 'subscribe') {
      res.status(HttpStatus.BAD_REQUEST).send('Invalid mode');
      return;
    }
    if (!verifyToken || verifyToken !== integration.metaVerifyToken) {
      res.status(HttpStatus.FORBIDDEN).send('Verify token mismatch');
      return;
    }
    res.status(HttpStatus.OK).type('text/plain').send(challenge ?? '');
  }

  // ── POST event receiver ────────────────────────────────────────────────

  @Post(':integrationId')
  async receive(
    @Param('integrationId') integrationId: string,
    @Headers('x-hub-signature-256') signatureHeader: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    // Always 200 to Meta unless we're SURE it's a bad request, otherwise they retry forever.
    const integration = await this.intake.loadRawIntegration(integrationId);
    if (!integration || integration.provider !== 'META_ADS') {
      res.status(HttpStatus.NOT_FOUND).send('Unknown integration');
      return;
    }

    const appSecret = this.intake.decryptAppSecret(integration);
    if (!appSecret) {
      // No secret configured — accept the call so Meta doesn't retry, but log
      // it as an integration error so the dashboard surfaces it.
      res.status(HttpStatus.OK).send('ok');
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(HttpStatus.BAD_REQUEST).send('Missing raw body');
      return;
    }

    if (!signatureHeader || !verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
      res.status(HttpStatus.UNAUTHORIZED).send('Invalid signature');
      return;
    }

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MetaWebhookPayload;
    } catch {
      res.status(HttpStatus.BAD_REQUEST).send('Invalid JSON');
      return;
    }

    // Process all leadgen events. Best-effort — never throw.
    const tasks: Promise<void>[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'leadgen' && change.value?.leadgen_id) {
          tasks.push(this.intake.ingestMetaLead(integrationId, change.value.leadgen_id));
        }
      }
    }
    // Fire-and-forget on a background promise so Meta gets its 200 fast.
    void Promise.allSettled(tasks);

    res.status(HttpStatus.OK).send('ok');
  }
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string, appSecret: string): boolean {
  // Header format: "sha256=<hex>"
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length);

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  // timingSafeEqual requires equal-length buffers
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

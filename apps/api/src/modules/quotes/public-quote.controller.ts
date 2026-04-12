/**
 * Public quote endpoints — NO authentication, mounted at `/public/quotes`.
 *
 * These routes power the hosted quote page at
 * `apps/dashboard/src/app/public/quotes/[token]/page.tsx`:
 *
 *   GET  /public/quotes/:token              → quote definition (scrubbed, no internal notes)
 *   POST /public/quotes/:token/accept       → customer accepts (status → ACCEPTED)
 *   POST /public/quotes/:token/reject       → customer rejects (status → REJECTED)
 *
 * The only authentication is the unguessable 32-char hex token stored on
 * the Quote row at create time. Quotes are only customer-viewable when
 * status is SENT / VIEWED / ACCEPTED / REJECTED / EXPIRED — DRAFT and
 * REVOKED quotes return 404.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@wacrm/database';
import { Public } from '../../common/decorators/public.decorator';
import { QuotesService } from './quotes.service';

@ApiTags('public-quotes')
@Controller('public/quotes')
@Public()
export class PublicQuoteController {
  constructor(private readonly svc: QuotesService) {}

  @Get(':token')
  async get(@Param('token') token: string) {
    const def = await this.svc.getPublicByToken(token);
    if (!def) throw new NotFoundException('Quote not found');
    // Best-effort mark as viewed (fire-and-forget; don't block the response)
    void this.svc.markViewed(token).catch(() => undefined);
    return def;
  }

  @Post(':token/accept')
  async accept(@Param('token') token: string) {
    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      select: { id: true, companyId: true, status: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== 'SENT' && quote.status !== 'VIEWED') {
      throw new BadRequestException(
        `This quote is no longer pending (status: ${quote.status})`,
      );
    }
    await this.svc.accept(quote.companyId, quote.id, { type: 'public' });
    return { ok: true };
  }

  @Post(':token/reject')
  async reject(
    @Param('token') token: string,
    @Body() body: { reason?: string } = {},
  ) {
    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      select: { id: true, companyId: true, status: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== 'SENT' && quote.status !== 'VIEWED') {
      throw new BadRequestException(
        `This quote is no longer pending (status: ${quote.status})`,
      );
    }
    await this.svc.reject(
      quote.companyId,
      quote.id,
      { type: 'public' },
      body.reason,
    );
    return { ok: true };
  }
}

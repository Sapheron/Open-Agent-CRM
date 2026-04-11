import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { PublicQuoteController } from './public-quote.controller';
import { QuotesService } from './quotes.service';

@Module({
  controllers: [QuotesController, PublicQuoteController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}

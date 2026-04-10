import { Module } from '@nestjs/common';
import { SequencesController, EnrollmentsController } from './sequences.controller';
import { SequencesService } from './sequences.service';

@Module({
  controllers: [SequencesController, EnrollmentsController],
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}

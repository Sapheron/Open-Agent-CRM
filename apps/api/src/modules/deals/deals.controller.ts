import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DealsService, CreateDealDto } from './deals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, DealStage } from '@wacrm/database';

class MoveStageBody { @IsEnum(['LEAD_IN','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST']) stage: DealStage; }

@ApiTags('deals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly svc: DealsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('stage') stage?: DealStage) {
    return this.svc.list(user.companyId, { stage });
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateDealDto) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: Partial<CreateDealDto>) {
    return this.svc.update(user.companyId, id, body);
  }

  @Patch(':id/stage')
  moveStage(@CurrentUser() user: User, @Param('id') id: string, @Body() body: MoveStageBody) {
    return this.svc.moveStage(user.companyId, id, body.stage);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.companyId, id);
  }
}

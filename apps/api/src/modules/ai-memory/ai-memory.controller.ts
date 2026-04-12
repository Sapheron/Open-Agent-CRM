import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { AiMemoryService } from './ai-memory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

class CreateMemoryDto {
  @IsString() title: string;
  @IsString() content: string;
  @IsString() @IsOptional() category?: string;
}

class UpdateMemoryDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() content?: string;
  @IsString() @IsOptional() category?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

@ApiTags('ai-memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@RequirePermissions('memory')
@Controller('ai/memory')
export class AiMemoryController {
  constructor(private readonly svc: AiMemoryService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('category') category?: string) {
    return this.svc.list(user.companyId, category);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateMemoryDto) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateMemoryDto) {
    return this.svc.update(user.companyId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id);
  }
}

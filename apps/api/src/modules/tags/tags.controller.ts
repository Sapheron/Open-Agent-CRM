import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@wacrm/database';

class CreateTagDto {
  @IsString()
  name: string;

  @IsString() @IsOptional()
  color?: string;

  @IsString() @IsOptional()
  description?: string;
}

class UpdateTagDto {
  @IsString() @IsOptional()
  name?: string;

  @IsString() @IsOptional()
  color?: string;

  @IsString() @IsOptional()
  description?: string;
}

@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly svc: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tags for company' })
  list(@CurrentUser() user: User) {
    return this.svc.list(user.companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tag' })
  create(@CurrentUser() user: User, @Body() body: CreateTagDto) {
    return this.svc.create(user.companyId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag (name, color, description)' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateTagDto) {
    return this.svc.update(user.companyId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tag (removes from all contacts)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id);
  }
}

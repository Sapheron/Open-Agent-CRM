/**
 * Templates controller — JWT-protected admin endpoints for template management.
 */
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { TemplatesService } from './templates.service';
import type {
  TemplateActor,
  CreateTemplateDto,
  UpdateTemplateDto,
  ListTemplatesFilters,
} from './templates.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyScopeGuard } from '../../common/guards/company-scope.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User, TemplateType, TemplateCategory, TemplateStatus } from '@wacrm/database';
import { prisma } from '@wacrm/database';
import { NotFoundException, BadRequestException } from '@nestjs/common';

class PreviewBody {
  @IsString() variables: string;
  @IsString() @IsOptional() templateId?: string;
  @IsString() @IsOptional() templateName?: string;
}

function userActor(user: User): TemplateActor {
  return { type: 'user', userId: user.id };
}

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  // ── Reads ──────────────────────────────────────────────────────────────

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('status') status?: TemplateStatus | TemplateStatus[],
    @Query('category') category?: TemplateCategory,
    @Query('type') type?: TemplateType,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
    @Query('sort') sort?: ListTemplatesFilters['sort'],
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list(user.companyId, {
      status,
      category,
      type,
      search,
      tags: tags ? tags.split(',') : undefined,
      sort,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  stats(@CurrentUser() user: User, @Query('days') days?: string) {
    return this.svc.stats(user.companyId, days ? Number(days) : 30);
  }

  @Get('categories')
  categories() {
    return this.svc.getCategories();
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }

  @Get(':id/timeline')
  timeline(@CurrentUser() user: User, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.svc.getTimeline(user.companyId, id, limit ? Number(limit) : 100);
  }

  // ── Writes ─────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new template (always starts in DRAFT)' })
  create(@CurrentUser() user: User, @Body() body: CreateTemplateDto) {
    return this.svc.create(user.companyId, body, userActor(user));
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: UpdateTemplateDto) {
    return this.svc.update(user.companyId, id, body, userActor(user));
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a DRAFT template for use' })
  activate(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.activate(user.companyId, id, userActor(user));
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a template (removes from active list)' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(user.companyId, id, userActor(user));
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a template as a new DRAFT' })
  duplicate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { newName?: string },
  ) {
    return this.svc.duplicate(user.companyId, id, userActor(user), body.newName);
  }

  @Delete(':id')
  @HttpCode(204) // No Content on success
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.delete(user.companyId, id, userActor(user));
  }

  // ── Operations ───────────────────────────────────────────────────────────

  @Post('preview')
  @ApiOperation({ summary: 'Preview a template with variable substitution' })
  async preview(@CurrentUser() user: User, @Body() body: PreviewBody) {
    const vars = JSON.parse(body.variables) as Record<string, string>;

    if (body.templateId) {
      return this.svc.render(user.companyId, body.templateId, vars);
    }

    if (body.templateName) {
      const template = await prisma.template.findFirst({
        where: { companyId: user.companyId, name: body.templateName },
      });
      if (!template) {
        throw new NotFoundException('Template not found');
      }
      return this.svc.render(user.companyId, template.id, vars);
    }

    throw new BadRequestException('Either templateId or templateName is required');
  }

  @Post(':id/usage')
  @ApiOperation({ summary: 'Record template usage (internal endpoint)' })
  recordUsage(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { metadata?: Record<string, unknown> },
  ) {
    return this.svc.recordUsage(user.companyId, id, body.metadata);
  }
}

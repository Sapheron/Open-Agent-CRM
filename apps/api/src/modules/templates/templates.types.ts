/**
 * Templates module types — DTOs, actors, and interfaces.
 *
 * Mirrors the entity upgrade pattern with single-write-path service,
 * activity timeline, and full AI control.
 */
import type { TemplateStatus, TemplateType, TemplateCategory, TemplateActivityType } from '@wacrm/database';

export type TemplateActor =
  | { type: 'user'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'whatsapp' };

export interface CreateTemplateDto {
  name: string;
  type?: TemplateType;
  category?: TemplateCategory;
  body: string;
  mediaUrl?: string;
  language?: string;
  tags?: string[];
  variables?: Record<string, string>; // Default values for {{vars}}
}

export interface UpdateTemplateDto {
  name?: string;
  type?: TemplateType;
  status?: TemplateStatus;
  category?: TemplateCategory;
  body?: string;
  mediaUrl?: string;
  language?: string;
  tags?: string[];
  variables?: Record<string, string>;
}

export interface RenderTemplateDto {
  templateId?: string;
  templateName?: string;
  variables: Record<string, string>;
}

export interface ListTemplatesFilters {
  status?: TemplateStatus | TemplateStatus[];
  category?: TemplateCategory;
  type?: TemplateType;
  search?: string;
  tags?: string[];
  sort?: 'recent' | 'used' | 'name' | 'converting';
  page?: number;
  limit?: number;
}

export interface TemplateStats {
  totalTemplates: number;
  activeTemplates: number;
  draftTemplates: number;
  archivedTemplates: number;
  totalUses: number;
  topTemplates: Array<{
    id: string;
    name: string;
    category: string;
    useCount: number;
    conversionRate: number;
  }>;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
}

export interface AddTemplateActivityInput {
  type: TemplateActivityType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

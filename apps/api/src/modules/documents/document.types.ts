import type { DocumentStatus, DocumentSignatureStatus, DocumentActivityType } from '@wacrm/database';

export type { DocumentStatus, DocumentSignatureStatus, DocumentActivityType };

export interface DocumentActor {
  type: 'user' | 'ai' | 'system';
  id?: string;
}

export interface CreateDocumentDto {
  name: string;
  type: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
  tags?: string[];
  contactId?: string;
  dealId?: string;
  isTemplate?: boolean;
  expiresAt?: string;
  notes?: string;
}

export interface UpdateDocumentDto {
  name?: string;
  type?: string;
  fileUrl?: string;
  description?: string;
  tags?: string[];
  isTemplate?: boolean;
  expiresAt?: string;
  notes?: string;
}

export interface ListDocumentsFilters {
  search?: string;
  type?: string;
  status?: DocumentStatus | DocumentStatus[];
  contactId?: string;
  dealId?: string;
  isTemplate?: boolean;
  page?: number;
  limit?: number;
  sort?: 'recent' | 'name' | 'size';
}

export interface DocumentStatsSnapshot {
  total: number;
  active: number;
  draft: number;
  archived: number;
  templates: number;
  pendingSignatures: number;
  signedTotal: number;
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
}

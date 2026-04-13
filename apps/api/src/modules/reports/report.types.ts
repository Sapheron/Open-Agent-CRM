import type { ReportStatus, ReportType, ReportActivityType } from '@wacrm/database';

export type { ReportStatus, ReportType, ReportActivityType };

export interface ReportActor {
  type: 'user' | 'ai' | 'system';
  id?: string;
}

export interface CreateReportDto {
  name: string;
  entity: string;
  type?: ReportType;
  description?: string;
  tags?: string[];
  filters?: Record<string, unknown>;
  groupBy?: string;
  columns?: string[];
  isPublic?: boolean;
  notes?: string;
}

export interface UpdateReportDto {
  name?: string;
  entity?: string;
  type?: ReportType;
  description?: string;
  tags?: string[];
  filters?: Record<string, unknown>;
  groupBy?: string;
  columns?: string[];
  isPublic?: boolean;
  notes?: string;
}

export interface ListReportsFilters {
  search?: string;
  status?: ReportStatus | ReportStatus[];
  type?: ReportType;
  entity?: string;
  page?: number;
  limit?: number;
  sort?: 'recent' | 'name' | 'runs';
}

export interface ReportStatsSnapshot {
  total: number;
  active: number;
  draft: number;
  archived: number;
  scheduled: number;
  totalRuns: number;
}

export interface RunReportResult {
  reportId: string;
  entity: string;
  total: number;
  rows: unknown[];
  runAt: string;
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
}

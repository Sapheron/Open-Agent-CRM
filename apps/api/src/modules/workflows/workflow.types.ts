import type { WorkflowStatus, WorkflowActivityType } from '@wacrm/database';

export type { WorkflowStatus, WorkflowActivityType };

export interface WorkflowActor {
  type: 'user' | 'ai' | 'system';
  id?: string;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  trigger?: Record<string, unknown>;
  steps?: unknown[];
  tags?: string[];
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  trigger?: Record<string, unknown>;
  steps?: unknown[];
  tags?: string[];
  notes?: string;
}

export interface ListWorkflowsFilters {
  status?: WorkflowStatus | WorkflowStatus[];
  search?: string;
  tags?: string[];
  triggerType?: string;
  page?: number;
  limit?: number;
  sort?: 'recent' | 'name' | 'runs' | 'errors';
}

export interface WorkflowStatsSnapshot {
  total: number;
  active: number;
  paused: number;
  draft: number;
  archived: number;
  runsLast7d: number;
  failuresLast7d: number;
}

export interface BulkMutationResult {
  updated: number;
  failed: number;
}

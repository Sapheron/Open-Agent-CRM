'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Plus, Search, X, Zap, Play, Pause, Archive, Trash2,
  CheckSquare, Square, MoreHorizontal, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  isActive: boolean;
  runCount: number;
  errorCount: number;
  lastRunAt?: string;
  tags: string[];
  trigger?: { type?: string };
  createdAt: string;
}

interface StatsSnapshot {
  total: number;
  active: number;
  paused: number;
  draft: number;
  archived: number;
  runsLast7d: number;
  failuresLast7d: number;
}

interface ListResult {
  total: number;
  page: number;
  limit: number;
  items: WorkflowItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  DRAFT:    'bg-gray-100 text-gray-500',
  ACTIVE:   'bg-emerald-50 text-emerald-600',
  PAUSED:   'bg-amber-50 text-amber-600',
  ARCHIVED: 'bg-red-50 text-red-400',
};

const STATUS_OPTIONS: Array<{ value: WorkflowStatus; label: string }> = [
  { value: 'ACTIVE',   label: 'Active' },
  { value: 'DRAFT',    label: 'Draft' },
  { value: 'PAUSED',   label: 'Paused' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const TRIGGER_OPTIONS = [
  { value: 'CONTACT_CREATED',     label: 'Contact Created' },
  { value: 'CONTACT_UPDATED',     label: 'Contact Updated' },
  { value: 'CONTACT_TAG_ADDED',   label: 'Contact Tag Added' },
  { value: 'LEAD_CREATED',        label: 'Lead Created' },
  { value: 'LEAD_STATUS_CHANGED', label: 'Lead Status Changed' },
  { value: 'DEAL_STAGE_CHANGED',  label: 'Deal Stage Changed' },
  { value: 'TICKET_CREATED',      label: 'Ticket Created' },
  { value: 'FORM_SUBMITTED',      label: 'Form Submitted' },
  { value: 'PAYMENT_RECEIVED',    label: 'Payment Received' },
  { value: 'SCHEDULED',           label: 'Scheduled' },
  { value: 'WEBHOOK_RECEIVED',    label: 'Webhook Received' },
  { value: 'MANUAL',              label: 'Manual' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-col gap-0.5 min-w-[100px]">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-xl font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | ''>('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [sort, setSort]               = useState<'recent' | 'name' | 'runs' | 'errors'>('recent');
  const [page, setPage]               = useState(1);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newDesc, setNewDesc]       = useState('');

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<StatsSnapshot>({
    queryKey: ['workflow-stats'],
    queryFn: async () => {
      const r = await api.get<{ data: StatsSnapshot }>('/workflows/stats');
      return r.data.data;
    },
  });

  const params = new URLSearchParams();
  if (search)        params.set('search', search);
  if (statusFilter)  params.set('status', statusFilter);
  if (triggerFilter) params.set('triggerType', triggerFilter);
  params.set('sort', sort);
  params.set('page', String(page));
  params.set('limit', '25');

  const { data, isLoading } = useQuery<ListResult>({
    queryKey: ['workflows', search, statusFilter, triggerFilter, sort, page],
    queryFn: async () => {
      const r = await api.get<{ data: ListResult }>(`/workflows?${params.toString()}`);
      return r.data.data;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: () => api.post('/workflows', { name: newName, description: newDesc || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      toast.success('Workflow created');
      setShowCreate(false); setNewName(''); setNewDesc('');
    },
    onError: () => toast.error('Failed to create workflow'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/activate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      toast.success('Workflow activated');
    },
    onError: () => toast.error('Failed to activate'),
  });
  const pauseMut = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/pause`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      toast.success('Workflow paused');
    },
    onError: () => toast.error('Failed to pause'),
  });
  const archiveMut = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      toast.success('Workflow archived');
    },
    onError: () => toast.error('Failed to archive'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      toast.success('Workflow deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const runMut = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/run`),
    onSuccess: () => toast.success('Manual run triggered'),
    onError: () => toast.error('Failed to run'),
  });

  const bulkActivateMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/workflows/bulk/activate', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      setSelected(new Set());
      toast.success('Bulk activate done');
    },
  });

  const bulkPauseMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/workflows/bulk/pause', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      setSelected(new Set());
      toast.success('Bulk pause done');
    },
  });

  const bulkArchiveMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/workflows/bulk/archive', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      setSelected(new Set());
      toast.success('Bulk archive done');
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/workflows/bulk/delete', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
      setSelected(new Set());
      toast.success('Bulk delete done');
    },
  });

  // ── Selection helpers ─────────────────────────────────────────────────────────

  const allIds = data?.items.map((w) => w.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const totalPages = data ? Math.ceil(data.total / 25) : 1;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          <Zap size={13} className="text-violet-500" /> Workflows
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
        >
          <Plus size={11} /> New Workflow
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex gap-3 overflow-x-auto shrink-0">
          <StatCard label="Total"    value={stats.total} />
          <StatCard label="Active"   value={stats.active} />
          <StatCard label="Paused"   value={stats.paused} />
          <StatCard label="Draft"    value={stats.draft} />
          <StatCard label="Runs 7d"  value={stats.runsLast7d} />
          <StatCard label="Failures 7d" value={stats.failuresLast7d} sub="last 7 days" />
        </div>
      )}

      {/* Filter rail */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search workflows..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={11} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as WorkflowStatus | ''); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-300"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={triggerFilter}
          onChange={(e) => { setTriggerFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-300"
        >
          <option value="">All Triggers</option>
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-300"
        >
          <option value="recent">Sort: Recent</option>
          <option value="name">Sort: Name</option>
          <option value="runs">Sort: Runs</option>
          <option value="errors">Sort: Errors</option>
        </select>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="px-4 py-2 border-b border-violet-100 bg-violet-50 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-violet-700">{selected.size} selected</span>
          <button
            onClick={() => bulkActivateMut.mutate(Array.from(selected))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Play size={10} /> Activate
          </button>
          <button
            onClick={() => bulkPauseMut.mutate(Array.from(selected))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
          >
            <Pause size={10} /> Pause
          </button>
          <button
            onClick={() => bulkArchiveMut.mutate(Array.from(selected))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
          >
            <Archive size={10} /> Archive
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} workflows permanently?`))
                bulkDeleteMut.mutate(Array.from(selected));
            }}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            <Trash2 size={10} /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[11px] text-violet-500 hover:underline">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <Zap size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-xs text-gray-400">No workflows found</p>
            {(search || statusFilter || triggerFilter) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setTriggerFilter(''); }}
                className="mt-2 text-[11px] text-violet-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="w-8 px-3 py-2">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                    {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                </th>
                {['Name', 'Status', 'Trigger', 'Runs', 'Errors', 'Last Run', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.items.map((w) => (
                <tr key={w.id} className={cn('hover:bg-gray-50/60 transition-colors', selected.has(w.id) && 'bg-violet-50/40')}>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggleOne(w.id)} className="text-gray-400 hover:text-violet-500">
                      {selected.has(w.id) ? <CheckSquare size={13} className="text-violet-500" /> : <Square size={13} />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/workflows/${w.id}`} className="text-xs font-medium text-gray-900 hover:text-violet-600">
                      {w.name}
                    </Link>
                    {w.description && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{w.description}</p>
                    )}
                    {w.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {w.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-violet-50 text-violet-500">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[w.status])}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-500">
                    {w.trigger?.type?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{w.runCount}</td>
                  <td className="px-3 py-2.5 text-xs text-red-400">{w.errorCount > 0 ? w.errorCount : '—'}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-400">
                    {w.lastRunAt ? new Date(w.lastRunAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {w.status === 'DRAFT' || w.status === 'PAUSED' ? (
                        <button
                          onClick={() => activateMut.mutate(w.id)}
                          title="Activate"
                          className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600"
                        >
                          <Play size={11} />
                        </button>
                      ) : w.status === 'ACTIVE' ? (
                        <button
                          onClick={() => pauseMut.mutate(w.id)}
                          title="Pause"
                          className="p-1 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-500"
                        >
                          <Pause size={11} />
                        </button>
                      ) : null}
                      <button
                        onClick={() => runMut.mutate(w.id)}
                        title="Run now"
                        className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                      >
                        <RefreshCw size={11} />
                      </button>
                      <button
                        onClick={() => archiveMut.mutate(w.id)}
                        title="Archive"
                        className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500"
                      >
                        <Archive size={11} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this workflow permanently?')) deleteMut.mutate(w.id);
                        }}
                        title="Delete"
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                      <Link href={`/workflows/${w.id}`} className="p-1 rounded hover:bg-violet-50 text-gray-300 hover:text-violet-500">
                        <MoreHorizontal size={11} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="h-9 border-t border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-[10px] text-gray-400">{data?.total ?? 0} workflows</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="text-[10px] text-gray-400">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">New Workflow</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Welcome new contacts"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="What does this workflow do?"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMut.mutate()}
                disabled={!newName.trim() || createMut.isPending}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-1.5 rounded text-xs font-medium disabled:opacity-40"
              >
                {createMut.isPending ? 'Creating...' : 'Create Workflow'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-1.5 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Play, Pause, Archive, ArchiveRestore, Trash2,
  Copy, RefreshCw, MessageSquarePlus, Zap, Clock, CheckCircle2,
  XCircle, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkflowStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  isActive: boolean;
  runCount: number;
  errorCount: number;
  lastRunAt?: string;
  publishedAt?: string;
  tags: string[];
  trigger?: Record<string, unknown>;
  steps?: unknown[];
  createdAt: string;
  updatedAt: string;
  _count?: { executions: number };
}

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  actorType: string;
  actorId?: string;
  title: string;
  body?: string;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  DRAFT:    'bg-gray-100 text-gray-500',
  ACTIVE:   'bg-emerald-50 text-emerald-600',
  PAUSED:   'bg-amber-50 text-amber-600',
  ARCHIVED: 'bg-red-50 text-red-400',
};

const EXEC_STATUS_ICON: Record<string, React.ReactNode> = {
  RUNNING:   <RefreshCw size={12} className="text-blue-500 animate-spin" />,
  COMPLETED: <CheckCircle2 size={12} className="text-emerald-500" />,
  FAILED:    <XCircle size={12} className="text-red-400" />,
  SKIPPED:   <AlertCircle size={12} className="text-gray-400" />,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'steps' | 'executions' | 'activity'>('steps');
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: workflow, isLoading } = useQuery<Workflow>({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const r = await api.get<{ data: Workflow }>(`/workflows/${id}`);
      return r.data.data;
    },
  });

  const { data: executions = [] } = useQuery<Execution[]>({
    queryKey: ['workflow-executions', id],
    queryFn: async () => {
      const r = await api.get<{ data: Execution[] }>(`/workflows/${id}/executions?limit=30`);
      return r.data.data;
    },
    enabled: tab === 'executions',
  });

  const { data: timeline = [] } = useQuery<ActivityEvent[]>({
    queryKey: ['workflow-timeline', id],
    queryFn: async () => {
      const r = await api.get<{ data: ActivityEvent[] }>(`/workflows/${id}/timeline`);
      return r.data.data;
    },
    enabled: tab === 'activity',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['workflow', id] });
    void qc.invalidateQueries({ queryKey: ['workflow-stats'] });
    void qc.invalidateQueries({ queryKey: ['workflows'] });
  }

  const activateMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/activate`),
    onSuccess: () => { refresh(); toast.success('Workflow activated'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to activate'),
  });

  const pauseMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/pause`),
    onSuccess: () => { refresh(); toast.success('Workflow paused'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to pause'),
  });

  const archiveMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/archive`),
    onSuccess: () => { refresh(); toast.success('Workflow archived'); },
    onError: () => toast.error('Failed to archive'),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/restore`),
    onSuccess: () => { refresh(); toast.success('Workflow restored to DRAFT'); },
    onError: () => toast.error('Failed to restore'),
  });

  const duplicateMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/duplicate`),
    onSuccess: (r: any) => {
      const newId = r.data.data?.id;
      toast.success('Workflow duplicated');
      if (newId) router.push(`/workflows/${newId}`);
    },
    onError: () => toast.error('Failed to duplicate'),
  });

  const runMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/run`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow-executions', id] });
      toast.success('Manual run triggered');
    },
    onError: () => toast.error('Failed to run'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/workflows/${id}`),
    onSuccess: () => { toast.success('Workflow deleted'); router.push('/workflows'); },
    onError: () => toast.error('Failed to delete'),
  });

  const addNoteMut = useMutation({
    mutationFn: () => api.post(`/workflows/${id}/notes`, { note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflow-timeline', id] });
      setNote('');
      setAddingNote(false);
      toast.success('Note added');
    },
    onError: () => toast.error('Failed to add note'),
  });

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-400">
        Loading workflow...
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <p className="text-xs text-gray-400">Workflow not found</p>
        <Link href="/workflows" className="text-xs text-violet-500 hover:underline">Back to workflows</Link>
      </div>
    );
  }

  const steps = (workflow.steps ?? []) as Array<Record<string, unknown>>;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <Link href="/workflows" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />
        </Link>
        <Zap size={13} className="text-violet-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-900 truncate flex-1">{workflow.name}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[workflow.status])}>
          {workflow.status}
        </span>
      </div>

      {/* Body: left metadata + center content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <aside className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Quick stats */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Runs</span>
                <span className="text-xs font-medium text-gray-700">{workflow.runCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Errors</span>
                <span className={cn('text-xs font-medium', workflow.errorCount > 0 ? 'text-red-500' : 'text-gray-400')}>
                  {workflow.errorCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Executions</span>
                <span className="text-xs font-medium text-gray-700">{workflow._count?.executions ?? 0}</span>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Trigger */}
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Trigger</p>
              <span className="text-[11px] text-gray-600 bg-violet-50 px-1.5 py-0.5 rounded">
                {(workflow.trigger as any)?.type?.replace(/_/g, ' ') ?? 'Not set'}
              </span>
            </div>

            {/* Tags */}
            {workflow.tags.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {workflow.tags.map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-500">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {workflow.description && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{workflow.description}</p>
              </div>
            )}

            <hr className="border-gray-100" />

            {/* Timestamps */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Clock size={9} className="text-gray-300" />
                <span className="text-[10px] text-gray-400">Created {new Date(workflow.createdAt).toLocaleDateString()}</span>
              </div>
              {workflow.lastRunAt && (
                <div className="flex items-center gap-1.5">
                  <RefreshCw size={9} className="text-gray-300" />
                  <span className="text-[10px] text-gray-400">Last run {new Date(workflow.lastRunAt).toLocaleDateString()}</span>
                </div>
              )}
              {workflow.publishedAt && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={9} className="text-emerald-300" />
                  <span className="text-[10px] text-gray-400">Published {new Date(workflow.publishedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200 bg-white px-4 flex gap-4 shrink-0">
            {(['steps', 'executions', 'activity'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'py-2.5 text-[11px] font-medium capitalize border-b-2 transition-colors',
                  tab === t
                    ? 'border-violet-500 text-violet-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {/* Steps tab */}
            {tab === 'steps' && (
              <div className="space-y-3">
                {/* Trigger block */}
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-1">Trigger</p>
                  <pre className="text-[11px] text-violet-700 font-mono whitespace-pre-wrap">
                    {JSON.stringify(workflow.trigger ?? {}, null, 2)}
                  </pre>
                </div>

                {/* Steps */}
                {steps.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Zap size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No steps defined yet</p>
                    <p className="text-[11px] text-gray-300 mt-1">Ask the AI to add steps to this workflow</p>
                  </div>
                ) : (
                  steps.map((step, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[11px] font-medium text-gray-700">
                          {String((step as any).type ?? 'Unknown').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap pl-7">
                        {JSON.stringify((step as any).config ?? step, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Executions tab */}
            {tab === 'executions' && (
              <div>
                {executions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <RefreshCw size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No executions yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {executions.map((e) => (
                      <div key={e.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-3">
                        {EXEC_STATUS_ICON[e.status] ?? <AlertCircle size={12} className="text-gray-300" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-gray-700">{e.status}</p>
                          {e.errorMessage && (
                            <p className="text-[10px] text-red-400 truncate">{e.errorMessage}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400">{new Date(e.startedAt).toLocaleString()}</p>
                          {e.finishedAt && (
                            <p className="text-[9px] text-gray-300">
                              {((new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime()) / 1000).toFixed(1)}s
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Activity tab */}
            {tab === 'activity' && (
              <div className="space-y-2">
                {/* Add note */}
                {addingNote ? (
                  <div className="bg-white border border-violet-200 rounded-lg p-3 space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a note..."
                      rows={2}
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => addNoteMut.mutate()}
                        disabled={!note.trim() || addNoteMut.isPending}
                        className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-40"
                      >
                        Save Note
                      </button>
                      <button onClick={() => setAddingNote(false)} className="text-gray-400 text-[11px]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingNote(true)}
                    className="flex items-center gap-1.5 text-[11px] text-violet-500 hover:text-violet-700"
                  >
                    <MessageSquarePlus size={12} /> Add note
                  </button>
                )}

                {/* Timeline */}
                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Clock size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No activity yet</p>
                  </div>
                ) : (
                  <div className="relative pl-4 space-y-0">
                    {timeline.map((e, i) => (
                      <div key={e.id} className="relative pb-3">
                        {i < timeline.length - 1 && (
                          <span className="absolute left-[-9px] top-3.5 bottom-0 w-px bg-gray-100" />
                        )}
                        <span className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-violet-400 border-2 border-white" />
                        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-medium text-gray-700">{e.title}</p>
                            <span className="text-[9px] text-gray-300 shrink-0">
                              {new Date(e.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {e.body && <p className="text-[10px] text-gray-400 mt-0.5">{e.body}</p>}
                          <p className="text-[9px] text-gray-300 mt-0.5">
                            {e.actorType}{e.actorId ? ` · ${e.actorId.slice(0, 8)}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right action panel */}
        <aside className="w-40 border-l border-gray-200 bg-white shrink-0 p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Actions</p>

          {(workflow.status === 'DRAFT' || workflow.status === 'PAUSED') && (
            <button
              onClick={() => activateMut.mutate()}
              disabled={activateMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium w-full"
            >
              <Play size={10} /> Activate
            </button>
          )}

          {workflow.status === 'ACTIVE' && (
            <button
              onClick={() => pauseMut.mutate()}
              disabled={pauseMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium w-full"
            >
              <Pause size={10} /> Pause
            </button>
          )}

          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full"
          >
            <RefreshCw size={10} /> Run Now
          </button>

          <button
            onClick={() => duplicateMut.mutate()}
            disabled={duplicateMut.isPending}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full"
          >
            <Copy size={10} /> Duplicate
          </button>

          {workflow.status !== 'ARCHIVED' ? (
            <button
              onClick={() => archiveMut.mutate()}
              disabled={archiveMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500 w-full"
            >
              <Archive size={10} /> Archive
            </button>
          ) : (
            <button
              onClick={() => restoreMut.mutate()}
              disabled={restoreMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full"
            >
              <ArchiveRestore size={10} /> Restore
            </button>
          )}

          <hr className="border-gray-100 my-1" />

          <button
            onClick={() => {
              if (confirm('Delete this workflow permanently?')) deleteMut.mutate();
            }}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-red-100 hover:bg-red-50 text-red-400 w-full"
          >
            <Trash2 size={10} /> Delete
          </button>
        </aside>
      </div>
    </div>
  );
}

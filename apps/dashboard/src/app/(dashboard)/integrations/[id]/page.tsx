'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Plug, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Trash2, Zap, Clock, MessageSquarePlus,
} from 'lucide-react';
import { toast } from 'sonner';

type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'SYNCING';

interface Integration {
  id: string;
  type: string;
  name?: string;
  status: IntegrationStatus;
  isActive: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  syncCount: number;
  lastSyncAt?: string;
  lastError?: string;
  config?: Record<string, unknown>;
  createdAt: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  actorType: string;
  title: string;
  createdAt: string;
}

interface WebhookLog {
  id: string;
  method: string;
  url: string;
  statusCode?: number;
  latencyMs?: number;
  createdAt: string;
}

const STATUS_COLORS: Record<IntegrationStatus, string> = {
  DISCONNECTED: 'bg-gray-100 text-gray-500',
  CONNECTED:    'bg-emerald-50 text-emerald-600',
  ERROR:        'bg-red-50 text-red-500',
  SYNCING:      'bg-gray-50 text-gray-800',
};

const STATUS_ICON: Record<IntegrationStatus, React.ReactNode> = {
  DISCONNECTED: <XCircle size={13} className="text-gray-400" />,
  CONNECTED:    <CheckCircle2 size={13} className="text-emerald-500" />,
  ERROR:        <AlertCircle size={13} className="text-red-400" />,
  SYNCING:      <RefreshCw size={13} className="text-gray-400 animate-spin" />,
};

export default function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'config' | 'webhooks' | 'activity'>('config');
  const [webhookPayload, setWebhookPayload] = useState('{"event": "test"}');
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const { data: integration, isLoading } = useQuery<Integration>({
    queryKey: ['integration', id],
    queryFn: async () => {
      const r = await api.get<{ data: Integration }>(`/integrations/${id}`);
      return r.data.data;
    },
  });

  const { data: webhookLogs = [] } = useQuery<WebhookLog[]>({
    queryKey: ['webhook-logs', id],
    queryFn: async () => {
      const r = await api.get<{ data: WebhookLog[] }>(`/integrations/${id}/webhook-logs`);
      return r.data.data;
    },
    enabled: tab === 'webhooks',
  });

  const { data: timeline = [] } = useQuery<ActivityEvent[]>({
    queryKey: ['integration-timeline', id],
    queryFn: async () => {
      const r = await api.get<{ data: ActivityEvent[] }>(`/integrations/${id}/timeline`);
      return r.data.data;
    },
    enabled: tab === 'activity',
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['integration', id] });
    void qc.invalidateQueries({ queryKey: ['integrations'] });
  }

  const connectMut = useMutation({
    mutationFn: () => api.post(`/integrations/${id}/connect`),
    onSuccess: () => { refresh(); toast.success('Connected'); },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.post(`/integrations/${id}/disconnect`),
    onSuccess: () => { refresh(); toast.success('Disconnected'); },
  });

  const testMut = useMutation({
    mutationFn: () => api.post(`/integrations/${id}/test`),
    onSuccess: (r: any) => toast.success(r.data.data?.message ?? 'Test done'),
    onError: () => toast.error('Test failed'),
  });

  const syncMut = useMutation({
    mutationFn: () => api.post(`/integrations/${id}/sync`),
    onSuccess: (r: any) => { refresh(); toast.success(r.data.data?.message ?? 'Sync started'); },
  });

  const triggerMut = useMutation({
    mutationFn: () => {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(webhookPayload); } catch { payload = {}; }
      return api.post(`/integrations/${id}/webhook`, payload);
    },
    onSuccess: (r: any) => {
      void qc.invalidateQueries({ queryKey: ['webhook-logs', id] });
      toast.success(`Webhook sent — status ${r.data.data?.statusCode}`);
    },
    onError: () => toast.error('Webhook failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/integrations/${id}`),
    onSuccess: () => { toast.success('Deleted'); router.push('/integrations'); },
  });

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading...</div>;
  }
  if (!integration) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <p className="text-xs text-gray-400">Integration not found</p>
        <Link href="/integrations" className="text-xs text-emerald-500 hover:underline">Back</Link>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <Link href="/integrations" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={14} /></Link>
        <Plug size={13} className="text-emerald-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-900 flex-1 truncate">
          {integration.name ?? integration.type}
        </span>
        <div className="flex items-center gap-1.5">
          {STATUS_ICON[integration.status]}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[integration.status])}>
            {integration.status}
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left */}
        <aside className="w-52 border-r border-gray-200 bg-white shrink-0 overflow-y-auto p-3 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Type</span>
              <span className="text-xs font-medium text-gray-700">{integration.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Syncs</span>
              <span className="text-xs font-medium text-gray-700">{integration.syncCount}</span>
            </div>
            {integration.lastSyncAt && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Last sync</span>
                <span className="text-xs text-gray-500">{new Date(integration.lastSyncAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {integration.lastError && (
            <>
              <hr className="border-gray-100" />
              <div>
                <p className="text-[10px] font-medium text-red-400 mb-1">Last Error</p>
                <p className="text-[10px] text-red-400">{integration.lastError}</p>
              </div>
            </>
          )}

          {integration.webhookUrl && (
            <>
              <hr className="border-gray-100" />
              <div>
                <p className="text-[10px] font-medium text-gray-400 mb-1">Webhook URL</p>
                <p className="text-[10px] text-gray-600 break-all">{integration.webhookUrl}</p>
              </div>
            </>
          )}

          <hr className="border-gray-100" />
          <div className="flex items-center gap-1.5">
            <Clock size={9} className="text-gray-300" />
            <span className="text-[10px] text-gray-400">Created {new Date(integration.createdAt).toLocaleDateString()}</span>
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-gray-200 bg-white px-4 flex gap-4 shrink-0">
            {(['config', 'webhooks', 'activity'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('py-2.5 text-[11px] font-medium capitalize border-b-2 transition-colors',
                  tab === t ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600')}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {tab === 'config' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Configuration</h3>
                  <pre className="text-[11px] text-gray-600 font-mono whitespace-pre-wrap">
                    {JSON.stringify(integration.config ?? {}, null, 2)}
                  </pre>
                </div>
                {integration.webhookUrl && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-gray-700 mb-3">Webhook Details</h3>
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-600"><span className="font-medium">URL:</span> {integration.webhookUrl}</p>
                      {integration.webhookSecret && <p className="text-[11px] text-gray-600"><span className="font-medium">Secret:</span> ••••••••</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'webhooks' && (
              <div className="space-y-3">
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-700">Trigger Webhook</p>
                  <textarea value={webhookPayload} onChange={(e) => setWebhookPayload(e.target.value)} rows={3}
                    className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  <button onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                    <Zap size={10} /> {triggerMut.isPending ? 'Sending...' : 'Send Webhook'}
                  </button>
                </div>

                {webhookLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Zap size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No webhook logs yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {webhookLogs.map((log) => (
                      <div key={log.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-3">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono font-medium',
                          (log.statusCode ?? 0) >= 200 && (log.statusCode ?? 0) < 300 ? 'bg-emerald-50 text-emerald-600' :
                          (log.statusCode ?? 0) >= 400 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500')}>
                          {log.statusCode ?? '—'}
                        </span>
                        <span className="text-[11px] text-gray-500 flex-1 truncate">{log.method} {log.url}</span>
                        {log.latencyMs && <span className="text-[10px] text-gray-400">{log.latencyMs}ms</span>}
                        <span className="text-[10px] text-gray-300">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'activity' && (
              <div className="space-y-2">
                {addingNote ? (
                  <div className="bg-white border border-emerald-200 rounded-lg p-3 space-y-2">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note..."
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <div className="flex gap-2">
                      <button onClick={() => setAddingNote(false)} className="text-gray-400 text-[11px]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingNote(true)}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-500 hover:text-emerald-700">
                    <MessageSquarePlus size={12} /> Add note
                  </button>
                )}

                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Clock size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No activity yet</p>
                  </div>
                ) : (
                  <div className="relative pl-4 space-y-0">
                    {timeline.map((e, i) => (
                      <div key={e.id} className="relative pb-3">
                        {i < timeline.length - 1 && <span className="absolute left-[-9px] top-3.5 bottom-0 w-px bg-gray-100" />}
                        <span className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-white" />
                        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-medium text-gray-700">{e.title}</p>
                            <span className="text-[9px] text-gray-300 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right */}
        <aside className="w-40 border-l border-gray-200 bg-white shrink-0 p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Actions</p>

          {integration.status !== 'CONNECTED' ? (
            <button onClick={() => connectMut.mutate()} disabled={connectMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium w-full">
              <CheckCircle2 size={10} /> Connect
            </button>
          ) : (
            <button onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full">
              <XCircle size={10} /> Disconnect
            </button>
          )}

          <button onClick={() => testMut.mutate()} disabled={testMut.isPending}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full">
            <AlertCircle size={10} /> Test
          </button>

          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full">
            <RefreshCw size={10} /> Sync
          </button>

          <hr className="border-gray-100 my-1" />

          <button onClick={() => { if (confirm('Delete?')) deleteMut.mutate(); }}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-red-100 hover:bg-red-50 text-red-400 w-full">
            <Trash2 size={10} /> Delete
          </button>
        </aside>
      </div>
    </div>
  );
}

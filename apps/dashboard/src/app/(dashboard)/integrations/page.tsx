'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Plus, Plug, X, RefreshCw, CheckCircle2, XCircle, AlertCircle, Zap,
  Calendar, Mail, Webhook, BarChart3, Camera, CreditCard, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR' | 'SYNCING';
type IntegrationType =
  | 'GOOGLE_CALENDAR' | 'GOOGLE_SHEETS' | 'SLACK' | 'ZAPIER'
  | 'WEBHOOK' | 'EMAIL_SMTP' | 'FACEBOOK_ADS' | 'INSTAGRAM'
  | 'STRIPE' | 'RAZORPAY' | 'CUSTOM';

interface Integration {
  id: string;
  type: IntegrationType;
  name?: string;
  status: IntegrationStatus;
  isActive: boolean;
  webhookUrl?: string;
  syncCount: number;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
}

interface StatsSnapshot {
  total: number;
  connected: number;
  disconnected: number;
  error: number;
  syncing: number;
  webhookLogs24h: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<IntegrationStatus, string> = {
  DISCONNECTED: 'bg-gray-100 text-gray-500',
  CONNECTED:    'bg-emerald-50 text-emerald-600',
  ERROR:        'bg-red-50 text-red-500',
  SYNCING:      'bg-blue-50 text-blue-500',
};

const STATUS_ICON: Record<IntegrationStatus, React.ReactNode> = {
  DISCONNECTED: <XCircle size={14} className="text-gray-400" />,
  CONNECTED:    <CheckCircle2 size={14} className="text-emerald-500" />,
  ERROR:        <AlertCircle size={14} className="text-red-400" />,
  SYNCING:      <RefreshCw size={14} className="text-blue-400 animate-spin" />,
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  GOOGLE_CALENDAR: <Calendar size={18} className="text-blue-500" />,
  GOOGLE_SHEETS:   <BarChart3 size={18} className="text-emerald-500" />,
  SLACK:           <Zap size={18} className="text-amber-500" />,
  ZAPIER:          <Zap size={18} className="text-orange-500" />,
  WEBHOOK:         <Webhook size={18} className="text-violet-500" />,
  EMAIL_SMTP:      <Mail size={18} className="text-blue-400" />,
  FACEBOOK_ADS:    <BarChart3 size={18} className="text-blue-600" />,
  INSTAGRAM:       <Camera size={18} className="text-pink-500" />,
  STRIPE:          <CreditCard size={18} className="text-violet-600" />,
  RAZORPAY:        <CreditCard size={18} className="text-blue-500" />,
  CUSTOM:          <Settings size={18} className="text-gray-500" />,
};

const INTEGRATION_TYPES: Array<{ value: IntegrationType; label: string }> = [
  { value: 'GOOGLE_CALENDAR', label: 'Google Calendar' },
  { value: 'GOOGLE_SHEETS',   label: 'Google Sheets' },
  { value: 'SLACK',           label: 'Slack' },
  { value: 'ZAPIER',          label: 'Zapier' },
  { value: 'WEBHOOK',         label: 'Webhook' },
  { value: 'EMAIL_SMTP',      label: 'Email SMTP' },
  { value: 'FACEBOOK_ADS',    label: 'Facebook Ads' },
  { value: 'INSTAGRAM',       label: 'Instagram' },
  { value: 'STRIPE',          label: 'Stripe' },
  { value: 'RAZORPAY',        label: 'Razorpay' },
  { value: 'CUSTOM',          label: 'Custom' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-col gap-0.5 min-w-[100px]">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-xl font-bold text-gray-900 leading-none">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const qc = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<IntegrationType | ''>('');
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<IntegrationType>('WEBHOOK');
  const [newName, setNewName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<StatsSnapshot>({
    queryKey: ['integration-stats'],
    queryFn: async () => {
      const r = await api.get<{ data: StatsSnapshot }>('/integrations/stats');
      return r.data.data;
    },
  });

  const params = new URLSearchParams();
  if (typeFilter)   params.set('type', typeFilter);
  if (statusFilter) params.set('status', statusFilter);

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ['integrations', typeFilter, statusFilter],
    queryFn: async () => {
      const r = await api.get<{ data: Integration[] }>(`/integrations?${params.toString()}`);
      return r.data.data;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['integrations'] });
    void qc.invalidateQueries({ queryKey: ['integration-stats'] });
  }

  const createMut = useMutation({
    mutationFn: () => api.post('/integrations', {
      type: newType, name: newName || undefined,
      webhookUrl: newWebhookUrl || undefined,
    }),
    onSuccess: () => {
      refresh(); toast.success('Integration created');
      setShowCreate(false); setNewName(''); setNewWebhookUrl('');
    },
    onError: () => toast.error('Failed to create'),
  });

  const connectMut = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/connect`),
    onSuccess: () => { refresh(); toast.success('Connected'); },
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/disconnect`),
    onSuccess: () => { refresh(); toast.success('Disconnected'); },
  });

  const testMut = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/test`),
    onSuccess: (r: any) => toast.success(r.data.data?.message ?? 'Test done'),
    onError: () => toast.error('Test failed'),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => api.post(`/integrations/${id}/sync`),
    onSuccess: (r: any) => { refresh(); toast.success(r.data.data?.message ?? 'Sync started'); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/integrations/${id}`),
    onSuccess: () => { refresh(); toast.success('Deleted'); },
  });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          <Plug size={13} className="text-emerald-500" /> Integrations
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
        >
          <Plus size={11} /> New Integration
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex gap-3 overflow-x-auto shrink-0">
          <StatCard label="Total"        value={stats.total} />
          <StatCard label="Connected"    value={stats.connected} />
          <StatCard label="Disconnected" value={stats.disconnected} />
          <StatCard label="Errors"       value={stats.error} />
          <StatCard label="Webhooks 24h" value={stats.webhookLogs24h} />
        </div>
      )}

      {/* Filter */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as IntegrationType | '')}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
        >
          <option value="">All Types</option>
          {INTEGRATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IntegrationStatus | '')}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="CONNECTED">Connected</option>
          <option value="DISCONNECTED">Disconnected</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-12 text-xs text-gray-400">Loading...</div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-16">
            <Plug size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-xs text-gray-400">No integrations yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-[11px] text-emerald-500 hover:underline"
            >
              Add your first integration
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {integrations.map((intg) => (
              <div key={intg.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {TYPE_ICONS[intg.type] ?? <Settings size={18} className="text-gray-400" />}
                    <div>
                      <p className="text-xs font-semibold text-gray-800">
                        {intg.name ?? INTEGRATION_TYPES.find(t => t.value === intg.type)?.label ?? intg.type}
                      </p>
                      <p className="text-[10px] text-gray-400">{intg.type}</p>
                    </div>
                  </div>
                  {STATUS_ICON[intg.status]}
                </div>

                {/* Status badge */}
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium w-fit', STATUS_COLORS[intg.status])}>
                  {intg.status}
                </span>

                {/* Meta */}
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400">Syncs: {intg.syncCount}</p>
                  {intg.lastSyncAt && (
                    <p className="text-[10px] text-gray-400">Last sync: {new Date(intg.lastSyncAt).toLocaleDateString()}</p>
                  )}
                  {intg.lastError && (
                    <p className="text-[10px] text-red-400 truncate">{intg.lastError}</p>
                  )}
                  {intg.webhookUrl && (
                    <p className="text-[10px] text-gray-400 truncate">{intg.webhookUrl}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-wrap mt-auto pt-1 border-t border-gray-100">
                  {intg.status === 'DISCONNECTED' || intg.status === 'ERROR' ? (
                    <button
                      onClick={() => connectMut.mutate(intg.id)}
                      className="text-[10px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      onClick={() => disconnectMut.mutate(intg.id)}
                      className="text-[10px] px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => testMut.mutate(intg.id)}
                    className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => syncMut.mutate(intg.id)}
                    className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Sync
                  </button>
                  <Link
                    href={`/integrations/${intg.id}`}
                    className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Details
                  </Link>
                  <button
                    onClick={() => { if (confirm('Delete?')) deleteMut.mutate(intg.id); }}
                    className="text-[10px] px-2 py-1 rounded border border-red-100 text-red-400 hover:bg-red-50 ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">New Integration</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Type *</label>
                <select value={newType} onChange={(e) => setNewType(e.target.value as IntegrationType)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  {INTEGRATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Name (optional)</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Friendly name"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              {(newType === 'WEBHOOK' || newType === 'ZAPIER') && (
                <div>
                  <label className="text-[11px] font-medium text-gray-600 block mb-1">Webhook URL</label>
                  <input value={newWebhookUrl} onChange={(e) => setNewWebhookUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-1.5 rounded text-xs font-medium disabled:opacity-40"
              >
                {createMut.isPending ? 'Creating...' : 'Create Integration'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-1.5 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

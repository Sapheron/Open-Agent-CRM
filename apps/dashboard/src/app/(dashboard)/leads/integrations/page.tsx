'use client';

/**
 * Leads → Integrations page.
 *
 * Three sections in one scrolling page:
 *   1. Meta Ads connections — list, create, copy webhook URL + verify token
 *   2. API keys — generate / list / revoke
 *   3. Docs — Meta walkthrough + custom webhook curl examples
 *
 * The Meta panel is gated by `GET /lead-integrations/eligibility`. When the
 * CRM isn't on a real domain (API_PUBLIC_URL is missing or points at localhost)
 * the panel renders disabled with an explanation.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Copy, Check, Trash2, Power, PowerOff, AlertTriangle,
  Key, Webhook, BookOpen, Globe, X, Eye, EyeOff,
} from 'lucide-react';

interface Eligibility {
  eligible: boolean;
  publicUrl?: string;
  webhookBaseUrl?: string;
  customWebhookUrl?: string | null;
  reason?: string;
}

interface Integration {
  id: string;
  provider: 'META_ADS' | 'CUSTOM_WEBHOOK';
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  metaPageId?: string | null;
  metaPageName?: string | null;
  metaVerifyToken?: string | null;
  hasAppSecret?: boolean;
  hasPageAccessToken?: boolean;
  lastEventAt?: string | null;
  lastError?: string | null;
  totalLeads: number;
  defaultTags: string[];
  defaultPriority: string;
  createdAt: string;
  updatedAt: string;
  webhookUrl?: string | null;
  _onceOnly?: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}
interface ApiKeyWithSecret extends ApiKey {
  key?: string;
}

const SCOPE_OPTIONS = ['leads:write', 'leads:read', 'webhooks:meta'];

export default function LeadsIntegrationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [createdIntegration, setCreatedIntegration] = useState<Integration | null>(null);
  const [createdApiKey, setCreatedApiKey] = useState<ApiKeyWithSecret | null>(null);

  const { data: eligibility } = useQuery({
    queryKey: ['lead-integrations', 'eligibility'],
    queryFn: async () => {
      const r = await api.get<{ data: Eligibility }>('/lead-integrations/eligibility');
      return r.data.data;
    },
  });

  const { data: integrations } = useQuery({
    queryKey: ['lead-integrations'],
    queryFn: async () => {
      const r = await api.get<{ data: Integration[] }>('/lead-integrations');
      return r.data.data;
    },
  });

  const { data: apiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const r = await api.get<{ data: ApiKey[] }>('/api-keys');
      return r.data.data;
    },
  });

  const deleteIntegration = useMutation({
    mutationFn: (id: string) => api.delete(`/lead-integrations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-integrations'] });
      toast.success('Integration removed');
    },
  });

  const toggleIntegration = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      api.patch(`/lead-integrations/${id}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-integrations'] });
    },
  });

  const revokeApiKey = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-2 shrink-0 bg-white">
        <button onClick={() => router.push('/leads')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />
        </button>
        <BookOpen size={14} className="text-violet-500" />
        <span className="text-xs font-semibold text-gray-900">Leads — Integrations & API</span>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/50">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Eligibility banner */}
          {eligibility && !eligibility.eligible && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex items-start gap-3">
              <Globe size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-900 mb-1">
                  Hosted domain required
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  {eligibility.reason}
                </p>
                <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
                  Once your reverse proxy + DNS are set up, edit{' '}
                  <code className="bg-amber-100 px-1 rounded">/.env</code> and set{' '}
                  <code className="bg-amber-100 px-1 rounded">API_PUBLIC_URL=https://your-domain</code>,
                  then restart the API container. The Meta connection panel below will activate automatically.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Meta Ads connections */}
          <section className={cn(
            'bg-white border border-gray-200 rounded-lg p-4',
            !eligibility?.eligible && 'opacity-60',
          )}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Webhook size={13} className="text-violet-500" />
                  <h2 className="text-xs font-semibold text-gray-900">Meta Ads Connections</h2>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Auto-create leads when someone fills your Meta lead forms
                </p>
              </div>
              <button
                onClick={() => setShowMetaForm(true)}
                disabled={!eligibility?.eligible}
                className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-white px-2.5 py-1 rounded text-[11px] font-medium"
              >
                <Plus size={11} /> Connect Meta Page
              </button>
            </div>

            {!integrations?.length ? (
              <p className="text-[11px] text-gray-300 text-center py-6">No Meta pages connected yet.</p>
            ) : (
              <div className="border border-gray-200 rounded">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      {['Name', 'Status', 'Leads', 'Last event', ''].map((h) => (
                        <th key={h} className="text-left px-3 py-1.5 text-[9px] font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {integrations.filter((i) => i.provider === 'META_ADS').map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2">
                          <div className="text-[11px] font-medium text-gray-900">{i.name}</div>
                          {i.metaPageName && <div className="text-[10px] text-gray-400">{i.metaPageName}</div>}
                          {i.lastError && (
                            <div className="text-[10px] text-red-600 mt-0.5 flex items-center gap-1">
                              <AlertTriangle size={9} /> {i.lastError.slice(0, 80)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            i.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                            i.status === 'ERROR' ? 'bg-red-50 text-red-700' :
                            'bg-gray-50 text-gray-500',
                          )}>
                            {i.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-700">{i.totalLeads}</td>
                        <td className="px-3 py-2 text-[10px] text-gray-400">
                          {i.lastEventAt ? new Date(i.lastEventAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2 flex items-center gap-1 justify-end">
                          <button
                            onClick={() => toggleIntegration.mutate({
                              id: i.id,
                              status: i.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                            })}
                            className="text-gray-400 hover:text-violet-500"
                            title={i.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                          >
                            {i.status === 'ACTIVE' ? <Power size={11} /> : <PowerOff size={11} />}
                          </button>
                          <button
                            onClick={() => { if (confirm('Remove this integration?')) deleteIntegration.mutate(i.id); }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 2: API keys */}
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Key size={13} className="text-violet-500" />
                  <h2 className="text-xs font-semibold text-gray-900">API Keys</h2>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Generate keys for the custom webhook + future SDK use. Keys are SHA-256 hashed.
                </p>
              </div>
              <button
                onClick={() => setShowApiKeyForm(true)}
                className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
              >
                <Plus size={11} /> Generate Key
              </button>
            </div>

            {!apiKeys?.length ? (
              <p className="text-[11px] text-gray-300 text-center py-6">No API keys yet.</p>
            ) : (
              <div className="border border-gray-200 rounded">
                <table className="w-full">
                  <thead className="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      {['Name', 'Prefix', 'Scopes', 'Last used', ''].map((h) => (
                        <th key={h} className="text-left px-3 py-1.5 text-[9px] font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {apiKeys.map((k) => (
                      <tr key={k.id} className={cn(!k.isActive && 'opacity-50')}>
                        <td className="px-3 py-2 text-[11px] text-gray-900 font-medium">{k.name}</td>
                        <td className="px-3 py-2 text-[10px] font-mono text-gray-500">{k.prefix}…</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.length === 0 ? <span className="text-[10px] text-gray-300">none</span> : k.scopes.map((s) => (
                              <span key={s} className="text-[9px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-gray-400">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { if (confirm('Revoke this key? Existing integrations using it will stop working.')) revokeApiKey.mutate(k.id); }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3: Docs */}
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={13} className="text-violet-500" />
              <h2 className="text-xs font-semibold text-gray-900">Setup Docs</h2>
            </div>
            <DocsContent
              eligibility={eligibility}
            />
          </section>
        </div>
      </div>

      {/* Modals */}
      {showMetaForm && (
        <CreateMetaIntegrationModal
          onClose={() => setShowMetaForm(false)}
          onCreated={(integration) => {
            setCreatedIntegration(integration);
            setShowMetaForm(false);
          }}
        />
      )}

      {createdIntegration && (
        <IntegrationCreatedModal
          integration={createdIntegration}
          onClose={() => setCreatedIntegration(null)}
        />
      )}

      {showApiKeyForm && (
        <CreateApiKeyModal
          onClose={() => setShowApiKeyForm(false)}
          onCreated={(key) => {
            setCreatedApiKey(key);
            setShowApiKeyForm(false);
          }}
        />
      )}

      {createdApiKey && (
        <ApiKeyCreatedModal
          apiKey={createdApiKey}
          onClose={() => setCreatedApiKey(null)}
        />
      )}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────

function CreateMetaIntegrationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (i: Integration) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageName, setPageName] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [defaultTags, setDefaultTags] = useState('');
  const [defaultPriority, setDefaultPriority] = useState('MEDIUM');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ data: Integration }>('/lead-integrations', {
        provider: 'META_ADS',
        name,
        metaPageId: pageId,
        metaPageName: pageName || undefined,
        metaAppSecret: appSecret,
        metaPageAccessToken: accessToken,
        defaultTags: defaultTags.split(',').map((t) => t.trim()).filter(Boolean),
        defaultPriority,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['lead-integrations'] });
      toast.success('Integration created');
      onCreated(r.data.data);
    },
    onError: (err: unknown) => {
      const msg = (err && typeof err === 'object' && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message)
        : null) ?? 'Failed to create';
      toast.error(msg);
    },
  });

  return (
    <Modal title="Connect Meta Page" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Connection name (e.g. Acme FB Page)" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
      <div className="grid grid-cols-2 gap-2">
        <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Meta Page ID" className="border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
        <input value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="Page name (opt)" className="border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
      </div>
      <input value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="App Secret" type="password" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
      <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Page Access Token (long-lived)" type="password" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <input value={defaultTags} onChange={(e) => setDefaultTags(e.target.value)} placeholder="Default tags (comma)" className="border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
        <select value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)} className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white">
          {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Both secrets are encrypted at rest with AES-256-GCM. The page access token must include the
        <code className="bg-gray-100 px-1 mx-1 rounded">leads_retrieval</code>,
        <code className="bg-gray-100 px-1 mx-1 rounded">pages_show_list</code>, and
        <code className="bg-gray-100 px-1 mx-1 rounded">pages_read_engagement</code>
        permissions.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-gray-500 text-[11px] px-2 py-1">Cancel</button>
        <button
          onClick={() => mutation.mutate()}
          disabled={!name || !pageId || !appSecret || !accessToken || mutation.isPending}
          className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30"
        >
          {mutation.isPending ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </Modal>
  );
}

function IntegrationCreatedModal({ integration, onClose }: { integration: Integration; onClose: () => void }) {
  const [showToken, setShowToken] = useState(false);

  return (
    <Modal title="Almost done — paste these into Meta" onClose={onClose}>
      <p className="text-[11px] text-gray-600 leading-relaxed mb-2">
        In Meta Business Suite go to your Page → <strong>Lead Access</strong> → <strong>Webhooks</strong> →{' '}
        <strong>Add Webhook</strong>, then paste the values below.
      </p>

      <CopyField label="Webhook callback URL" value={integration.webhookUrl ?? ''} />
      <CopyField
        label="Verify token"
        value={integration.metaVerifyToken ?? ''}
        masked={!showToken}
        onToggleMask={() => setShowToken(!showToken)}
      />

      <div className="border border-amber-200 bg-amber-50 rounded p-2 text-[10px] text-amber-800 leading-relaxed">
        ⚠️ The verify token is shown ONCE here. Copy it now — you can rotate it later but the old value won&apos;t be retrievable.
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        Then subscribe to the <code className="bg-gray-100 px-1 rounded">leadgen</code> field. Test by submitting a form via the Meta Lead Ads Testing Tool — a Lead row will appear in <Link href="/leads" className="text-violet-600 underline">/leads</Link> within ~1 minute.
      </p>

      <div className="flex justify-end pt-1">
        <button onClick={onClose} className="bg-gray-900 text-white px-3 py-1 rounded text-[11px]">Done</button>
      </div>
    </Modal>
  );
}

function CreateApiKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (k: ApiKeyWithSecret) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['leads:write']);
  const [expiresAt, setExpiresAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ data: ApiKeyWithSecret }>('/api-keys', {
        name,
        scopes,
        expiresAt: expiresAt || undefined,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
      onCreated(r.data.data);
      toast.success('API key created');
    },
    onError: () => toast.error('Failed to create key'),
  });

  const toggleScope = (scope: string) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  return (
    <Modal title="Generate API Key" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. Tally form)" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Scopes</p>
        <div className="flex flex-wrap gap-1">
          {SCOPE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleScope(s)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border',
                scopes.includes(s)
                  ? 'bg-violet-100 text-violet-700 border-violet-300'
                  : 'bg-white text-gray-500 border-gray-200',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Expires (optional)</p>
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border border-gray-200 rounded px-2.5 py-1.5 text-xs" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-gray-500 text-[11px] px-2 py-1">Cancel</button>
        <button
          onClick={() => mutation.mutate()}
          disabled={!name || scopes.length === 0 || mutation.isPending}
          className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30"
        >
          {mutation.isPending ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </Modal>
  );
}

function ApiKeyCreatedModal({ apiKey, onClose }: { apiKey: ApiKeyWithSecret; onClose: () => void }) {
  return (
    <Modal title="Your new API key" onClose={onClose}>
      <div className="border border-amber-200 bg-amber-50 rounded p-2 text-[10px] text-amber-800 leading-relaxed">
        ⚠️ This is the only time you&apos;ll see this key. Copy it now and store it somewhere safe.
      </div>
      <CopyField label="API Key" value={apiKey.key ?? ''} mono />
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Send it as <code className="bg-gray-100 px-1 rounded">Authorization: Bearer wacrm_…</code> on every request.
      </p>
      <div className="flex justify-end pt-1">
        <button onClick={onClose} className="bg-gray-900 text-white px-3 py-1 rounded text-[11px]">Done</button>
      </div>
    </Modal>
  );
}

// ── Reusable bits ───────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[480px] p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-xs font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  masked = false,
  onToggleMask,
  mono = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
  onToggleMask?: () => void;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const display = masked ? '•'.repeat(Math.min(40, value.length)) : value;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <input
          readOnly
          value={display}
          className={cn(
            'flex-1 border border-gray-200 rounded px-2 py-1 text-[11px] bg-gray-50',
            mono && 'font-mono',
          )}
        />
        {onToggleMask && (
          <button
            onClick={onToggleMask}
            className="text-gray-400 hover:text-violet-500 p-1"
            title={masked ? 'Show' : 'Hide'}
          >
            {masked ? <Eye size={11} /> : <EyeOff size={11} />}
          </button>
        )}
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success('Copied');
          }}
          className="text-gray-400 hover:text-violet-500 p-1"
        >
          {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
        </button>
      </div>
    </div>
  );
}

// ── Docs content ────────────────────────────────────────────────────────────

function DocsContent({ eligibility }: { eligibility?: Eligibility }) {
  const customUrl = eligibility?.customWebhookUrl ?? `${eligibility?.publicUrl ?? '<your-domain>'}/api/webhooks/leads/custom`;

  return (
    <div className="space-y-5 text-[11px] text-gray-700 leading-relaxed">
      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">What this is</h3>
        <p>
          Connect external lead sources to your CRM. Two options: <strong>Meta Ads</strong> (auto-creates a lead
          when someone fills your Facebook/Instagram lead form) and a <strong>custom webhook</strong> protected
          by an API key (works with Tally, Typeform, Webflow, your own form, curl, anything that can POST JSON).
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">Connect Meta Ads</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>In <a href="https://business.facebook.com" target="_blank" rel="noreferrer" className="text-violet-600 underline">Meta Business Suite</a>, go to your Page → <strong>Lead Access</strong> → <strong>Webhooks</strong>.</li>
          <li>Click <strong>+ Add Webhook</strong>.</li>
          <li>Paste the <strong>Webhook callback URL</strong> from the success modal above (or click any existing connection&apos;s edit button to see it again).</li>
          <li>Paste the <strong>Verify token</strong>. The Meta UI will immediately call our <code>GET</code> handshake to confirm it.</li>
          <li>Subscribe to the <code>leadgen</code> field.</li>
          <li>Generate a <strong>long-lived Page Access Token</strong> via Tools → Graph API Explorer with these permissions: <code>leads_retrieval</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code>.</li>
          <li>Paste it back into the connection form here. (Edit any existing integration to update the token.)</li>
          <li>Test by submitting a form via Meta&apos;s <a href="https://developers.facebook.com/tools/lead-ads-testing/" target="_blank" rel="noreferrer" className="text-violet-600 underline">Lead Ads Testing Tool</a>. A new Lead with <code>source: META_ADS</code> should appear in <Link href="/leads" className="text-violet-600 underline">/leads</Link> within a minute.</li>
        </ol>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">Custom webhook (any source)</h3>
        <p className="mb-2">Generate an API key with the <code>leads:write</code> scope, then POST to:</p>
        <pre className="bg-gray-50 border border-gray-200 rounded p-2 font-mono text-[10px] overflow-x-auto">
{`curl -X POST ${customUrl} \\
  -H "Authorization: Bearer wacrm_<your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Inbound from Tally form",
    "phoneNumber": "+919876543210",
    "contactName": "Jane Doe",
    "estimatedValue": 10000,
    "source": "WEBHOOK",
    "tags": ["tally", "homepage"]
  }'`}
        </pre>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">Field reference (custom webhook body)</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><code>title</code> (string, required) — short label for the lead</li>
          <li><code>phoneNumber</code> (string, recommended) — auto-creates a contact if it doesn&apos;t exist</li>
          <li><code>contactId</code> (string) — alternative to phoneNumber if you already have one</li>
          <li><code>contactName</code> (string) — display name when upserting a contact</li>
          <li><code>source</code> (enum) — defaults to <code>WEBHOOK</code>; valid: WHATSAPP, WEBSITE, REFERRAL, INBOUND_EMAIL, OUTBOUND, CAMPAIGN, FORM, IMPORT, AI_CHAT, MANUAL, META_ADS, WEBHOOK, OTHER</li>
          <li><code>priority</code> (enum) — LOW, MEDIUM, HIGH, URGENT</li>
          <li><code>estimatedValue</code> (number) — currency amount</li>
          <li><code>currency</code> (string) — ISO code, defaults to INR</li>
          <li><code>tags</code> (string[]) — applied to the lead</li>
          <li><code>expectedCloseAt</code> (ISO date)</li>
          <li><code>customFields</code> (object) — anything else you want to preserve</li>
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">Security</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>API keys are SHA-256 hashed at rest. The raw value is shown ONCE on creation.</li>
          <li>Meta App Secret + Page Access Token are encrypted at rest with AES-256-GCM.</li>
          <li>Meta webhook calls are verified with HMAC-SHA256 against the signed body — invalid signatures get rejected.</li>
          <li>Rotate API keys immediately if leaked (revoke + create a new one).</li>
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1">Troubleshooting</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><strong>401 Unauthorized</strong> on the custom webhook — bad API key or revoked.</li>
          <li><strong>403 Forbidden</strong> — key is missing the <code>leads:write</code> scope.</li>
          <li><strong>Meta dashboard rejects the URL</strong> — verify token mismatch, or your domain isn&apos;t HTTPS.</li>
          <li><strong>Integration shows ERROR</strong> — check the <code>lastError</code> column. Usually means the page access token expired or lacks <code>leads_retrieval</code>.</li>
          <li>Use the <strong>Pause</strong> button to temporarily stop processing without deleting the integration.</li>
        </ul>
      </div>
    </div>
  );
}

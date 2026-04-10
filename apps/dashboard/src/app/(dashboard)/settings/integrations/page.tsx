'use client';

/**
 * Settings → Integrations page.
 *
 * Configure public URL for webhooks/integrations.
 * Auto-detects from request headers with fallback to manual entry.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { Globe, Check, AlertCircle, Save, ExternalLink } from 'lucide-react';

interface Eligibility {
  eligible: boolean;
  publicUrl?: string;
  webhookBaseUrl?: string;
  customWebhookUrl?: string | null;
  reason?: string;
  source?: 'env' | 'company' | 'detected';
}

interface Company {
  id: string;
  publicUrl?: string | null;
  name: string;
}

export default function IntegrationsSettingsPage() {
  const qc = useQueryClient();
  const [publicUrl, setPublicUrl] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ['lead-integrations', 'eligibility'],
    queryFn: async () => {
      const r = await api.get<{ data: Eligibility }>('/lead-integrations/eligibility');
      return r.data.data;
    },
  });

  // Sync publicUrl state when eligibility loads from company source
  useEffect(() => {
    if (eligibility?.source === 'company' && eligibility.publicUrl) {
      setPublicUrl(eligibility.publicUrl);
    }
  }, [eligibility]);

  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const r = await api.get<{ data: Company }>('/company');
      return r.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (publicUrl: string) =>
      api.patch<{ data: Company }>('/company', { publicUrl }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-integrations', 'eligibility'] });
      void qc.invalidateQueries({ queryKey: ['company'] });
      setHasChanges(false);
      toast.success('Public URL saved');
    },
    onError: () => toast.error('Failed to save'),
  });

  const handleSave = () => {
    updateMutation.mutate(publicUrl);
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
          <Globe size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Integrations Settings</h1>
          <p className="text-sm text-gray-500">Configure your public domain for webhooks</p>
        </div>
      </div>

      {/* Eligibility Status */}
      {!eligibilityLoading && eligibility && (
        <div className={`border rounded-xl p-4 mb-6 flex items-start gap-3 ${
          eligibility.eligible
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {eligibility.eligible ? (
            <Check size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`text-sm font-semibold ${
              eligibility.eligible ? 'text-emerald-900' : 'text-amber-900'
            }`}>
              {eligibility.eligible ? 'Public URL configured' : 'Public URL not configured'}
            </p>
            {eligibility.eligible && eligibility.source && (
              <p className="text-xs text-emerald-700 mt-0.5">
                Source: {eligibility.source === 'env' ? 'Environment variable (API_PUBLIC_URL)' :
                        eligibility.source === 'company' ? 'Company settings (below)' :
                        'Auto-detected from request headers'}
              </p>
            )}
            {!eligibility.eligible && eligibility.reason && (
              <p className="text-xs text-amber-700 mt-0.5">{eligibility.reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Public URL Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Public URL</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your domain that webhook providers can reach (e.g., https://yourdomain.com)
            </p>
          </div>
          {eligibility?.source === 'company' && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
          )}
        </div>

        <input
          type="url"
          value={publicUrl}
          onChange={(e) => {
            setPublicUrl(e.target.value);
            setHasChanges(e.target.value !== (company?.publicUrl ?? ''));
          }}
          placeholder="https://yourdomain.com"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
        />

        <div className="flex items-center justify-between mt-3">
          <p className="text-[11px] text-gray-400">
            This overrides the API_PUBLIC_URL environment variable for your company.
          </p>
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Save size={12} />
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Webhook URLs */}
      {eligibility?.eligible && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Webhook Endpoints</h2>
          <div className="space-y-3">
            <WebhookUrlField
              label="Meta Ads Webhook"
              value={`${eligibility.webhookBaseUrl}/meta/<integration-id>`}
              description="For Facebook/Instagram Lead Ads"
            />
            <WebhookUrlField
              label="Custom Webhook"
              value={eligibility.customWebhookUrl ?? ''}
              description="For any external source (Tally, Typeform, etc.)"
            />
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-900 mb-2">Setup Options</h3>
        <div className="space-y-3 text-[11px] text-gray-700">
          <div>
            <p className="font-medium text-gray-900 mb-1">Option 1: Auto-detection (Recommended)</p>
            <p className="text-gray-500">
              If you&apos;re behind a reverse proxy (nginx, Caddy, Traefik) that sets <code className="bg-gray-200 px-1 rounded">X-Forwarded-Host</code> headers,
              the system auto-detects your public URL. No configuration needed.
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Option 2: Company Settings (Above)</p>
            <p className="text-gray-500">
              Enter your public URL in the form above. This is stored per-company and overrides the environment variable.
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900 mb-1">Option 3: Environment Variable</p>
            <p className="text-gray-500">
              Set <code className="bg-gray-200 px-1 rounded">API_PUBLIC_URL=https://yourdomain.com</code> in your <code className="bg-gray-200 px-1 rounded">.env</code> file
              and restart the API container. This is the global default.
            </p>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="mt-6 flex items-center gap-3">
        <a
          href="/leads/integrations"
          className="text-[11px] text-violet-600 hover:text-violet-700 flex items-center gap-1"
        >
          Manage lead integrations <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}

function WebhookUrlField({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success('Copied to clipboard');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-gray-700">{label}</p>
        <p className="text-[10px] text-gray-400">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-[10px] text-gray-700 truncate">
          {value}
        </code>
        <button
          onClick={copy}
          className="text-gray-400 hover:text-gray-700 p-1.5 border border-gray-200 rounded hover:bg-gray-50 transition"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Globe size={12} />}
        </button>
      </div>
    </div>
  );
}

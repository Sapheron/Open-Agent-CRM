'use client';

/**
 * Quotes list — filter rail + stats strip + bulk-select toolbar + table.
 * Matches /leads, /deals, /campaigns, /forms.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { formatRelativeTime, cn } from '@/lib/utils';
import {
  FileText,
  Plus,
  Search,
  X,
  Trash2,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  title: string | null;
  status: QuoteStatus;
  contactId: string | null;
  dealId: string | null;
  currency: string;
  subtotal: number;
  total: number;
  validUntil: string | null;
  tags: string[];
  lineItems: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  rangeDays: number;
  totalQuotes: number;
  byStatus: Record<string, number>;
  totalValue: number;
  acceptedValue: number;
  acceptanceRate: number | null;
  averageValue: number | null;
}

const STATUS_COLORS: Record<QuoteStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  SENT: 'bg-gray-50 text-gray-700',
  VIEWED: 'bg-gray-50 text-gray-900',
  ACCEPTED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
  EXPIRED: 'bg-amber-50 text-amber-600',
  REVOKED: 'bg-gray-50 text-gray-400',
};

const ALL_STATUSES: QuoteStatus[] = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'REVOKED',
];

function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

export default function QuotesPage() {
  const qc = useQueryClient();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<QuoteStatus>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['quote-stats'],
    queryFn: async () => {
      const r = await api.get<{ data: Stats }>('/quotes/stats');
      return r.data.data;
    },
  });

  const queryKey = useMemo(
    () => ['quotes', [...selectedStatuses].join(','), search],
    [selectedStatuses, search],
  );
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatuses.size > 0) params.set('status', [...selectedStatuses].join(','));
      if (search) params.set('search', search);
      params.set('limit', '100');
      const r = await api.get<{ data: { items: QuoteRow[]; total: number } }>(
        `/quotes?${params.toString()}`,
      );
      return r.data.data;
    },
  });

  const invalidateAfterBulk = () => {
    void qc.invalidateQueries({ queryKey: ['quotes'] });
    void qc.invalidateQueries({ queryKey: ['quote-stats'] });
    setSelectedIds(new Set());
  };
  const bulkSend = useMutation({
    mutationFn: () => api.post('/quotes/bulk/send', { ids: [...selectedIds] }),
    onSuccess: () => {
      invalidateAfterBulk();
      toast.success('Bulk send complete');
    },
    onError: () => toast.error('Bulk send failed'),
  });
  const bulkRevoke = useMutation({
    mutationFn: () => api.post('/quotes/bulk/revoke', { ids: [...selectedIds] }),
    onSuccess: () => {
      invalidateAfterBulk();
      toast.success('Bulk revoke complete');
    },
    onError: () => toast.error('Bulk revoke failed'),
  });
  const bulkDelete = useMutation({
    mutationFn: () => api.post('/quotes/bulk/delete', { ids: [...selectedIds] }),
    onSuccess: () => {
      invalidateAfterBulk();
      toast.success('Bulk delete complete');
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/quotes/${id}/send`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Sent');
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg ?? 'Send failed');
    },
  });

  const toggleStatus = (s: QuoteStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const allSelected = items.length > 0 && items.every((q) => selectedIds.has(q.id));

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gray-800" />
          <span className="text-xs font-semibold text-gray-900">Quotes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotes..."
              className="w-52 pl-6 pr-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
          >
            <Plus size={11} /> New Quote
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-5 gap-2 border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
          <StatTile label="Total" value={stats.totalQuotes} />
          <StatTile
            label="Pipeline value"
            value={formatMoney(stats.totalValue)}
            tint="blue"
          />
          <StatTile
            label="Accepted"
            value={formatMoney(stats.acceptedValue)}
            tint="emerald"
          />
          <StatTile
            label="Accept rate"
            value={stats.acceptanceRate !== null ? `${stats.acceptanceRate}%` : '—'}
            tint="violet"
          />
          <StatTile
            label="Average"
            value={stats.averageValue !== null ? formatMoney(stats.averageValue) : '—'}
          />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Filter rail */}
        <aside className="w-48 border-r border-gray-200 bg-white overflow-auto shrink-0 p-3 space-y-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5 font-medium">
              Status
            </p>
            <div className="space-y-1">
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.has(s)}
                    onChange={() => toggleStatus(s)}
                    className="accent-gray-800 w-3 h-3"
                  />
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_COLORS[s])}>
                    {s}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {(selectedStatuses.size > 0 || search) && (
            <button
              onClick={() => {
                setSelectedStatuses(new Set());
                setSearch('');
              }}
              className="flex items-center gap-1 text-[10px] text-gray-900 hover:text-gray-900"
            >
              <X size={10} /> Clear filters
            </button>
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Bulk toolbar */}
          {selectedIds.size > 0 && (
            <div className="h-9 border-b border-gray-200 px-3 flex items-center gap-3 shrink-0 bg-gray-50">
              <span className="text-[11px] text-gray-900 font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex-1" />
              <button
                onClick={() => bulkSend.mutate()}
                className="flex items-center gap-1 text-[11px] text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-white"
              >
                <Send size={11} /> Send
              </button>
              <button
                onClick={() => bulkRevoke.mutate()}
                className="flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-800 px-2 py-1 rounded hover:bg-white"
              >
                <XCircle size={11} /> Revoke
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.size} quote(s)?`)) bulkDelete.mutate();
                }}
                className="flex items-center gap-1 text-[11px] text-red-700 hover:text-red-800 px-2 py-1 rounded hover:bg-white"
              >
                <Trash2 size={11} /> Delete
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-gray-400 hover:text-gray-600 px-2"
              >
                <X size={11} />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-gray-300">
                <FileText size={28} className="mx-auto mb-2 text-gray-200" />
                <p className="text-xs">No quotes match.</p>
                <p className="text-[10px] mt-1">
                  Click <strong>New Quote</strong> to create one.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="w-8 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(items.map((q) => q.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="accent-gray-800 w-3 h-3"
                      />
                    </th>
                    {['Number', 'Title', 'Status', 'Items', 'Total', 'Valid until', 'Updated', ''].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left px-2 py-2 text-[9px] font-medium text-gray-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50/50">
                      <td className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q.id)}
                          onChange={() => toggleSelect(q.id)}
                          className="accent-gray-800 w-3 h-3"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="text-xs font-medium text-gray-900 hover:text-gray-900 font-mono"
                        >
                          {q.quoteNumber}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-gray-700 max-w-xs truncate">
                        {q.title ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded font-medium',
                            STATUS_COLORS[q.status],
                          )}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-500">{q.lineItems.length}</td>
                      <td className="px-2 py-2 text-[11px] text-gray-900 tabular-nums">
                        {formatMoney(q.total, q.currency)}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-400">
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-400">
                        {formatRelativeTime(q.updatedAt)}
                      </td>
                      <td className="px-2 py-2">
                        {q.status === 'DRAFT' && (
                          <button
                            onClick={() => sendMutation.mutate(q.id)}
                            title="Send"
                            className="text-gray-700 hover:text-gray-900 p-0.5"
                          >
                            <Send size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="h-8 border-t border-gray-200 px-3 flex items-center shrink-0 bg-white">
            <span className="text-[10px] text-gray-400">
              {items.length} of {total} quote{total === 1 ? '' : 's'}
            </span>
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateQuoteModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['quotes'] });
            void qc.invalidateQueries({ queryKey: ['quote-stats'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tint,
}: {
  label: string;
  value: string | number;
  tint?: 'emerald' | 'blue' | 'violet';
}) {
  const tints: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-gray-700',
    violet: 'text-gray-900',
  };
  return (
    <div className="bg-gray-50/80 border border-gray-100 rounded px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-gray-400 font-medium">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums', tint ? tints[tint] : 'text-gray-900')}>
        {value}
      </div>
    </div>
  );
}

function CreateQuoteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [contactId, setContactId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [taxBps, setTaxBps] = useState('1800');
  const [validUntil, setValidUntil] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/quotes', {
        title: title || undefined,
        contactId: contactId || undefined,
        currency,
        taxBps: Number(taxBps) || 0,
        validUntil: validUntil || undefined,
      }),
    onSuccess: () => {
      toast.success('Quote created in DRAFT');
      onCreated();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg ?? 'Failed to create');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[480px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">New Quote</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional, e.g. Acme annual plan)"
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
          autoFocus
        />
        <input
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          placeholder="Contact id (optional — can be set later)"
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="AED">AED</option>
            </select>
          </label>
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Tax (bps)</span>
            <input
              type="number"
              value={taxBps}
              onChange={(e) => setTaxBps(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
              placeholder="1800 = 18%"
            />
          </label>
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Valid until</span>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            />
          </label>
        </div>
        <p className="text-[10px] text-gray-400">
          You&apos;ll add line items on the detail page after creating.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-gray-500 text-[11px] px-2 py-1">
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30"
          >
            {createMutation.isPending ? 'Creating…' : 'Create as Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

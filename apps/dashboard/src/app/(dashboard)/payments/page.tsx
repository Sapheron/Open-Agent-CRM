'use client';

/**
 * Payments list — filter rail + stats strip + bulk-select toolbar + table.
 * Matches /invoices / /quotes / /forms / /campaigns layout.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { formatRelativeTime, cn } from '@/lib/utils';
import {
  CreditCard,
  Plus,
  Search,
  X,
  Trash2,
  XCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED';
type PaymentProvider = 'RAZORPAY' | 'STRIPE' | 'CASHFREE' | 'PHONEPE' | 'PAYU' | 'NONE';

interface PaymentRow {
  id: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  method: string | null;
  amount: number;
  refundedAmount: number;
  currency: string;
  description: string | null;
  linkUrl: string | null;
  contactId: string | null;
  dealId: string | null;
  invoiceId: string | null;
  tags: string[];
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; displayName: string | null; phoneNumber: string } | null;
  deal?: { id: string; title: string; stage: string } | null;
}

interface Stats {
  rangeDays: number;
  totalPayments: number;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
  totalReceived: number;
  totalPending: number;
  totalRefunded: number;
  successRate: number | null;
  averageAmount: number | null;
}

const STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: 'bg-gray-50 text-gray-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-600',
  REFUNDED: 'bg-amber-50 text-amber-700',
  EXPIRED: 'bg-gray-50 text-gray-400',
};

const ALL_STATUSES: PaymentStatus[] = [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'EXPIRED',
];

const ALL_PROVIDERS: PaymentProvider[] = [
  'RAZORPAY',
  'STRIPE',
  'CASHFREE',
  'PHONEPE',
  'PAYU',
  'NONE',
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

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [selectedStatuses, setSelectedStatuses] = useState<Set<PaymentStatus>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<PaymentProvider>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: async () => {
      const r = await api.get<{ data: Stats }>('/payments/stats');
      return r.data.data;
    },
  });

  const queryKey = useMemo(
    () => ['payments', [...selectedStatuses].join(','), [...selectedProviders].join(','), search],
    [selectedStatuses, selectedProviders, search],
  );
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatuses.size > 0) params.set('status', [...selectedStatuses].join(','));
      if (selectedProviders.size > 0) params.set('provider', [...selectedProviders].join(','));
      if (search) params.set('search', search);
      params.set('limit', '100');
      const r = await api.get<{ data: { items: PaymentRow[]; total: number } }>(
        `/payments?${params.toString()}`,
      );
      return r.data.data;
    },
  });

  const invalidateAfterBulk = () => {
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['payment-stats'] });
    setSelectedIds(new Set());
  };
  const bulkCancel = useMutation({
    mutationFn: () => api.post('/payments/bulk/cancel', { ids: [...selectedIds] }),
    onSuccess: () => {
      invalidateAfterBulk();
      toast.success('Bulk cancel complete');
    },
    onError: () => toast.error('Bulk cancel failed'),
  });
  const bulkDelete = useMutation({
    mutationFn: () => api.post('/payments/bulk/delete', { ids: [...selectedIds] }),
    onSuccess: () => {
      invalidateAfterBulk();
      toast.success('Bulk delete complete');
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  const toggleStatus = (s: PaymentStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const toggleProvider = (p: PaymentProvider) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
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
  const allSelected = items.length > 0 && items.every((p) => selectedIds.has(p.id));

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-gray-800" />
          <span className="text-xs font-semibold text-gray-900">Payments</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payments..."
              className="w-52 pl-6 pr-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
          >
            <Plus size={11} /> New Payment
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-2 border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
          <StatTile label="Total" value={stats.totalPayments} />
          <StatTile label="Received" value={formatMoney(stats.totalReceived)} tint="emerald" />
          <StatTile label="Pending" value={formatMoney(stats.totalPending)} tint="blue" />
          <StatTile label="Refunded" value={formatMoney(stats.totalRefunded)} tint="amber" />
          <StatTile
            label="Success rate"
            value={stats.successRate !== null ? `${stats.successRate}%` : '—'}
            tint="violet"
          />
        </div>
      )}

      <div className="flex-1 flex min-h-0">
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
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5 font-medium">
              Provider
            </p>
            <div className="space-y-1">
              {ALL_PROVIDERS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={selectedProviders.has(p)}
                    onChange={() => toggleProvider(p)}
                    className="accent-gray-800 w-3 h-3"
                  />
                  <span className="text-[10px] text-gray-600">{p}</span>
                </label>
              ))}
            </div>
          </div>
          {(selectedStatuses.size > 0 || selectedProviders.size > 0 || search) && (
            <button
              onClick={() => {
                setSelectedStatuses(new Set());
                setSelectedProviders(new Set());
                setSearch('');
              }}
              className="flex items-center gap-1 text-[10px] text-gray-900 hover:text-gray-900"
            >
              <X size={10} /> Clear filters
            </button>
          )}
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {selectedIds.size > 0 && (
            <div className="h-9 border-b border-gray-200 px-3 flex items-center gap-3 shrink-0 bg-gray-50">
              <span className="text-[11px] text-gray-900 font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex-1" />
              <button
                onClick={() => bulkCancel.mutate()}
                className="flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-800 px-2 py-1 rounded hover:bg-white"
              >
                <XCircle size={11} /> Cancel
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.size} payment(s)?`)) bulkDelete.mutate();
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
                <CreditCard size={28} className="mx-auto mb-2 text-gray-200" />
                <p className="text-xs">No payments match.</p>
                <p className="text-[10px] mt-1">
                  Click <strong>New Payment</strong> to create one.
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
                          if (e.target.checked) setSelectedIds(new Set(items.map((p) => p.id)));
                          else setSelectedIds(new Set());
                        }}
                        className="accent-gray-800 w-3 h-3"
                      />
                    </th>
                    {['Amount', 'Status', 'Provider', 'Description', 'Contact', 'Paid / Created', ''].map(
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
                  {items.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="accent-gray-800 w-3 h-3"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/payments/${p.id}`}
                          className="text-xs font-medium text-gray-900 hover:text-gray-900 tabular-nums"
                        >
                          {formatMoney(p.amount, p.currency)}
                        </Link>
                        {p.refundedAmount > 0 && (
                          <div className="text-[9px] text-amber-600">
                            − {formatMoney(p.refundedAmount, p.currency)} refunded
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded font-medium',
                            STATUS_COLORS[p.status],
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-600">
                        {p.provider}
                        {p.method && <span className="text-gray-400 ml-1">/{p.method}</span>}
                      </td>
                      <td className="px-2 py-2 text-[11px] text-gray-700 max-w-xs truncate">
                        {p.description ?? <span className="text-gray-300">—</span>}
                        {p.invoiceId && (
                          <Link
                            href={`/invoices/${p.invoiceId}`}
                            className="block text-[9px] text-gray-900 hover:text-gray-900"
                          >
                            → invoice
                          </Link>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-600 max-w-xs truncate">
                        {p.contact ? (
                          <Link
                            href={`/contacts/${p.contact.id}`}
                            className="hover:text-gray-900"
                          >
                            {p.contact.displayName ?? p.contact.phoneNumber}
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-400">
                        {p.paidAt ? formatRelativeTime(p.paidAt) : formatRelativeTime(p.createdAt)}
                      </td>
                      <td className="px-2 py-2">
                        {p.linkUrl && p.status === 'PENDING' && (
                          <a
                            href={p.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open payment link"
                            className="text-gray-700 hover:text-gray-900 p-0.5 inline-block"
                          >
                            <ExternalLink size={11} />
                          </a>
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
              {items.length} of {total} payment{total === 1 ? '' : 's'}
            </span>
          </div>
        </main>
      </div>

      {showCreate && (
        <CreatePaymentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['payments'] });
            void qc.invalidateQueries({ queryKey: ['payment-stats'] });
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
  tint?: 'emerald' | 'blue' | 'violet' | 'amber' | 'red';
}) {
  const tints: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-gray-700',
    violet: 'text-gray-900',
    amber: 'text-amber-600',
    red: 'text-red-600',
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

function CreatePaymentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<'link' | 'manual'>('link');
  const [contactId, setContactId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('cash');

  const createLinkM = useMutation({
    mutationFn: () =>
      api.post('/payments/link', {
        contactId,
        amount: Math.round(Number(amount) * 100),
        description,
        invoiceId: invoiceId || undefined,
      }),
    onSuccess: () => {
      toast.success('Payment link created');
      onCreated();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg ?? 'Failed');
    },
  });

  const recordManualM = useMutation({
    mutationFn: () =>
      api.post('/payments/manual', {
        contactId: contactId || undefined,
        amount: Math.round(Number(amount) * 100),
        description,
        method,
        invoiceId: invoiceId || undefined,
      }),
    onSuccess: () => {
      toast.success('Manual payment recorded');
      onCreated();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg ?? 'Failed');
    },
  });

  const isPending = createLinkM.isPending || recordManualM.isPending;
  const canSubmit =
    description.trim() &&
    Number(amount) > 0 &&
    (mode === 'manual' || contactId.trim());

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[480px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">New Payment</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-1 bg-gray-50 rounded p-1">
          <button
            onClick={() => setMode('link')}
            className={cn(
              'flex-1 text-[11px] py-1.5 rounded',
              mode === 'link' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500',
            )}
          >
            Gateway link
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              'flex-1 text-[11px] py-1.5 rounded',
              mode === 'manual' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500',
            )}
          >
            Record manual
          </button>
        </div>

        <input
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          placeholder={mode === 'link' ? 'Contact id (required)' : 'Contact id (optional)'}
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
        />
        <input
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          placeholder="Invoice id (optional — auto-reconciles)"
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500.00"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            />
          </label>
          {mode === 'manual' && (
            <label className="text-[10px] text-gray-500">
              <span className="block uppercase tracking-widest mb-0.5">Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
            </label>
          )}
        </div>
        <p className="text-[10px] text-gray-400">
          {mode === 'link'
            ? 'Creates a gateway-hosted payment URL. Share via WhatsApp or email.'
            : 'Records a payment that already happened outside the gateway. Links to the invoice automatically.'}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-gray-500 text-[11px] px-2 py-1">
            Cancel
          </button>
          <button
            onClick={() => {
              if (mode === 'link') createLinkM.mutate();
              else recordManualM.mutate();
            }}
            disabled={!canSubmit || isPending}
            className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30 flex items-center gap-1"
          >
            {isPending && <RefreshCw size={10} className="animate-spin" />}
            {mode === 'link' ? 'Create link' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Payment detail — 3-column Linear layout matching the other entity pages.
 *
 * Left:   amount + status breakdown, gateway info, linked contact/deal/invoice
 * Center: tabs — Activity / Notes
 * Right:  contextual actions — copy link / refund / cancel / delete
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  ArrowLeft,
  Check,
  XCircle,
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MessageSquare,
  Clock,
  ExternalLink,
  Undo2,
  DollarSign,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';

type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED';
type PaymentProvider = 'RAZORPAY' | 'STRIPE' | 'CASHFREE' | 'PHONEPE' | 'PAYU' | 'NONE';

interface Payment {
  id: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  method: string | null;
  amount: number;
  refundedAmount: number;
  refundId: string | null;
  refundReason: string | null;
  currency: string;
  description: string | null;
  notes: string | null;
  externalId: string | null;
  linkUrl: string | null;
  contactId: string | null;
  dealId: string | null;
  invoiceId: string | null;
  tags: string[];
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    displayName: string | null;
    phoneNumber: string;
    email: string | null;
  } | null;
  deal?: { id: string; title: string; stage: string } | null;
  activities?: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    actorType: string;
    createdAt: string;
  }>;
}

const STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: 'bg-blue-50 text-blue-600',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-600',
  REFUNDED: 'bg-amber-50 text-amber-700',
  EXPIRED: 'bg-gray-50 text-gray-400',
};

function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

export default function PaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;

  const [tab, setTab] = useState<'activity' | 'notes'>('activity');
  const [noteDraft, setNoteDraft] = useState('');

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment', id],
    queryFn: async () => {
      const r = await api.get<{ data: Payment }>(`/payments/${id}`);
      return r.data.data;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['payment', id] });
  };
  const onErr = (err: unknown) => {
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
    toast.error(msg ?? 'Failed');
  };

  const refundM = useMutation({
    mutationFn: (body: { amount?: number; reason?: string }) =>
      api.post(`/payments/${id}/refund`, body),
    onSuccess: () => {
      invalidate();
      toast.success('Refunded');
    },
    onError: onErr,
  });
  const cancelM = useMutation({
    mutationFn: (reason: string) => api.post(`/payments/${id}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Cancelled');
    },
    onError: onErr,
  });
  const deleteM = useMutation({
    mutationFn: () => api.delete(`/payments/${id}`),
    onSuccess: () => {
      toast.success('Deleted');
      router.push('/payments');
    },
    onError: onErr,
  });
  const addNoteM = useMutation({
    mutationFn: () => api.post(`/payments/${id}/notes`, { body: noteDraft }),
    onSuccess: () => {
      invalidate();
      setNoteDraft('');
      toast.success('Note added');
    },
  });

  const amountDue = useMemo(() => {
    if (!payment) return 0;
    return Math.max(0, payment.amount - payment.refundedAmount);
  }, [payment]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-300 text-xs">Loading…</p>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-300 text-xs">Payment not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <Link href="/payments" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-semibold text-gray-900 truncate">
            {formatMoney(payment.amount, payment.currency)}
          </h1>
          <p className="text-[10px] text-gray-400 truncate">
            {payment.description ?? '(no description)'}
          </p>
        </div>
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded font-medium',
            STATUS_COLORS[payment.status],
          )}
        >
          {payment.status}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-64 border-r border-gray-200 bg-white overflow-auto shrink-0">
          <div className="p-3 space-y-4">
            <Section title="Amount">
              <Row label="Gross" value={formatMoney(payment.amount, payment.currency)} />
              {payment.refundedAmount > 0 && (
                <Row
                  label="Refunded"
                  value={`− ${formatMoney(payment.refundedAmount, payment.currency)}`}
                />
              )}
              <div className="pt-1.5 mt-1 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-900">Net</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatMoney(amountDue, payment.currency)}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Gateway">
              <Row label="Provider" value={payment.provider} />
              {payment.method && <Row label="Method" value={payment.method} />}
              {payment.externalId && (
                <Row
                  label="External ID"
                  value={
                    <code className="text-[9px]">{payment.externalId.slice(0, 16)}…</code>
                  }
                />
              )}
              {payment.refundId && (
                <Row
                  label="Refund ID"
                  value={
                    <code className="text-[9px]">{payment.refundId.slice(0, 16)}…</code>
                  }
                />
              )}
              {payment.linkUrl && (
                <a
                  href={payment.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-violet-600 hover:text-violet-700 flex items-center gap-1 mt-1"
                >
                  <ExternalLink size={10} /> Open hosted link
                </a>
              )}
            </Section>

            <Section title="Linked">
              {payment.contact ? (
                <Link
                  href={`/contacts/${payment.contact.id}`}
                  className="text-[11px] text-violet-600 hover:text-violet-700 block truncate"
                >
                  → {payment.contact.displayName ?? payment.contact.phoneNumber}
                </Link>
              ) : (
                <p className="text-[10px] text-gray-300">No contact</p>
              )}
              {payment.deal ? (
                <Link
                  href={`/deals/${payment.deal.id}`}
                  className="text-[11px] text-violet-600 hover:text-violet-700 block truncate"
                >
                  → Deal: {payment.deal.title}
                </Link>
              ) : (
                <p className="text-[10px] text-gray-300">No deal</p>
              )}
              {payment.invoiceId ? (
                <Link
                  href={`/invoices/${payment.invoiceId}`}
                  className="text-[11px] text-violet-600 hover:text-violet-700 block"
                >
                  → Invoice
                </Link>
              ) : (
                <p className="text-[10px] text-gray-300">No invoice</p>
              )}
            </Section>

            <Section title="Timeline">
              {payment.paidAt && (
                <Row label="Paid" value={formatRelativeTime(payment.paidAt)} />
              )}
              {payment.refundedAt && (
                <Row label="Refunded" value={formatRelativeTime(payment.refundedAt)} />
              )}
              {payment.refundReason && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Reason: {payment.refundReason}
                </p>
              )}
              <Row label="Created" value={formatRelativeTime(payment.createdAt)} />
            </Section>

            {payment.tags.length > 0 && (
              <Section title="Tags">
                <div className="flex flex-wrap gap-1">
                  {payment.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="h-9 border-b border-gray-200 px-3 flex items-center gap-4 shrink-0">
            {(['activity', 'notes'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'text-[11px] py-1 border-b-2 transition-colors',
                  tab === t
                    ? 'border-violet-500 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600',
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'activity' && (
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {!payment.activities?.length ? (
                <p className="text-center text-gray-300 text-[11px] py-8">No activity yet.</p>
              ) : (
                payment.activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 py-1.5">
                    <div className="w-4 pt-0.5 shrink-0 flex justify-center">
                      {a.type === 'PAID' ? (
                        <CheckCircle2 size={11} className="text-emerald-500" />
                      ) : a.type === 'REFUNDED' || a.type === 'REFUND_INITIATED' ? (
                        <Undo2 size={11} className="text-amber-500" />
                      ) : a.type === 'REFUND_FAILED' ? (
                        <AlertTriangle size={11} className="text-red-500" />
                      ) : a.type === 'FAILED' || a.type === 'ERROR' ? (
                        <AlertTriangle size={11} className="text-red-500" />
                      ) : a.type === 'CANCELLED' || a.type === 'EXPIRED' ? (
                        <Ban size={11} className="text-gray-500" />
                      ) : a.type === 'MANUAL_RECORDED' ? (
                        <DollarSign size={11} className="text-emerald-500" />
                      ) : a.type === 'WEBHOOK_RECEIVED' ? (
                        <CreditCard size={11} className="text-blue-500" />
                      ) : (
                        <Clock size={11} className="text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-gray-900">{a.title}</span>
                        <span className="text-[9px] text-gray-400 capitalize">{a.actorType}</span>
                        <span className="text-[9px] text-gray-400 ml-auto">
                          {formatRelativeTime(a.createdAt)}
                        </span>
                      </div>
                      {a.body && <p className="text-[10px] text-gray-500 mt-0.5">{a.body}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="flex-1 overflow-auto p-3">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note to the payment timeline..."
                rows={4}
                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 mb-2"
              />
              <button
                onClick={() => addNoteM.mutate()}
                disabled={!noteDraft.trim() || addNoteM.isPending}
                className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30"
              >
                {addNoteM.isPending ? 'Saving…' : 'Add Note'}
              </button>
              <div className="mt-4 space-y-2">
                {payment.activities
                  ?.filter((a) => a.type === 'NOTE_ADDED')
                  .map((a) => (
                    <div key={a.id} className="border border-gray-100 rounded p-2">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                        <span className="capitalize">{a.actorType}</span>
                        <span>{formatRelativeTime(a.createdAt)}</span>
                      </div>
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{a.body}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>

        <aside className="w-56 border-l border-gray-200 bg-white overflow-auto shrink-0 p-3 space-y-2">
          <p className="text-[9px] uppercase tracking-widest text-gray-400 font-medium mb-1">Actions</p>

          {payment.linkUrl && payment.status === 'PENDING' && (
            <CopyChip icon={<ExternalLink size={10} />} text={payment.linkUrl} />
          )}

          {payment.status === 'PAID' && (
            <button
              onClick={() => {
                const reason = prompt('Refund reason? (full refund unless specified otherwise)');
                if (reason === null) return;
                const raw = prompt(
                  `Refund amount in ${payment.currency} (leave blank for full):`,
                );
                const amount = raw?.trim()
                  ? Math.round(Number(raw) * 100)
                  : undefined;
                if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
                  toast.error('Invalid amount');
                  return;
                }
                refundM.mutate({ amount, reason: reason || undefined });
              }}
              className="w-full flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <Undo2 size={11} /> Refund
            </button>
          )}

          {payment.status === 'PENDING' && (
            <button
              onClick={() => {
                const reason = prompt('Cancel reason?');
                if (reason !== null) cancelM.mutate(reason);
              }}
              className="w-full flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <XCircle size={11} /> Cancel
            </button>
          )}

          {(payment.status === 'PENDING' || payment.status === 'FAILED' || payment.status === 'EXPIRED') && (
            <button
              onClick={() => {
                if (confirm('Delete this payment? This cannot be undone.')) deleteM.mutate();
              }}
              className="w-full flex items-center gap-2 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <Trash2 size={11} /> Delete
            </button>
          )}

          <div className="pt-2 mt-2 border-t border-gray-100">
            <Link
              href={`/chat?q=${encodeURIComponent(`Tell me about payment ${payment.id}`)}`}
              className="w-full flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <MessageSquare size={11} /> Ask AI
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-gray-400 font-medium mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-700 text-right truncate">{value}</span>
    </div>
  );
}

function CopyChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        if (!text) return;
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        toast.success('Copied');
      }}
      className="w-full flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 px-2 py-1.5 rounded text-[10px] group"
    >
      <span className="text-gray-400 shrink-0">{icon}</span>
      <code className="flex-1 truncate text-left">{text || '—'}</code>
      {copied ? (
        <Check size={10} className="text-emerald-500 shrink-0" />
      ) : (
        <Copy size={10} className="text-gray-400 shrink-0" />
      )}
    </button>
  );
}

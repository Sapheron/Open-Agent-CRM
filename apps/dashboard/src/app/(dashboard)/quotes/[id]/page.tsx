'use client';

/**
 * Quote detail — 3-column Linear layout matching /leads/[id], /deals/[id],
 * /campaigns/[id], /forms/[id].
 *
 * Left:   metadata (contact/deal/currency/tax/validity), auto-actions,
 *         public URL + webhook copy
 * Center: tabs — Line items (live editor) / Activity / Notes
 * Right:  contextual actions (send / accept / reject / revoke / duplicate /
 *         delete) based on current status
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  ArrowLeft,
  Send,
  Check,
  X,
  XCircle,
  Copy,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  FileText,
  MessageSquare,
  Globe,
  Clock,
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

interface LineItem {
  id: string;
  sortOrder: number;
  productId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountBps: number;
  total: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  publicToken: string;
  title: string | null;
  description: string | null;
  status: QuoteStatus;
  contactId: string | null;
  dealId: string | null;
  subtotal: number;
  tax: number;
  taxBps: number;
  discount: number;
  total: number;
  currency: string;
  validUntil: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  revokedAt: string | null;
  rejectionReason: string | null;
  autoMoveDealOnAccept: boolean;
  notes: string | null;
  terms: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  activities?: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    actorType: string;
    createdAt: string;
  }>;
}

const STATUS_COLORS: Record<QuoteStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-500',
  SENT: 'bg-blue-50 text-blue-600',
  VIEWED: 'bg-violet-50 text-violet-700',
  ACCEPTED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
  EXPIRED: 'bg-amber-50 text-amber-600',
  REVOKED: 'bg-gray-50 text-gray-400',
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

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;

  const [tab, setTab] = useState<'items' | 'activity' | 'notes'>('items');
  const [showAddItem, setShowAddItem] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      const r = await api.get<{ data: Quote }>(`/quotes/${id}`);
      return r.data.data;
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['quote', id] });
  };
  const onErr = (err: unknown) => {
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
    toast.error(msg ?? 'Failed');
  };

  const sendM = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/send`),
    onSuccess: () => {
      invalidate();
      toast.success('Sent');
    },
    onError: onErr,
  });
  const acceptM = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/accept`),
    onSuccess: () => {
      invalidate();
      toast.success('Accepted');
    },
    onError: onErr,
  });
  const rejectM = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/quotes/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Rejected');
    },
    onError: onErr,
  });
  const revokeM = useMutation({
    mutationFn: (reason: string) =>
      api.post(`/quotes/${id}/revoke`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Revoked');
    },
    onError: onErr,
  });
  const duplicateM = useMutation({
    mutationFn: () => api.post<{ data: Quote }>(`/quotes/${id}/duplicate`),
    onSuccess: (r) => {
      toast.success('Duplicated');
      router.push(`/quotes/${r.data.data.id}`);
    },
    onError: onErr,
  });
  const deleteM = useMutation({
    mutationFn: () => api.delete(`/quotes/${id}`),
    onSuccess: () => {
      toast.success('Deleted');
      router.push('/quotes');
    },
    onError: onErr,
  });
  const removeLineM = useMutation({
    mutationFn: (lineItemId: string) =>
      api.delete(`/quotes/${id}/line-items/${lineItemId}`),
    onSuccess: () => {
      invalidate();
      toast.success('Removed');
    },
    onError: onErr,
  });

  const addNoteM = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/notes`, { body: noteDraft }),
    onSuccess: () => {
      invalidate();
      setNoteDraft('');
      toast.success('Note added');
    },
  });

  const publicUrl = useMemo(() => {
    if (!quote) return null;
    if (typeof window === 'undefined') return null;
    return `${window.location.origin}/public/quotes/${quote.publicToken}`;
  }, [quote]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-300 text-xs">Loading…</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-300 text-xs">Quote not found</p>
      </div>
    );
  }

  const editable = quote.status === 'DRAFT' || quote.status === 'SENT';

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <Link href="/quotes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xs font-semibold text-gray-900 truncate font-mono">
            {quote.quoteNumber}
          </h1>
          <p className="text-[10px] text-gray-400 truncate">
            {quote.title ?? 'No title'}
          </p>
        </div>
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded font-medium',
            STATUS_COLORS[quote.status],
          )}
        >
          {quote.status}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <aside className="w-64 border-r border-gray-200 bg-white overflow-auto shrink-0">
          <div className="p-3 space-y-4">
            <Section title="Totals">
              <Row label="Subtotal" value={formatMoney(quote.subtotal, quote.currency)} />
              <Row
                label={`Tax (${(quote.taxBps / 100).toFixed(1)}%)`}
                value={formatMoney(quote.tax, quote.currency)}
              />
              {quote.discount > 0 && (
                <Row
                  label="Discount"
                  value={`− ${formatMoney(quote.discount, quote.currency)}`}
                />
              )}
              <div className="pt-1.5 mt-1 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-900">Total</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatMoney(quote.total, quote.currency)}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Linked">
              {quote.contactId ? (
                <Link
                  href={`/contacts/${quote.contactId}`}
                  className="text-[11px] text-violet-600 hover:text-violet-700 block"
                >
                  → Contact
                </Link>
              ) : (
                <p className="text-[10px] text-gray-300">No contact</p>
              )}
              {quote.dealId ? (
                <Link
                  href={`/deals/${quote.dealId}`}
                  className="text-[11px] text-violet-600 hover:text-violet-700 block"
                >
                  → Deal
                </Link>
              ) : (
                <p className="text-[10px] text-gray-300">No deal</p>
              )}
              {quote.autoMoveDealOnAccept && quote.dealId && (
                <p className="text-[9px] text-emerald-600 mt-1">
                  ✓ Deal auto-moves to WON on accept
                </p>
              )}
            </Section>

            <Section title="Validity">
              {quote.validUntil ? (
                <Row
                  label="Valid until"
                  value={new Date(quote.validUntil).toLocaleDateString()}
                />
              ) : (
                <p className="text-[10px] text-gray-300">No expiry set</p>
              )}
              {quote.sentAt && (
                <Row label="Sent" value={formatRelativeTime(quote.sentAt)} />
              )}
              {quote.viewedAt && (
                <Row label="Viewed" value={formatRelativeTime(quote.viewedAt)} />
              )}
              {quote.acceptedAt && (
                <Row label="Accepted" value={formatRelativeTime(quote.acceptedAt)} />
              )}
              {quote.rejectedAt && (
                <Row label="Rejected" value={formatRelativeTime(quote.rejectedAt)} />
              )}
              {quote.rejectionReason && (
                <p className="text-[10px] text-red-600 mt-1">
                  Reason: {quote.rejectionReason}
                </p>
              )}
            </Section>

            <Section title="Meta">
              {quote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {quote.tags.map((t) => (
                    <span key={t} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <Row label="Created" value={formatRelativeTime(quote.createdAt)} />
              <Row label="Updated" value={formatRelativeTime(quote.updatedAt)} />
            </Section>
          </div>
        </aside>

        {/* Center panel */}
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="h-9 border-b border-gray-200 px-3 flex items-center gap-4 shrink-0">
            {(['items', 'activity', 'notes'] as const).map((t) => (
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
                {t === 'items' ? `Line items (${quote.lineItems.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'items' && (
            <div className="flex-1 overflow-auto p-3">
              {quote.lineItems.length === 0 ? (
                <div className="text-center py-12 text-gray-300">
                  <FileText size={24} className="mx-auto mb-2" />
                  <p className="text-xs">No line items yet</p>
                  <p className="text-[10px] mt-1">Add at least one item before sending</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['#', 'Item', 'Qty', 'Unit price', 'Discount', 'Total', ''].map((h) => (
                        <th
                          key={h}
                          className="text-left px-2 py-1.5 text-[9px] font-medium text-gray-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quote.lineItems.map((li, i) => (
                      <tr key={li.id} className="group hover:bg-gray-50/50">
                        <td className="px-2 py-2 text-[10px] text-gray-400">{i + 1}</td>
                        <td className="px-2 py-2">
                          <div className="text-[11px] font-medium text-gray-900">{li.name}</div>
                          {li.description && (
                            <div className="text-[10px] text-gray-400 truncate max-w-xs">
                              {li.description}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-[11px] text-gray-700 tabular-nums">
                          {li.quantity}
                        </td>
                        <td className="px-2 py-2 text-[11px] text-gray-700 tabular-nums">
                          {formatMoney(li.unitPrice, quote.currency)}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-gray-400 tabular-nums">
                          {li.discountBps > 0 ? `${(li.discountBps / 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-2 py-2 text-[11px] font-medium text-gray-900 tabular-nums">
                          {formatMoney(li.total, quote.currency)}
                        </td>
                        <td className="px-2 py-2">
                          {editable && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove "${li.name}"?`)) removeLineM.mutate(li.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-0.5"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {editable && (
                <button
                  onClick={() => setShowAddItem(true)}
                  className="mt-3 w-full border border-dashed border-gray-200 rounded py-2 text-[11px] text-gray-500 hover:text-violet-600 hover:border-violet-300 flex items-center justify-center gap-1"
                >
                  <Plus size={11} /> Add line item
                </button>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="flex-1 overflow-auto p-3 space-y-2">
              {!quote.activities?.length ? (
                <p className="text-center text-gray-300 text-[11px] py-8">No activity yet.</p>
              ) : (
                quote.activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 py-1.5">
                    <div className="w-4 pt-0.5 shrink-0 flex justify-center">
                      {a.type === 'ACCEPTED' ? (
                        <CheckCircle2 size={11} className="text-emerald-500" />
                      ) : a.type === 'REJECTED' ? (
                        <XCircle size={11} className="text-red-500" />
                      ) : a.type === 'SENT' ? (
                        <Send size={11} className="text-blue-500" />
                      ) : a.type === 'ERROR' ? (
                        <AlertTriangle size={11} className="text-red-500" />
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
                placeholder="Add a note to the quote timeline..."
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
                {quote.activities
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

        {/* Right panel */}
        <aside className="w-56 border-l border-gray-200 bg-white overflow-auto shrink-0 p-3 space-y-2">
          <p className="text-[9px] uppercase tracking-widest text-gray-400 font-medium mb-1">Actions</p>

          {quote.status === 'DRAFT' && (
            <button
              onClick={() => sendM.mutate()}
              disabled={sendM.isPending || quote.lineItems.length === 0}
              className="w-full flex items-center gap-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-30 text-blue-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <Send size={11} /> Send
            </button>
          )}
          {(quote.status === 'SENT' || quote.status === 'VIEWED') && (
            <>
              <button
                onClick={() => acceptM.mutate()}
                className="w-full flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
              >
                <Check size={11} /> Mark accepted
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Rejection reason?');
                  if (reason !== null) rejectM.mutate(reason);
                }}
                className="w-full flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
              >
                <XCircle size={11} /> Mark rejected
              </button>
            </>
          )}
          {quote.status !== 'ACCEPTED' && quote.status !== 'REVOKED' && quote.status !== 'DRAFT' && (
            <button
              onClick={() => {
                const reason = prompt('Revoke reason?');
                if (reason !== null) revokeM.mutate(reason);
              }}
              className="w-full flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <XCircle size={11} /> Revoke
            </button>
          )}
          <button
            onClick={() => duplicateM.mutate()}
            className="w-full flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
          >
            <Copy size={11} /> Duplicate
          </button>
          {(quote.status === 'DRAFT' || quote.status === 'REVOKED' || quote.status === 'EXPIRED') && (
            <button
              onClick={() => {
                if (confirm('Delete this quote? This cannot be undone.')) deleteM.mutate();
              }}
              className="w-full flex items-center gap-2 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <Trash2 size={11} /> Delete
            </button>
          )}

          {/* Public URL */}
          {quote.status !== 'DRAFT' && (
            <div className="pt-3 mt-2 border-t border-gray-100">
              <p className="text-[9px] uppercase tracking-widest text-gray-400 font-medium mb-1.5">
                Public URL
              </p>
              <CopyChip icon={<Globe size={10} />} text={publicUrl ?? ''} />
              <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                Share this link with the customer to view + accept/reject.
              </p>
            </div>
          )}

          <div className="pt-2 mt-2 border-t border-gray-100">
            <Link
              href={`/chat?q=${encodeURIComponent(`Tell me about quote ${quote.quoteNumber}`)}`}
              className="w-full flex items-center gap-2 bg-violet-50 hover:bg-violet-100 text-violet-700 px-2.5 py-1.5 rounded text-[11px] font-medium"
            >
              <MessageSquare size={11} /> Ask AI
            </Link>
          </div>
        </aside>
      </div>

      {showAddItem && (
        <AddLineItemModal
          quoteId={id}
          onClose={() => setShowAddItem(false)}
          onAdded={() => {
            invalidate();
            setShowAddItem(false);
          }}
        />
      )}
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

function AddLineItemModal({
  quoteId,
  onClose,
  onAdded,
}: {
  quoteId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  // Entered as a major-unit amount for UX, converted to minor before POSTing
  const [unitPrice, setUnitPrice] = useState('');
  const [discountPct, setDiscountPct] = useState('');

  const addM = useMutation({
    mutationFn: () =>
      api.post(`/quotes/${quoteId}/line-items`, {
        name,
        description: description || undefined,
        quantity: Number(quantity) || 1,
        unitPrice: Math.round(Number(unitPrice) * 100) || 0,
        discountBps: discountPct ? Math.round(Number(discountPct) * 100) : 0,
      }),
    onSuccess: () => {
      toast.success('Added');
      onAdded();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg ?? 'Failed to add item');
    },
  });

  const canSubmit = name.trim() && Number(quantity) > 0 && Number(unitPrice) >= 0;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[480px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Add Line Item</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Annual subscription)"
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
        />

        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Qty</span>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Unit price</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="500.00"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-[10px] text-gray-500">
            <span className="block uppercase tracking-widest mb-0.5">Discount %</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            />
          </label>
        </div>
        <p className="text-[10px] text-gray-400">
          Line total: {Number(quantity) * Number(unitPrice) * (1 - Number(discountPct || 0) / 100) || 0}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-gray-500 text-[11px] px-2 py-1">
            Cancel
          </button>
          <button
            onClick={() => addM.mutate()}
            disabled={!canSubmit || addM.isPending}
            className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30"
          >
            {addM.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

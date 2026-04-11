'use client';

/**
 * Public hosted quote viewer — unauthenticated.
 *
 * Fetches the quote via `GET /public/quotes/:token` and renders it as a
 * clean proposal document. Customers can click Accept or Reject to
 * resolve the quote in one action.
 *
 * Lives outside the (dashboard) group so it has no nav, no sidebar, no
 * auth gate. Only quotes where `status ∈ {SENT, VIEWED, ACCEPTED, REJECTED,
 * EXPIRED}` are visible — DRAFT and REVOKED return 404.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

type QuoteStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED';

interface PublicQuote {
  id: string;
  quoteNumber: string;
  title: string | null;
  description: string | null;
  status: QuoteStatus;
  subtotal: number;
  tax: number;
  taxBps: number;
  discount: number;
  total: number;
  currency: string;
  validUntil: string | null;
  terms: string | null;
  lineItems: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    discountBps: number;
    total: number;
  }>;
  company: {
    name: string;
  };
}

const API_ORIGIN =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : '';

function apiUrl(path: string): string {
  if (API_ORIGIN) return `${API_ORIGIN.replace(/\/$/, '')}${path}`;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    return `${proto}//${host}:3000${path}`;
  }
  return path;
}

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

export default function PublicQuotePage() {
  const params = useParams();
  const token = params.token as string;

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'accept' | 'reject' | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolvedTo, setResolvedTo] = useState<'accepted' | 'rejected' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/public/quotes/${token}`));
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(
              res.status === 404
                ? 'Quote not found or no longer available.'
                : `Failed to load quote (${res.status}).`,
            );
          }
          return;
        }
        const json = (await res.json()) as PublicQuote;
        if (cancelled) return;
        setQuote(json);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setActionLoading('accept');
    setActionError(null);
    try {
      const res = await fetch(apiUrl(`/public/quotes/${token}/accept`), {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Error ${res.status}`);
      }
      setResolvedTo('accepted');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading('reject');
    setActionError(null);
    try {
      const res = await fetch(apiUrl(`/public/quotes/${token}/reject`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Error ${res.status}`);
      }
      setResolvedTo('rejected');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const layoutClasses =
    'min-h-screen bg-gradient-to-br from-violet-50 via-white to-blue-50 py-10 px-4';

  if (loading) {
    return (
      <div className={layoutClasses + ' flex items-center justify-center'}>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading quote…
        </div>
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className={layoutClasses + ' flex items-center justify-center'}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <AlertTriangle size={28} className="mx-auto mb-3 text-amber-500" />
          <h1 className="text-sm font-semibold text-gray-900 mb-1">Quote unavailable</h1>
          <p className="text-xs text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (resolvedTo) {
    return (
      <div className={layoutClasses + ' flex items-center justify-center'}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 max-w-md text-center">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
              resolvedTo === 'accepted' ? 'bg-emerald-50' : 'bg-red-50'
            }`}
          >
            {resolvedTo === 'accepted' ? (
              <Check size={20} className="text-emerald-600" />
            ) : (
              <XCircle size={20} className="text-red-600" />
            )}
          </div>
          <h1 className="text-sm font-semibold text-gray-900 mb-1">
            {resolvedTo === 'accepted' ? 'Quote accepted' : 'Quote rejected'}
          </h1>
          <p className="text-xs text-gray-500">
            {resolvedTo === 'accepted'
              ? `Thank you! ${quote.company.name} will be in touch shortly.`
              : `Thanks for letting us know. ${quote.company.name} has been notified.`}
          </p>
        </div>
      </div>
    );
  }

  const alreadyFinal =
    quote.status === 'ACCEPTED' ||
    quote.status === 'REJECTED' ||
    quote.status === 'EXPIRED';

  return (
    <div className={layoutClasses}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="text-[11px] text-gray-400 uppercase tracking-widest">
            {quote.company.name}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Quote <span className="font-mono font-medium text-gray-700">{quote.quoteNumber}</span>
          </div>
        </div>

        {/* Main quote card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8">
            {quote.title && (
              <h1 className="text-lg font-semibold text-gray-900 mb-1">{quote.title}</h1>
            )}
            {quote.description && (
              <p className="text-sm text-gray-500 mb-6 whitespace-pre-wrap">{quote.description}</p>
            )}

            {quote.validUntil && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2 mb-6">
                Valid until {new Date(quote.validUntil).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}

            {/* Line items */}
            <table className="w-full mt-2">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quote.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="py-3">
                      <div className="text-sm text-gray-900">{li.name}</div>
                      {li.description && (
                        <div className="text-[11px] text-gray-400 mt-0.5">{li.description}</div>
                      )}
                      {li.discountBps > 0 && (
                        <div className="text-[10px] text-emerald-600 mt-0.5">
                          {(li.discountBps / 100).toFixed(1)}% discount applied
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right text-sm text-gray-700 tabular-nums">
                      {li.quantity}
                    </td>
                    <td className="py-3 text-right text-sm text-gray-700 tabular-nums">
                      {formatMoney(li.unitPrice, quote.currency)}
                    </td>
                    <td className="py-3 text-right text-sm font-medium text-gray-900 tabular-nums">
                      {formatMoney(li.total, quote.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-6 ml-auto w-72 space-y-1.5">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(quote.subtotal, quote.currency)}</span>
              </div>
              {quote.discount > 0 && (
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    − {formatMoney(quote.discount, quote.currency)}
                  </span>
                </div>
              )}
              {quote.tax > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Tax ({(quote.taxBps / 100).toFixed(1)}%)</span>
                  <span className="tabular-nums">{formatMoney(quote.tax, quote.currency)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-900">Total</span>
                <span className="text-lg font-semibold text-gray-900 tabular-nums">
                  {formatMoney(quote.total, quote.currency)}
                </span>
              </div>
            </div>

            {quote.terms && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Terms
                </h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {quote.terms}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {alreadyFinal ? (
            <div className="bg-gray-50 border-t border-gray-100 p-6 text-center">
              <span
                className={`inline-flex items-center gap-2 text-sm font-medium ${
                  quote.status === 'ACCEPTED'
                    ? 'text-emerald-700'
                    : quote.status === 'REJECTED'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }`}
              >
                {quote.status === 'ACCEPTED' && <Check size={14} />}
                {quote.status === 'REJECTED' && <XCircle size={14} />}
                {quote.status === 'EXPIRED' && <AlertTriangle size={14} />}
                This quote has been {quote.status.toLowerCase()}
              </span>
            </div>
          ) : showRejectForm ? (
            <div className="bg-gray-50 border-t border-gray-100 p-6 space-y-3">
              <label className="block text-xs font-medium text-gray-700">
                Please tell us why (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Out of budget, not the right timing…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="text-sm text-gray-500 px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading === 'reject'}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  {actionLoading === 'reject' && <Loader2 size={14} className="animate-spin" />}
                  Confirm rejection
                </button>
              </div>
              {actionError && (
                <p className="text-xs text-red-600 text-center">{actionError}</p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border-t border-gray-100 p-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={actionLoading !== null}
                className="flex items-center gap-2 bg-white border border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-700 hover:text-red-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                <XCircle size={14} />
                Reject
              </button>
              <button
                onClick={handleAccept}
                disabled={actionLoading !== null}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {actionLoading === 'accept' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Accept quote
              </button>
            </div>
          )}

          {actionError && !showRejectForm && (
            <p className="text-xs text-red-600 text-center pb-4">{actionError}</p>
          )}
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-6">
          Powered by <span className="font-semibold">Open Agent CRM</span>
        </p>
      </div>
    </div>
  );
}

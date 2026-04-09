'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn, formatCurrency, formatRelativeTime } from '@/lib/utils';
import { CreditCard, ExternalLink } from 'lucide-react';

interface Payment {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  description?: string;
  status: string;
  linkUrl?: string;
  paidAt?: string;
  createdAt: string;
  contact?: { displayName?: string; phoneNumber: string };
  deal?: { title: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  PAID: 'bg-emerald-50 text-emerald-600',
  FAILED: 'bg-red-50 text-red-500',
  REFUNDED: 'bg-gray-50 text-gray-500',
  EXPIRED: 'bg-gray-50 text-gray-400',
};

export default function PaymentsPage() {
  const [page] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page],
    queryFn: async () => {
      const res = await api.get<{ data: { items: Payment[]; total: number } }>('/payments', { params: { page } });
      return res.data.data;
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900">Payments</span>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <CreditCard size={20} className="mx-auto text-gray-200 mb-2" />
            <p className="text-xs text-gray-300">No payments yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0">
              <tr>
                {['Contact', 'Description', 'Amount', 'Provider', 'Status', 'Link', 'Date'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2 text-xs text-gray-900">{p.contact?.displayName ?? p.contact?.phoneNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-400 max-w-[200px] truncate">{p.description ?? '—'}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-gray-900">{formatCurrency(p.amount, p.currency)}</td>
                  <td className="px-3 py-2 text-[10px] text-gray-400">{p.provider}</td>
                  <td className="px-3 py-2">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[p.status] ?? 'bg-gray-50 text-gray-400')}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {p.linkUrl ? (
                      <a href={p.linkUrl} target="_blank" rel="noreferrer" className="text-violet-500 hover:text-violet-600 flex items-center gap-0.5 text-[10px]">
                        Open <ExternalLink size={8} />
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-gray-300">{formatRelativeTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="h-9 border-t border-gray-200 px-3 flex items-center shrink-0 bg-white">
        <span className="text-[10px] text-gray-400">{data?.total ?? 0} payments</span>
      </div>
    </div>
  );
}

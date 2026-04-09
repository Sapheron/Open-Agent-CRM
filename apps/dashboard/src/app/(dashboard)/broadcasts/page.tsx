'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/utils';
import { Megaphone, Plus, Trash2, CheckCircle, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Broadcast {
  id: string;
  name: string;
  message: string;
  targetTags: string[];
  totalCount: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export default function BroadcastsPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [targetTags, setTargetTags] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['broadcasts'],
    queryFn: async () => {
      const res = await api.get<{ data: { items: Broadcast[] } }>('/broadcasts');
      return res.data.data.items;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/broadcasts', {
      name, message,
      targetTags: targetTags.split(',').map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['broadcasts'] });
      toast.success('Broadcast queued');
      setShowForm(false); setName(''); setMessage(''); setTargetTags('');
    },
    onError: () => toast.error('Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/broadcasts/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['broadcasts'] }); toast.success('Cancelled'); },
  });

  const statusBadge = (b: Broadcast) => {
    if (b.completedAt) return <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><CheckCircle size={8} />Done</span>;
    if (b.startedAt) return <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Loader2 size={8} className="animate-spin" />Running</span>;
    if (b.scheduledAt) return <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Clock size={8} />Scheduled</span>;
    return <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">Queued</span>;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900">Broadcasts</span>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium">
          <Plus size={11} />
          New
        </button>
      </div>

      {showForm && (
        <div className="border-b border-gray-200 bg-white p-3 space-y-2 shrink-0">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Broadcast name" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Message text" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none" />
          <input value={targetTags} onChange={(e) => setTargetTags(e.target.value)} placeholder="Tags (comma-separated, or empty for all)" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!name || !message} className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30">Send</button>
            <button onClick={() => setShowForm(false)} className="text-gray-400 text-[11px] px-2 py-1">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !data?.length ? (
          <div className="p-12 text-center">
            <Megaphone size={20} className="mx-auto text-gray-200 mb-2" />
            <p className="text-xs text-gray-300">No broadcasts</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.map((b) => (
              <div key={b.id} className="px-3 py-2.5 flex items-start justify-between gap-3 hover:bg-gray-50/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-gray-900">{b.name}</span>
                    {statusBadge(b)}
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{b.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-300">
                    <span>{b.totalCount} recipients</span>
                    {b.sentCount > 0 && <span className="text-emerald-500">{b.sentCount} sent</span>}
                    {b.failedCount > 0 && <span className="text-red-400">{b.failedCount} failed</span>}
                    <span>{formatRelativeTime(b.createdAt)}</span>
                  </div>
                </div>
                {!b.startedAt && (
                  <button onClick={() => deleteMutation.mutate(b.id)} className="text-gray-300 hover:text-red-400 p-0.5">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

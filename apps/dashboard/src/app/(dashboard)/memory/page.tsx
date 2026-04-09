'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Brain, Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Memory {
  id: string;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ['general', 'product', 'policy', 'faq', 'instruction'];

export default function MemoryPage() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [filterCat, setFilterCat] = useState('');
  const qc = useQueryClient();

  const { data: memories, isLoading } = useQuery({
    queryKey: ['ai-memory', filterCat],
    queryFn: async () => {
      const params = filterCat ? { category: filterCat } : {};
      const r = await api.get<{ data: Memory[] }>('/ai/memory', { params });
      return r.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/ai/memory', { title, content, category }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai-memory'] });
      toast.success('Memory saved');
      setShowForm(false); setTitle(''); setContent(''); setCategory('general');
    },
    onError: () => toast.error('Failed to save'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/ai/memory/${id}`, { isActive }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-memory'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ai/memory/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-memory'] }); toast.success('Deleted'); },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-gray-900">AI Memory</span>
          <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {memories?.filter((m) => m.isActive).length ?? 0} active
          </span>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium">
          <Plus size={11} /> Add Memory
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="border-b border-gray-200 bg-white p-3 space-y-2 shrink-0">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g., 'Pricing Info', 'Return Policy')" className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Knowledge content that AI should know about...&#10;&#10;Example: Our premium plan costs $49/month and includes unlimited contacts, 10,000 messages/day, and priority support." className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none leading-relaxed" />
          <div className="flex gap-2 items-center">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-violet-400">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => createMutation.mutate()} disabled={!title || !content} className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-30">Save</button>
            <button onClick={() => setShowForm(false)} className="text-gray-400 text-[11px] px-2 py-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="px-3 py-2 flex gap-1 border-b border-gray-100 bg-white shrink-0 flex-wrap">
        <button onClick={() => setFilterCat('')} className={cn('text-[10px] px-2 py-0.5 rounded', !filterCat ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100')}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilterCat(c)} className={cn('text-[10px] px-2 py-0.5 rounded capitalize', filterCat === c ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100')}>{c}</button>
        ))}
      </div>

      {/* Memory list */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !memories?.length ? (
          <div className="p-12 text-center">
            <Brain size={24} className="mx-auto text-gray-200 mb-2" />
            <p className="text-xs text-gray-400 mb-1">No memories yet</p>
            <p className="text-[10px] text-gray-300">Add knowledge that the AI should remember across all conversations</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {memories.map((mem) => (
              <div key={mem.id} className={cn('px-4 py-3 hover:bg-gray-50/50 transition-colors', !mem.isActive && 'opacity-50')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900">{mem.title}</span>
                      <span className="text-[9px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded capitalize">{mem.category}</span>
                      {!mem.isActive && <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Disabled</span>}
                    </div>
                    <p className="text-[11px] text-gray-500 whitespace-pre-wrap leading-relaxed">{mem.content}</p>
                    <p className="text-[9px] text-gray-300 mt-1">{new Date(mem.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMutation.mutate({ id: mem.id, isActive: !mem.isActive })}
                      title={mem.isActive ? 'Disable' : 'Enable'}
                      className={cn('p-1 rounded', mem.isActive ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-300 hover:bg-gray-100')}
                    >
                      {mem.isActive ? <Power size={12} /> : <PowerOff size={12} />}
                    </button>
                    <button onClick={() => deleteMutation.mutate(mem.id)} className="p-1 text-gray-300 hover:text-red-400 rounded hover:bg-red-50">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-9 border-t border-gray-200 px-3 flex items-center shrink-0 bg-white">
        <span className="text-[10px] text-gray-400">{memories?.length ?? 0} memories ({memories?.filter((m) => m.isActive).length ?? 0} active)</span>
      </div>
    </div>
  );
}

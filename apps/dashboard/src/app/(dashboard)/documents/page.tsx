'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Plus, Search, X, FileText, Archive, Trash2,
  CheckSquare, Square, MoreHorizontal, PenLine, Star,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

interface DocumentItem {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  description?: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  isTemplate: boolean;
  tags: string[];
  version: number;
  contactId?: string;
  dealId?: string;
  expiresAt?: string;
  createdAt: string;
  _count?: { signatures: number };
  signatures?: Array<{ id: string; signerName: string; status: string }>;
}

interface StatsSnapshot {
  total: number;
  active: number;
  draft: number;
  archived: number;
  templates: number;
  pendingSignatures: number;
  signedTotal: number;
}

interface ListResult {
  total: number;
  page: number;
  limit: number;
  items: DocumentItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DocumentStatus, string> = {
  DRAFT:    'bg-gray-100 text-gray-500',
  ACTIVE:   'bg-emerald-50 text-emerald-600',
  ARCHIVED: 'bg-red-50 text-red-400',
};

const DOCUMENT_TYPES = [
  'CONTRACT', 'PROPOSAL', 'INVOICE', 'NDA', 'AGREEMENT', 'REPORT',
  'PRESENTATION', 'QUOTE', 'RECEIPT', 'OTHER',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex flex-col gap-0.5 min-w-[100px]">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-xl font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
    </div>
  );
}

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState<DocumentStatus | ''>('');
  const [typeFilter, setType]       = useState('');
  const [templateOnly, setTemplate] = useState(false);
  const [sort, setSort]             = useState<'recent' | 'name' | 'size'>('recent');
  const [page, setPage]             = useState(1);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newType, setNewType]       = useState('CONTRACT');
  const [newUrl, setNewUrl]         = useState('');
  const [newDesc, setNewDesc]       = useState('');

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<StatsSnapshot>({
    queryKey: ['doc-stats'],
    queryFn: async () => {
      const r = await api.get<{ data: StatsSnapshot }>('/documents/stats');
      return r.data.data;
    },
  });

  const params = new URLSearchParams();
  if (search)        params.set('search', search);
  if (statusFilter)  params.set('status', statusFilter);
  if (typeFilter)    params.set('type', typeFilter);
  if (templateOnly)  params.set('isTemplate', 'true');
  params.set('sort', sort);
  params.set('page', String(page));
  params.set('limit', '25');

  const { data, isLoading } = useQuery<ListResult>({
    queryKey: ['documents', search, statusFilter, typeFilter, templateOnly, sort, page],
    queryFn: async () => {
      const r = await api.get<{ data: ListResult }>(`/documents?${params.toString()}`);
      return r.data.data;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: () => api.post('/documents', {
      name: newName, type: newType, fileUrl: newUrl,
      description: newDesc || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['doc-stats'] });
      toast.success('Document created');
      setShowCreate(false); setNewName(''); setNewUrl(''); setNewDesc('');
    },
    onError: () => toast.error('Failed to create'),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.post(`/documents/${id}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['doc-stats'] });
      toast.success('Archived');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['doc-stats'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const bulkArchiveMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/documents/bulk/archive', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['doc-stats'] });
      setSelected(new Set()); toast.success('Bulk archive done');
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.post('/documents/bulk/delete', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['doc-stats'] });
      setSelected(new Set()); toast.success('Bulk delete done');
    },
  });

  // ── Selection ─────────────────────────────────────────────────────────────────

  const allIds = data?.items.map((d) => d.id) ?? [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const totalPages = data ? Math.ceil(data.total / 25) : 1;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
          <FileText size={13} className="text-blue-500" /> Documents
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium"
        >
          <Plus size={11} /> New Document
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white flex gap-3 overflow-x-auto shrink-0">
          <StatCard label="Total"          value={stats.total} />
          <StatCard label="Active"         value={stats.active} />
          <StatCard label="Draft"          value={stats.draft} />
          <StatCard label="Templates"      value={stats.templates} />
          <StatCard label="Pending Sigs"   value={stats.pendingSignatures} />
          <StatCard label="Signed"         value={stats.signedTotal} />
        </div>
      )}

      {/* Filter rail */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[260px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search documents..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={11} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatus(e.target.value as DocumentStatus | ''); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
        >
          <option value="">All Types</option>
          {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={templateOnly}
            onChange={(e) => { setTemplate(e.target.checked); setPage(1); }}
            className="rounded border-gray-300 text-blue-500 focus:ring-blue-300"
          />
          Templates only
        </label>

        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none"
        >
          <option value="recent">Sort: Recent</option>
          <option value="name">Sort: Name</option>
          <option value="size">Sort: Size</option>
        </select>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="px-4 py-2 border-b border-blue-100 bg-blue-50 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-medium text-blue-700">{selected.size} selected</span>
          <button
            onClick={() => bulkArchiveMut.mutate(Array.from(selected))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-gray-500 text-white hover:bg-gray-600"
          >
            <Archive size={10} /> Archive
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} documents?`)) bulkDeleteMut.mutate(Array.from(selected));
            }}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            <Trash2 size={10} /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[11px] text-blue-500 hover:underline">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <FileText size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-xs text-gray-400">No documents found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="w-8 px-3 py-2">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                    {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                </th>
                {['Name', 'Type', 'Status', 'Size', 'Signatures', 'Expires', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.items.map((d) => (
                <tr key={d.id} className={cn('hover:bg-gray-50/60 transition-colors', selected.has(d.id) && 'bg-blue-50/40')}>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggleOne(d.id)} className="text-gray-400 hover:text-blue-500">
                      {selected.has(d.id) ? <CheckSquare size={13} className="text-blue-500" /> : <Square size={13} />}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/documents/${d.id}`} className="text-xs font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1">
                      {d.isTemplate && <Star size={10} className="text-amber-400 shrink-0" />}
                      {d.name}
                    </Link>
                    {d.description && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{d.description}</p>
                    )}
                    {d.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {d.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-500">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-500">{d.type}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[d.status])}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-400">{formatBytes(d.fileSize)}</td>
                  <td className="px-3 py-2.5">
                    {d._count?.signatures ? (
                      <span className="text-[11px] text-gray-600">
                        {d._count.signatures}
                        {d.signatures?.some(s => s.status === 'PENDING') && (
                          <span className="ml-1 text-amber-500">pending</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-400">
                    {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/documents/${d.id}`} title="Edit" className="p-1 rounded hover:bg-blue-50 text-gray-300 hover:text-blue-500">
                        <PenLine size={11} />
                      </Link>
                      <button
                        onClick={() => archiveMut.mutate(d.id)}
                        title="Archive"
                        className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500"
                      >
                        <Archive size={11} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete?')) deleteMut.mutate(d.id); }}
                        title="Delete"
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                      <Link href={`/documents/${d.id}`} className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500">
                        <MoreHorizontal size={11} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="h-9 border-t border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-[10px] text-gray-400">{data?.total ?? 0} documents</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">Prev</button>
            <span className="text-[10px] text-gray-400">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="text-[11px] px-2 py-0.5 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">Next</button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">New Document</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Name *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Document name"
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Type *</label>
                <select value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">File URL *</label>
                <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Description</label>
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMut.mutate()}
                disabled={!newName.trim() || !newUrl.trim() || createMut.isPending}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-1.5 rounded text-xs font-medium disabled:opacity-40"
              >
                {createMut.isPending ? 'Creating...' : 'Create Document'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-1.5 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

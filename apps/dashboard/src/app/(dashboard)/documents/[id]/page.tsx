'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, FileText, Archive, ArchiveRestore, Trash2,
  Copy, MessageSquarePlus, Clock, CheckCircle2, XCircle, AlertCircle,
  Star, ExternalLink, PenSquare,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type SignatureStatus = 'PENDING' | 'SIGNED' | 'DECLINED' | 'EXPIRED';

interface Document {
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
  notes?: string;
  contactId?: string;
  dealId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  signatures?: Signature[];
  _count?: { signatures: number };
}

interface Signature {
  id: string;
  signerName: string;
  signerEmail?: string;
  status: SignatureStatus;
  signedAt?: string;
  createdAt: string;
}

interface ActivityEvent {
  id: string;
  type: string;
  actorType: string;
  actorId?: string;
  title: string;
  body?: string;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DocumentStatus, string> = {
  DRAFT:    'bg-gray-100 text-gray-500',
  ACTIVE:   'bg-emerald-50 text-emerald-600',
  ARCHIVED: 'bg-red-50 text-red-400',
};

const SIG_STATUS_ICON: Record<SignatureStatus, React.ReactNode> = {
  PENDING:  <AlertCircle size={12} className="text-amber-400" />,
  SIGNED:   <CheckCircle2 size={12} className="text-emerald-500" />,
  DECLINED: <XCircle size={12} className="text-red-400" />,
  EXPIRED:  <Clock size={12} className="text-gray-400" />,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'info' | 'signatures' | 'activity'>('info');
  const [note, setNote]           = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [addingSig, setAddingSig]   = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: doc, isLoading } = useQuery<Document>({
    queryKey: ['document', id],
    queryFn: async () => {
      const r = await api.get<{ data: Document }>(`/documents/${id}`);
      return r.data.data;
    },
  });

  const { data: signatures = [] } = useQuery<Signature[]>({
    queryKey: ['doc-signatures', id],
    queryFn: async () => {
      const r = await api.get<{ data: Signature[] }>(`/documents/${id}/signatures`);
      return r.data.data;
    },
    enabled: tab === 'signatures',
  });

  const { data: timeline = [] } = useQuery<ActivityEvent[]>({
    queryKey: ['doc-timeline', id],
    queryFn: async () => {
      const r = await api.get<{ data: ActivityEvent[] }>(`/documents/${id}/timeline`);
      return r.data.data;
    },
    enabled: tab === 'activity',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['document', id] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['doc-stats'] });
  }

  const archiveMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/archive`),
    onSuccess: () => { refresh(); toast.success('Archived'); },
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/restore`),
    onSuccess: () => { refresh(); toast.success('Restored to DRAFT'); },
  });

  const duplicateMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/duplicate`),
    onSuccess: (r: any) => {
      const newId = r.data.data?.id;
      toast.success('Duplicated');
      if (newId) router.push(`/documents/${newId}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/documents/${id}`),
    onSuccess: () => { toast.success('Deleted'); router.push('/documents'); },
  });

  const addNoteMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/notes`, { note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doc-timeline', id] });
      setNote(''); setAddingNote(false); toast.success('Note added');
    },
  });

  const requestSigMut = useMutation({
    mutationFn: () => api.post(`/documents/${id}/signatures`, {
      signerName, signerEmail: signerEmail || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doc-signatures', id] });
      void qc.invalidateQueries({ queryKey: ['document', id] });
      setSignerName(''); setSignerEmail(''); setAddingSig(false);
      toast.success('Signature requested');
    },
    onError: () => toast.error('Failed to request signature'),
  });

  const updateSigMut = useMutation({
    mutationFn: ({ sigId, status }: { sigId: string; status: string }) =>
      api.patch(`/documents/${id}/signatures/${sigId}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doc-signatures', id] });
      toast.success('Signature updated');
    },
  });

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-xs text-gray-400">Loading...</div>;
  }

  if (!doc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <p className="text-xs text-gray-400">Document not found</p>
        <Link href="/documents" className="text-xs text-gray-800 hover:underline">Back to documents</Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <Link href="/documents" className="text-gray-400 hover:text-gray-600"><ArrowLeft size={14} /></Link>
        <FileText size={13} className="text-gray-800 shrink-0" />
        <span className="text-xs font-semibold text-gray-900 truncate flex-1">{doc.name}</span>
        {doc.isTemplate && <Star size={12} className="text-amber-400 shrink-0" />}
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[doc.status])}>
          {doc.status}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <aside className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Type</span>
                <span className="text-xs font-medium text-gray-700">{doc.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Version</span>
                <span className="text-xs font-medium text-gray-700">v{doc.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">Signatures</span>
                <span className="text-xs font-medium text-gray-700">{doc._count?.signatures ?? doc.signatures?.length ?? 0}</span>
              </div>
              {doc.fileSize && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Size</span>
                  <span className="text-xs font-medium text-gray-700">
                    {doc.fileSize < 1024 * 1024 ? `${(doc.fileSize / 1024).toFixed(1)} KB` : `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            {doc.fileUrl && (
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-gray-800 hover:underline">
                <ExternalLink size={10} /> View File
              </a>
            )}

            {doc.tags.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-800">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {doc.description && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{doc.description}</p>
              </div>
            )}

            <hr className="border-gray-100" />

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Clock size={9} className="text-gray-300" />
                <span className="text-[10px] text-gray-400">Created {new Date(doc.createdAt).toLocaleDateString()}</span>
              </div>
              {doc.expiresAt && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={9} className="text-amber-300" />
                  <span className="text-[10px] text-gray-400">Expires {new Date(doc.expiresAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200 bg-white px-4 flex gap-4 shrink-0">
            {(['info', 'signatures', 'activity'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'py-2.5 text-[11px] font-medium capitalize border-b-2 transition-colors',
                  tab === t ? 'border-gray-800 text-gray-700' : 'border-transparent text-gray-400 hover:text-gray-600',
                )}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {/* Info tab */}
            {tab === 'info' && (
              <div className="space-y-4">
                {doc.notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-amber-500 mb-1">NOTES</p>
                    <p className="text-xs text-amber-700">{doc.notes}</p>
                  </div>
                )}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3">Document Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Name', doc.name],
                      ['Type', doc.type],
                      ['Status', doc.status],
                      ['Template', doc.isTemplate ? 'Yes' : 'No'],
                      ['MIME Type', doc.mimeType ?? '—'],
                      ['Contact ID', doc.contactId ?? '—'],
                      ['Deal ID', doc.dealId ?? '—'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className="text-xs text-gray-700 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Signatures tab */}
            {tab === 'signatures' && (
              <div className="space-y-3">
                {/* Request sig form */}
                {addingSig ? (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">Request Signature</p>
                    <input value={signerName} onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Signer name *"
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
                    <input value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="Signer email (optional)"
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
                    <div className="flex gap-2">
                      <button
                        onClick={() => requestSigMut.mutate()}
                        disabled={!signerName.trim() || requestSigMut.isPending}
                        className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-40"
                      >
                        Request
                      </button>
                      <button onClick={() => setAddingSig(false)} className="text-gray-400 text-[11px]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingSig(true)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-800 hover:text-gray-900">
                    <PenSquare size={12} /> Request signature
                  </button>
                )}

                {/* Signatures list */}
                {signatures.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle2 size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No signatures yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {signatures.map((s) => (
                      <div key={s.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex items-center gap-3">
                        {SIG_STATUS_ICON[s.status]}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700">{s.signerName}</p>
                          {s.signerEmail && <p className="text-[10px] text-gray-400">{s.signerEmail}</p>}
                          {s.signedAt && <p className="text-[10px] text-gray-400">Signed {new Date(s.signedAt).toLocaleDateString()}</p>}
                        </div>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                          s.status === 'SIGNED' ? 'bg-emerald-50 text-emerald-600' :
                          s.status === 'DECLINED' ? 'bg-red-50 text-red-400' :
                          s.status === 'EXPIRED' ? 'bg-gray-100 text-gray-400' :
                          'bg-amber-50 text-amber-600')}>
                          {s.status}
                        </span>
                        {s.status === 'PENDING' && (
                          <div className="flex gap-1">
                            <button onClick={() => updateSigMut.mutate({ sigId: s.id, status: 'SIGNED' })}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">Sign</button>
                            <button onClick={() => updateSigMut.mutate({ sigId: s.id, status: 'DECLINED' })}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600">Decline</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Activity tab */}
            {tab === 'activity' && (
              <div className="space-y-2">
                {addingNote ? (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a note..." rows={2}
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
                    <div className="flex gap-2">
                      <button onClick={() => addNoteMut.mutate()} disabled={!note.trim() || addNoteMut.isPending}
                        className="bg-gray-900 text-white px-3 py-1 rounded text-[11px] disabled:opacity-40">Save</button>
                      <button onClick={() => setAddingNote(false)} className="text-gray-400 text-[11px]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingNote(true)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-800 hover:text-gray-900">
                    <MessageSquarePlus size={12} /> Add note
                  </button>
                )}

                {timeline.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Clock size={20} className="mx-auto mb-2 text-gray-200" />
                    <p className="text-xs">No activity yet</p>
                  </div>
                ) : (
                  <div className="relative pl-4 space-y-0">
                    {timeline.map((e, i) => (
                      <div key={e.id} className="relative pb-3">
                        {i < timeline.length - 1 && (
                          <span className="absolute left-[-9px] top-3.5 bottom-0 w-px bg-gray-100" />
                        )}
                        <span className="absolute left-[-13px] top-1.5 w-2 h-2 rounded-full bg-gray-400 border-2 border-white" />
                        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-medium text-gray-700">{e.title}</p>
                            <span className="text-[9px] text-gray-300 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
                          </div>
                          {e.body && <p className="text-[10px] text-gray-400 mt-0.5">{e.body}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Right action panel */}
        <aside className="w-40 border-l border-gray-200 bg-white shrink-0 p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Actions</p>

          <button onClick={() => duplicateMut.mutate()} disabled={duplicateMut.isPending}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full">
            <Copy size={10} /> Duplicate
          </button>

          {doc.status !== 'ARCHIVED' ? (
            <button onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500 w-full">
              <Archive size={10} /> Archive
            </button>
          ) : (
            <button onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 w-full">
              <ArchiveRestore size={10} /> Restore
            </button>
          )}

          <hr className="border-gray-100 my-1" />

          <button
            onClick={() => { if (confirm('Delete permanently?')) deleteMut.mutate(); }}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-red-100 hover:bg-red-50 text-red-400 w-full"
          >
            <Trash2 size={10} /> Delete
          </button>
        </aside>
      </div>
    </div>
  );
}

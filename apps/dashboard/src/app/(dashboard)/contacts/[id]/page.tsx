'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Phone, Mail, Building, Briefcase, MapPin,
  MessageSquare, TrendingUp, CreditCard, CheckSquare,
  Plus, Trash2, UserX, Tag,
} from 'lucide-react';

interface Contact {
  id: string;
  phoneNumber: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  jobTitle?: string;
  address?: string;
  tags: string[];
  lifecycleStage: string;
  score: number;
  notes?: string;
  isBlocked: boolean;
  optedOut: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TimelineItem {
  type: 'message' | 'lead' | 'deal' | 'task' | 'payment' | 'note';
  date: string;
  data: Record<string, unknown>;
}

interface ContactNote {
  id: string;
  content: string;
  createdAt: string;
}

const LIFECYCLE_COLORS: Record<string, string> = {
  SUBSCRIBER: 'bg-gray-100 text-gray-600',
  LEAD: 'bg-blue-50 text-blue-600',
  MQL: 'bg-violet-50 text-violet-600',
  SQL: 'bg-indigo-50 text-indigo-600',
  OPPORTUNITY: 'bg-amber-50 text-amber-600',
  CUSTOMER: 'bg-emerald-50 text-emerald-600',
  EVANGELIST: 'bg-pink-50 text-pink-600',
};

const LIFECYCLE_STAGES = ['SUBSCRIBER', 'LEAD', 'MQL', 'SQL', 'OPPORTUNITY', 'CUSTOMER', 'EVANGELIST'];

function EditableField({ label, value, icon: Icon, onSave, type = 'text' }: {
  label: string; value: string; icon: React.ElementType; onSave: (val: string) => void; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-2 py-1.5 group">
      <Icon size={12} className="text-gray-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            type={type}
            autoFocus
            className="w-full text-xs border border-violet-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
        ) : (
          <p
            onClick={() => { setDraft(value); setEditing(true); }}
            className="text-xs text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 min-h-[18px]"
          >
            {value || <span className="text-gray-300 italic">Click to add</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [newTag, setNewTag] = useState('');

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const res = await api.get<{ data: Contact }>(`/contacts/${id}`);
      return res.data.data;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ['contact-timeline', id],
    queryFn: async () => {
      const res = await api.get<{ data: TimelineItem[] }>(`/contacts/${id}/timeline`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: notes } = useQuery({
    queryKey: ['contact-notes', id],
    queryFn: async () => {
      const res = await api.get<{ data: ContactNote[] }>(`/contacts/${id}/notes`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string; color: string }> }>('/tags');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/contacts/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contact', id] }); toast.success('Updated'); },
    onError: () => toast.error('Failed to update'),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => api.post(`/contacts/${id}/notes`, { content: noteText }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contact-notes', id] });
      void qc.invalidateQueries({ queryKey: ['contact-timeline', id] });
      setNoteText('');
      toast.success('Note added');
    },
    onError: () => toast.error('Failed to add note'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/contacts/${id}`),
    onSuccess: () => { toast.success('Contact deleted'); router.push('/contacts'); },
  });

  if (isLoading || !contact) {
    return <div className="p-4 text-xs text-gray-300">Loading...</div>;
  }

  const displayName = contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  const initials = (displayName[0] || '?').toUpperCase();

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const currentTags = contact.tags || [];
    if (currentTags.includes(newTag.trim())) { setNewTag(''); return; }
    updateMutation.mutate({ tags: [...currentTags, newTag.trim()] });
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    updateMutation.mutate({ tags: (contact.tags || []).filter((t) => t !== tag) });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white">
        <button onClick={() => router.push('/contacts')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={14} />
        </button>
        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
          <p className="text-[10px] text-gray-400">{contact.phoneNumber}</p>
        </div>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', LIFECYCLE_COLORS[contact.lifecycleStage] || 'bg-gray-100 text-gray-500')}>
          {contact.lifecycleStage}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
          Score: {contact.score}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-full">
          {/* Left: Contact Info */}
          <div className="border-r border-gray-200 bg-white p-4 space-y-4 overflow-auto">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Contact Info</p>
              <EditableField label="Display Name" value={contact.displayName || ''} icon={Phone} onSave={(v) => updateMutation.mutate({ displayName: v })} />
              <EditableField label="First Name" value={contact.firstName || ''} icon={Phone} onSave={(v) => updateMutation.mutate({ firstName: v })} />
              <EditableField label="Last Name" value={contact.lastName || ''} icon={Phone} onSave={(v) => updateMutation.mutate({ lastName: v })} />
              <EditableField label="Phone" value={contact.phoneNumber} icon={Phone} onSave={(v) => updateMutation.mutate({ phoneNumber: v })} />
              <EditableField label="Email" value={contact.email || ''} icon={Mail} onSave={(v) => updateMutation.mutate({ email: v })} type="email" />
              <EditableField label="Company" value={contact.companyName || ''} icon={Building} onSave={(v) => updateMutation.mutate({ companyName: v })} />
              <EditableField label="Job Title" value={contact.jobTitle || ''} icon={Briefcase} onSave={(v) => updateMutation.mutate({ jobTitle: v })} />
              <EditableField label="Address" value={contact.address || ''} icon={MapPin} onSave={(v) => updateMutation.mutate({ address: v })} />
            </div>

            {/* Lifecycle */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Lifecycle Stage</p>
              <select
                value={contact.lifecycleStage}
                onChange={(e) => updateMutation.mutate({ lifecycleStage: e.target.value })}
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
              >
                {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Tags */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(contact.tags || []).map((tag) => (
                  <span key={tag} className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="text-violet-400 hover:text-violet-600">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-violet-400"
                >
                  <option value="">Select tag...</option>
                  {(tags || []).filter((t) => !(contact.tags || []).includes(t.name)).map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <button onClick={handleAddTag} disabled={!newTag} className="bg-gray-900 text-white px-2 py-1 rounded text-[10px] disabled:opacity-30">
                  <Plus size={10} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-gray-100 space-y-1">
              <button onClick={() => deleteMutation.mutate()} className="flex items-center gap-1.5 text-[10px] text-red-500 hover:text-red-600 w-full py-1">
                <Trash2 size={10} /> Delete contact
              </button>
              {!contact.optedOut && (
                <button onClick={() => updateMutation.mutate({ optedOut: true })} className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 w-full py-1">
                  <UserX size={10} /> Opt out (GDPR)
                </button>
              )}
            </div>
          </div>

          {/* Middle: Timeline */}
          <div className="bg-gray-50 p-4 overflow-auto">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity Timeline</p>
            {!timeline?.length ? (
              <p className="text-xs text-gray-300">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5', {
                      'bg-blue-50': item.type === 'message',
                      'bg-green-50': item.type === 'lead',
                      'bg-violet-50': item.type === 'deal',
                      'bg-amber-50': item.type === 'task',
                      'bg-emerald-50': item.type === 'payment',
                      'bg-gray-100': item.type === 'note',
                    })}>
                      {item.type === 'message' && <MessageSquare size={10} className="text-blue-500" />}
                      {item.type === 'lead' && <TrendingUp size={10} className="text-green-500" />}
                      {item.type === 'deal' && <Briefcase size={10} className="text-violet-500" />}
                      {item.type === 'task' && <CheckSquare size={10} className="text-amber-500" />}
                      {item.type === 'payment' && <CreditCard size={10} className="text-emerald-500" />}
                      {item.type === 'note' && <Tag size={10} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-700">
                        {item.type === 'message' && `${(item.data as Record<string, string>).direction}: ${((item.data as Record<string, string>).body || '').slice(0, 60)}`}
                        {item.type === 'lead' && `Lead: ${(item.data as Record<string, string>).title} [${(item.data as Record<string, string>).status}]`}
                        {item.type === 'deal' && `Deal: ${(item.data as Record<string, string>).title} [${(item.data as Record<string, string>).stage}]`}
                        {item.type === 'task' && `Task: ${(item.data as Record<string, string>).title} [${(item.data as Record<string, string>).status}]`}
                        {item.type === 'payment' && `Payment: ₹${Number((item.data as Record<string, number>).amount) / 100} [${(item.data as Record<string, string>).status}]`}
                        {item.type === 'note' && `Note: ${((item.data as Record<string, string>).content || '').slice(0, 80)}`}
                      </p>
                      <p className="text-[9px] text-gray-300">{new Date(item.date).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Notes */}
          <div className="bg-white p-4 overflow-auto border-l border-gray-200">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Notes</p>
            <div className="mb-3">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none placeholder:text-gray-300"
              />
              <button
                onClick={() => addNoteMutation.mutate()}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                className="mt-1 bg-gray-900 text-white px-2.5 py-1 rounded text-[10px] disabled:opacity-30"
              >
                Add Note
              </button>
            </div>
            <div className="space-y-2">
              {(notes || []).map((note) => (
                <div key={note.id} className="border border-gray-100 rounded p-2">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-[9px] text-gray-300 mt-1">{new Date(note.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

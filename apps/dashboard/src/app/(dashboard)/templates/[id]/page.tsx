'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api-client';
import {
  ArrowLeft, Edit3, Eye, MessageSquare, Copy, Archive, Trash2, Power,
  Clock, TrendingUp, Send, Tag as TagIcon, FileText, CheckCircle2,
  History, Play, Info, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type TemplateType = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'LOCATION' | 'CONTACTS';
type TemplateCategory = 'GREETING' | 'FOLLOW_UP' | 'PROMOTION' | 'PAYMENT_REMINDER' | 'ORDER_UPDATE' | 'SUPPORT' | 'FEEDBACK' | 'REVIEW' | 'APPOINTMENT' | 'GENERAL';

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface TemplateActivity {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actorType: string;
  actorId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  type: TemplateType;
  status: TemplateStatus;
  body: string;
  variables: Record<string, string> | null;
  mediaUrl: string | null;
  language: string;
  tags: string[];
  useCount: number;
  sentCount: number;
  conversionCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  createdBy: User | null;
  activities: TemplateActivity[];
  variantOf: string | null;
  variantName: string | null;
}

const STATUS_COLORS: Record<TemplateStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 border-gray-200',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  ARCHIVED: 'bg-orange-50 text-orange-700 border-orange-200',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  CREATED: <FileText size={12} className="text-gray-800" />,
  UPDATED: <Edit3 size={12} className="text-amber-500" />,
  ACTIVATED: <CheckCircle2 size={12} className="text-green-500" />,
  ARCHIVED: <Archive size={12} className="text-orange-500" />,
  DELETED: <Trash2 size={12} className="text-red-500" />,
  USED: <Eye size={12} className="text-gray-800" />,
  SENT: <Send size={12} className="text-gray-800" />,
  PREVIEWED: <Play size={12} className="text-gray-500" />,
  CONVERTED: <TrendingUp size={12} className="text-green-600" />,
};

type TabType = 'preview' | 'variables' | 'activity';

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [showEdit, setShowEdit] = useState(false);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<TemplateCategory>('GENERAL');
  const [editTags, setEditTags] = useState('');

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ['template', id],
    queryFn: async (): Promise<Template> => {
      const res = await api.get<{ data: Template }>(`/templates/${id}`);
      return res.data.data;
    },
  });

  // Initialize form state when template loads
  useEffect(() => {
    if (template) {
      setEditName(template.name);
      setEditBody(template.body);
      setEditCategory(template.category);
      setEditTags(template.tags.join(', '));
      // Initialize preview vars with defaults
      if (template.variables) {
        setPreviewVars(template.variables);
      }
    }
  }, [template]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; body?: string; category?: TemplateCategory; tags?: string[] }) =>
      api.patch(`/templates/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['template', id] });
      toast.success('Template updated');
      setShowEdit(false);
    },
    onError: () => toast.error('Failed to update template'),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/templates/${id}/activate`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['template', id] });
      toast.success('Template activated');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.post(`/templates/${id}/archive`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['template', id] });
      toast.success('Template archived');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (name?: string) => api.post(`/templates/${id}/duplicate`, { newName: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template duplicated');
      router.push('/templates');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/templates/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted');
      router.push('/templates');
    },
    onError: (err: any) => {
      if (err.response?.data?.message?.includes('active')) {
        toast.error('Archive active templates before deleting');
      } else {
        toast.error('Failed to delete template');
      }
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: () => api.post('/templates/preview', {
      templateId: id,
      variables: previewVars,
    }),
    onSuccess: (res: any) => {
      toast.success(`Preview: ${res.data.data.rendered}`);
    },
  });

  const handleSaveEdit = () => {
    updateMutation.mutate({
      name: editName,
      body: editBody,
      category: editCategory,
      tags: editTags ? editTags.split(',').map((t) => t.trim()) : [],
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-sm">Template not found</div>
      </div>
    );
  }

  const t: Template = template; // Explicitly typed after null check

  const renderPreview = () => {
    let body = t.body;
    const allVars = { ...(t.variables || {}), ...previewVars };
    for (const [key, value] of Object.entries(allVars)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    // Remove any remaining vars
    body = body.replace(/\{\{(\w+)\}\}/g, '');
    return body;
  };

  const variableList = t.body.match(/\{\{(\w+)\}\}/g)
    ? [...new Set(t.body.match(/\{\{(\w+)\}\}/g)!.map((v) => v.slice(2, -2)))]
    : [];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 px-5 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/templates')}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{t.name}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium ${STATUS_COLORS[t.status]}`}>
              {t.status === 'DRAFT' && <FileText size={10} />}
              {t.status === 'ACTIVE' && <CheckCircle2 size={10} />}
              {t.status === 'ARCHIVED' && <Archive size={10} />}
              {t.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {t.status === 'DRAFT' && (
            <button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Power size={13} /> Activate
            </button>
          )}
          {t.status === 'ACTIVE' && (
            <button
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Archive size={13} /> Archive
            </button>
          )}
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Edit3 size={13} /> Edit
          </button>
          <button
            onClick={() => {
              const name = prompt('Duplicate as:', `${t.name} (copy)`);
              if (name) duplicateMutation.mutate(name);
            }}
            className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-700"
            title="Duplicate"
          >
            <Copy size={15} />
          </button>
          {(t.status === 'DRAFT' || t.status === 'ARCHIVED') && (
            <button
              onClick={() => {
                if (confirm('Delete this template?')) deleteMutation.mutate();
              }}
              className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-5">
          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Uses" value={t.useCount} icon={<MessageSquare size={14} />} />
            <StatCard label="Sent" value={t.sentCount} icon={<Send size={14} />} />
            <StatCard label="Conversions" value={t.conversionCount} icon={<TrendingUp size={14} />} color="text-green-600" />
            <StatCard
              label="Conversion Rate"
              value={`${t.useCount > 0 ? Math.round((t.conversionCount / t.useCount) * 100) : 0}%`}
              icon={<TrendingUp size={14} />}
              color="text-gray-700"
            />
          </div>

          {/* 3-Column Layout */}
          <div className="grid grid-cols-3 gap-5">
            {/* Left: Info Panel */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                  <Info size={13} /> Template Info
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Name" value={t.name} />
                <InfoRow label="Category" value={t.category.replace('_', ' ')} />
                <InfoRow label="Type" value={t.type} />
                <InfoRow label="Language" value={t.language.toUpperCase()} />
                <InfoRow label="Created" value={new Date(t.createdAt).toLocaleDateString()} />
                {t.lastUsedAt && (
                  <InfoRow label="Last Used" value={new Date(t.lastUsedAt).toLocaleString()} />
                )}
                {t.createdBy && (
                  <InfoRow
                    label="Created By"
                    value={`${t.createdBy.firstName || ''} ${t.createdBy.lastName || ''}`.trim() || 'Unknown'}
                  />
                )}
                {t.tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-gray-400 w-16 shrink-0">Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map((tag: string) => (
                        <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          <TagIcon size={8} /> {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Center: Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200">
                <TabButton active={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>
                  <Play size={12} /> Preview
                </TabButton>
                <TabButton active={activeTab === 'variables'} onClick={() => setActiveTab('variables')}>
                  <TagIcon size={12} /> Variables
                </TabButton>
                <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
                  <History size={12} /> Activity
                </TabButton>
              </div>

              <div className="p-4 min-h-[400px]">
                {activeTab === 'preview' && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="text-[10px] text-gray-400 mb-2">Rendered Output</div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                        {renderPreview() || <span className="text-gray-400 italic">Preview will appear here</span>}
                      </div>
                    </div>

                    {variableList.length > 0 && (
                      <div>
                        <div className="text-[10px] text-gray-400 mb-2">Test Values</div>
                        <div className="space-y-2">
                          {variableList.map((variable: string) => (
                            <div key={variable} className="flex items-center gap-2">
                              <span className="text-xs font-mono text-gray-500 w-24">
                                {'{{'}{variable}{'}}'}
                              </span>
                              <input
                                value={previewVars[variable] || t.variables?.[variable] || ''}
                                onChange={(e) => setPreviewVars({ ...previewVars, [variable]: e.target.value })}
                                placeholder={`Enter ${variable}`}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {t.status === 'ACTIVE' && (
                      <div className="pt-2 border-t border-gray-100">
                        <div className="text-[10px] text-gray-400 mb-2">Send Test</div>
                        <div className="flex gap-2">
                          <input
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value)}
                            placeholder="Phone number (e.g., 919876543210)"
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                          />
                          <button
                            onClick={() => sendTestMutation.mutate()}
                            disabled={!testPhone || sendTestMutation.isPending}
                            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded text-xs font-medium disabled:opacity-40"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'variables' && (
                  <div className="space-y-3">
                    <div className="text-[10px] text-gray-400">
                      Variables in this template. Set default values that will be used if no override is provided.
                    </div>
                    {variableList.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-xs">No variables found in template</div>
                    ) : (
                      <div className="space-y-2">
                        {variableList.map((variable) => (
                          <div key={variable} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                            <code className="text-xs font-mono text-gray-900 bg-gray-50 px-1.5 py-0.5 rounded">
                              {'{{'}{variable}{'}}'}
                            </code>
                            <span className="text-xs text-gray-400">→</span>
                            <span className="text-xs text-gray-600">
                              {t.variables?.[variable] || <span className="italic text-gray-400">No default</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {t.mediaUrl && (
                      <div className="pt-3 border-t border-gray-100">
                        <div className="text-[10px] text-gray-400 mb-1">Media Attachment</div>
                        <a href={t.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-700 hover:underline truncate block">
                          {t.mediaUrl}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div className="space-y-3">
                    {t.activities.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-xs">No activity yet</div>
                    ) : (
                      t.activities.map((activity: TemplateActivity) => (
                        <div key={activity.id} className="flex gap-3 p-2 hover:bg-gray-50 rounded-lg">
                          <div className="mt-0.5">
                            {ACTIVITY_ICONS[activity.type] || <Clock size={12} className="text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-900">{activity.title}</span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(activity.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {activity.body && (
                              <div className="text-xs text-gray-500 mt-0.5">{activity.body}</div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Quick Actions */}
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-xs font-semibold text-gray-900">Quick Actions</h3>
                </div>
                <div className="p-2">
                  {t.status === 'DRAFT' && (
                    <button
                      onClick={() => activateMutation.mutate()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                    >
                      <div className="p-1.5 rounded-lg bg-green-50 text-green-600"><Power size={14} /></div>
                      <div>
                        <div className="text-xs font-medium text-gray-900">Activate Template</div>
                        <div className="text-[10px] text-gray-400">Make available for use</div>
                      </div>
                      <ChevronRight size={14} className="ml-auto text-gray-300" />
                    </button>
                  )}
                  {t.status === 'ACTIVE' && (
                    <button
                      onClick={() => archiveMutation.mutate()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                    >
                      <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600"><Archive size={14} /></div>
                      <div>
                        <div className="text-xs font-medium text-gray-900">Archive Template</div>
                        <div className="text-[10px] text-gray-400">Remove from active list</div>
                      </div>
                      <ChevronRight size={14} className="ml-auto text-gray-300" />
                    </button>
                  )}
                  <button
                    onClick={() => setShowEdit(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                  >
                    <div className="p-1.5 rounded-lg bg-gray-100 text-gray-600"><Edit3 size={14} /></div>
                    <div>
                      <div className="text-xs font-medium text-gray-900">Edit Template</div>
                      <div className="text-[10px] text-gray-400">Modify name, body, or settings</div>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-gray-300" />
                  </button>
                  <button
                    onClick={() => {
                      const name = prompt('Duplicate as:', `${t.name} (copy)`);
                      if (name) duplicateMutation.mutate(name);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg text-left transition-colors"
                  >
                    <div className="p-1.5 rounded-lg bg-gray-50 text-gray-700"><Copy size={14} /></div>
                    <div>
                      <div className="text-xs font-medium text-gray-900">Duplicate</div>
                      <div className="text-[10px] text-gray-400">Create a copy as DRAFT</div>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-gray-300" />
                  </button>
                </div>
              </div>

              {/* Raw Body */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-xs font-semibold text-gray-900">Raw Body</h3>
                </div>
                <div className="p-3">
                  <pre className="text-[10px] text-gray-600 whitespace-pre-wrap font-mono break-all">
                    {t.body}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Edit Template</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight size={20} className="rotate-90" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as TemplateCategory)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                >
                  {['GREETING', 'FOLLOW_UP', 'PROMOTION', 'PAYMENT_REMINDER', 'ORDER_UPDATE', 'SUPPORT', 'FEEDBACK', 'REVIEW', 'APPOINTMENT', 'GENERAL'].map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Variables: {Array.from(editBody.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]).join(', ') || 'none'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button onClick={() => setShowEdit(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
                className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-medium disabled:opacity-40"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1 rounded ${color ? 'bg-gray-50 ' + color : 'text-gray-500 bg-gray-50'}`}>{icon}</div>
        <span className={`text-lg font-semibold ${color || 'text-gray-900'}`}>{value}</span>
      </div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-gray-400 w-20 shrink-0">{label}</span>
      <span className="text-xs text-gray-700">{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-gray-800 text-gray-900 bg-gray-50/50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

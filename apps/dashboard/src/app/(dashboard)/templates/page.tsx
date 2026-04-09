'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Plus, FileText } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  status: string;
  createdAt: string;
}

export default function TemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await api.get<{ data: { items: Template[]; total: number } }>('/templates');
      return res.data.data;
    },
  });

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900">Templates</span>
        <button className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1 rounded text-[11px] font-medium">
          <Plus size={11} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : !data?.items?.length ? (
          <div className="p-8 text-center text-gray-300">
            <FileText size={24} className="mx-auto mb-2 text-gray-200" />
            <p className="text-xs">No templates yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0">
              <tr>
                {['Name', 'Category', 'Body', 'Status', 'Created'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.items.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer">
                  <td className="px-3 py-2 text-xs font-medium text-gray-900">{t.name}</td>
                  <td className="px-3 py-2"><span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">{t.category}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-400 max-w-xs truncate">{t.body}</td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">{t.status}</td>
                  <td className="px-3 py-2 text-[11px] text-gray-300">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && <div className="h-9 border-t border-gray-200 px-3 flex items-center shrink-0 bg-white">
        <span className="text-[10px] text-gray-400">{data.total} templates</span>
      </div>}
    </div>
  );
}

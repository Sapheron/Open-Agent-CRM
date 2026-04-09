'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Calendar, MessageSquare, Send, Camera, Puzzle } from 'lucide-react';
import type { ReactNode } from 'react';

interface Integration {
  id: string;
  name: string;
  type: string;
  isConnected: boolean;
  connectedAt: string | null;
}

const icons: Record<string, ReactNode> = {
  google_calendar: <Calendar size={20} className="text-blue-500" />,
  slack: <MessageSquare size={20} className="text-purple-500" />,
  telegram: <Send size={20} className="text-sky-500" />,
  instagram: <Camera size={20} className="text-pink-500" />,
};

const fallbackIntegrations = [
  { id: 'google_calendar', name: 'Google Calendar', type: 'google_calendar', isConnected: false, connectedAt: null },
  { id: 'slack', name: 'Slack', type: 'slack', isConnected: false, connectedAt: null },
  { id: 'telegram', name: 'Telegram', type: 'telegram', isConnected: false, connectedAt: null },
  { id: 'instagram', name: 'Instagram', type: 'instagram', isConnected: false, connectedAt: null },
];

export default function IntegrationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api.get<{ data: { items: Integration[] } }>('/integrations');
      return res.data.data.items;
    },
  });

  const integrations = data?.length ? data : fallbackIntegrations;

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900">Integrations</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="p-8 text-center text-gray-300 text-xs">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-2xl">
            {integrations.map((i) => (
              <div key={i.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors bg-white">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    {icons[i.type] ?? <Puzzle size={20} className="text-gray-400" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">{i.name}</p>
                    <p className="text-[10px] text-gray-400">{i.type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${i.isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                    {i.isConnected ? 'Connected' : 'Not connected'}
                  </span>
                  <button className={`text-[11px] px-2.5 py-1 rounded font-medium ${i.isConnected ? 'border border-gray-200 text-gray-500 hover:bg-gray-50' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}>
                    {i.isConnected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

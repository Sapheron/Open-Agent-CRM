'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { MessageSquare, Users, TrendingUp, Briefcase, CheckSquare, Bot, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  contacts: { total: number; newToday: number };
  conversations: { open: number; aiHandling: number };
  leads: { total: number; active: number; wonThisMonth: number };
  deals: { total: number; active: number; wonThisMonth: number; pipelineValue: number; wonValueThisMonth: number };
  tasks: { todo: number; overdue: number };
  messages: { last30Days: number; aiGeneratedLast30Days: number; aiRate: number };
  payments: { totalPaidThisMonth: number; countThisMonth: number };
}

function Stat({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className="text-gray-400" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#f59e0b', '#9ca3af'];

export default function AnalyticsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: async () => {
      const res = await api.get<{ data: DashboardStats }>('/analytics/dashboard');
      return res.data.data;
    },
    refetchInterval: 60000,
  });

  const { data: funnel } = useQuery({
    queryKey: ['deal-funnel'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ stage: string; _count: number; _sum: { value: number } }> }>('/analytics/deals/funnel');
      return res.data.data;
    },
  });

  const { data: sources } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ source: string | null; _count: number }> }>('/analytics/leads/sources');
      return res.data.data;
    },
  });

  if (isLoading || !stats) {
    return <div className="p-4 text-gray-300 text-xs">Loading...</div>;
  }

  const funnelData = funnel?.map((f) => ({ name: f.stage, count: f._count })) ?? [];
  const sourcesData = sources?.filter((s) => s.source).map((s) => ({ name: s.source ?? 'unknown', value: s._count })) ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 border-b border-gray-200 px-4 flex items-center shrink-0 bg-white">
        <span className="text-xs font-semibold text-gray-900">Analytics</span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={Users} label="Contacts" value={stats.contacts.total.toLocaleString()} sub={`+${stats.contacts.newToday} today`} />
          <Stat icon={MessageSquare} label="Open Chats" value={stats.conversations.open} sub={`${stats.conversations.aiHandling} AI`} />
          <Stat icon={TrendingUp} label="Active Leads" value={stats.leads.active} sub={`${stats.leads.wonThisMonth} won`} />
          <Stat icon={Briefcase} label="Pipeline" value={formatCurrency(stats.deals.pipelineValue * 100)} sub={`${stats.deals.active} deals`} />
          <Stat icon={CheckSquare} label="Tasks" value={stats.tasks.todo} sub={stats.tasks.overdue > 0 ? `${stats.tasks.overdue} overdue` : 'On track'} />
          <Stat icon={Bot} label="AI Rate" value={`${stats.messages.aiRate}%`} sub={`${stats.messages.aiGeneratedLast30Days} AI msgs`} />
          <Stat icon={MessageSquare} label="Messages 30d" value={stats.messages.last30Days.toLocaleString()} />
          <Stat icon={CreditCard} label="Revenue" value={formatCurrency(stats.payments.totalPaidThisMonth)} sub={`${stats.payments.countThisMonth} payments`} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-900 mb-3">Deal Pipeline</p>
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={funnelData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-300 text-xs">No data</div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-900 mb-3">Lead Sources</p>
            {sourcesData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={140}>
                  <PieChart>
                    <Pie data={sourcesData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {sourcesData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {sourcesData.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-500">{s.name}</span>
                      <span className="font-medium text-gray-900 ml-auto">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-300 text-xs">No data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

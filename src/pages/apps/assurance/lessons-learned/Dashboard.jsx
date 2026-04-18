import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, CheckCircle, Archive, AlertTriangle, Star, Activity } from 'lucide-react';
import { MetricsCard, StatusBadge, ReusabilityBadge } from '@/components/lessons-learned/SharedComponents';
import { METRICS, MOCK_LESSONS } from '@/utils/lessons-learned/mockData';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

const trendData = [
  { name: 'Oct', lessons: 12 }, { name: 'Nov', lessons: 19 },
  { name: 'Dec', lessons: 15 }, { name: 'Jan', lessons: 28 },
  { name: 'Feb', lessons: 22 }, { name: 'Mar', lessons: 35 }
];

const categoryData = [
  { name: 'Equipment', value: 45 }, { name: 'Planning', value: 30 },
  { name: 'HSE', value: 25 }, { name: 'Optimization', value: 56 }
];

const COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--info))'];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <MetricsCard title="Total Lessons" value={METRICS.total} icon={<BookOpen size={24}/>} colorClass="text-[hsl(var(--primary))]" trend="+12% MoM" />
        <MetricsCard title="Published" value={METRICS.published} icon={<CheckCircle size={24}/>} colorClass="text-[hsl(var(--success))]" trend="+5% MoM" />
        <MetricsCard title="Under Review" value={METRICS.underReview} icon={<Clock size={24}/>} colorClass="text-[hsl(var(--warning))]" />
        <MetricsCard title="Drafts" value={METRICS.draft} icon={<BookOpen size={24}/>} colorClass="text-[hsl(var(--muted-foreground))]" />
        <MetricsCard title="Archived" value={METRICS.archived} icon={<Archive size={24}/>} colorClass="text-[hsl(var(--destructive))]" />
        <MetricsCard title="Pending Action" value={METRICS.pendingAction} icon={<AlertTriangle size={24}/>} colorClass="text-orange-500" />
        <MetricsCard title="High Reusability" value={METRICS.highReusability} icon={<Star size={24}/>} colorClass="text-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="panel-elevation lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-[hsl(var(--primary))]" />
              Lessons Captured Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLessons" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="lessons" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorLessons)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Breakdown Chart */}
        <Card className="panel-elevation">
          <CardHeader>
            <CardTitle className="text-lg">Lessons by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {categoryData.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {c.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Lessons Panel */}
      <Card className="panel-elevation">
        <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
          <CardTitle className="text-lg">Recent Lessons</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="data-grid-container border-0 rounded-none overflow-hidden">
            <table className="data-grid-table">
              <thead>
                <tr>
                  <th className="data-grid-th">ID</th>
                  <th className="data-grid-th">Title</th>
                  <th className="data-grid-th">Project</th>
                  <th className="data-grid-th">Status</th>
                  <th className="data-grid-th">Reusability</th>
                  <th className="data-grid-th text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LESSONS.slice(0,5).map(lesson => (
                  <tr key={lesson.id} className="data-grid-tr border-b border-[hsl(var(--border))] last:border-0 cursor-pointer">
                    <td className="data-grid-td text-[hsl(var(--primary))] font-medium">{lesson.id}</td>
                    <td className="data-grid-td font-medium">{lesson.title}</td>
                    <td className="data-grid-td text-[hsl(var(--muted-foreground))]">{lesson.project}</td>
                    <td className="data-grid-td"><StatusBadge status={lesson.status} /></td>
                    <td className="data-grid-td"><ReusabilityBadge level={lesson.reusability} /></td>
                    <td className="data-grid-td text-right text-[hsl(var(--muted-foreground))]">{lesson.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
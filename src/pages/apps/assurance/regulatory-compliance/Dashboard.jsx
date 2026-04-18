import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Clock, AlertTriangle, CheckCircle, Activity, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { compliancePermissionsService } from './services/compliancePermissionsService';
import { complianceRecordsService } from './services/complianceRecordsService';
import { format } from 'date-fns';

const COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--muted))'];

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [records, setRecords] = useState([]);
  const [metrics, setMetrics] = useState({ total: 0, pending: 0, overdue: 0, compliant: 0 });
  const [statusData, setStatusData] = useState([]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      const perm = await compliancePermissionsService.checkAccess();
      setAccess(perm);
      
      if (perm.hasAccess && perm.orgId) {
        try {
          const data = await complianceRecordsService.getRecords(perm.orgId);
          setRecords(data);
          
          const now = new Date();
          let pending = 0, overdue = 0, compliant = 0;
          
          data.forEach(r => {
            if (r.status === 'Compliant') compliant++;
            else if (r.status === 'Pending Review') pending++;
            else if (r.due_date && new Date(r.due_date) < now && r.status !== 'Compliant') overdue++;
          });
          
          setMetrics({ total: data.length, pending, overdue, compliant });
          setStatusData([
            { name: 'Compliant', value: compliant },
            { name: 'Pending Review', value: pending },
            { name: 'Overdue', value: overdue },
            { name: 'Draft/Other', value: data.length - (compliant + pending + overdue) }
          ].filter(d => d.value > 0));

        } catch (err) {
          toast({ title: "Error", description: "Failed to load dashboard data", variant: "destructive" });
        }
      }
      setLoading(false);
    }
    loadDashboard();
  }, [toast]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full opacity-50 py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--warning))] mb-4"></div>
        <p className="text-[hsl(var(--muted-foreground))]">Loading compliance dashboard...</p>
      </div>
    );
  }

  if (!access?.hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full py-24">
        <Lock className="w-12 h-12 text-[hsl(var(--muted-foreground))] mb-4" />
        <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Access Denied</h2>
        <p className="text-[hsl(var(--muted-foreground))]">You do not have permission to view the Regulatory Compliance module.</p>
      </div>
    );
  }

  const upcomingDeadlines = records
    .filter(r => r.status !== 'Compliant' && r.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  // Mock trend for visual purposes since we don't have historical snapshot data in this simple schema
  const trendData = [
    { name: 'Oct', count: Math.max(0, metrics.total - 10) },
    { name: 'Nov', count: Math.max(0, metrics.total - 7) },
    { name: 'Dec', count: Math.max(0, metrics.total - 5) },
    { name: 'Jan', count: Math.max(0, metrics.total - 2) },
    { name: 'Feb', count: metrics.total },
    { name: 'Mar', count: metrics.total }
  ];

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Regulatory Compliance Dashboard</h1>
        <Button onClick={() => navigate('reports')} className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 transition-colors border-0">
          View Reports
        </Button>
      </div>
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="panel-elevation">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Total Obligations</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-3xl font-bold text-[hsl(var(--foreground))]">{metrics.total}</h3>
              </div>
            </div>
            <Shield className="w-8 h-8 text-[hsl(var(--primary))]/50" />
          </CardContent>
        </Card>
        <Card className="panel-elevation cursor-pointer hover:border-[hsl(var(--success))]/50 transition-colors" onClick={() => navigate('register')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Compliant</p>
              <h3 className="text-3xl font-bold text-[hsl(var(--success))]">{metrics.compliant}</h3>
            </div>
            <CheckCircle className="w-8 h-8 text-[hsl(var(--success))]/50" />
          </CardContent>
        </Card>
        <Card className="panel-elevation cursor-pointer hover:border-[hsl(var(--warning))]/50 transition-colors" onClick={() => navigate('register')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Pending Review</p>
              <h3 className="text-3xl font-bold text-[hsl(var(--warning))]">{metrics.pending}</h3>
            </div>
            <Clock className="w-8 h-8 text-[hsl(var(--warning))]/50" />
          </CardContent>
        </Card>
        <Card className="panel-elevation cursor-pointer hover:border-[hsl(var(--destructive))]/50 transition-colors" onClick={() => navigate('register')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Overdue</p>
              <h3 className="text-3xl font-bold text-[hsl(var(--destructive))]">{metrics.overdue}</h3>
            </div>
            <AlertTriangle className="w-8 h-8 text-[hsl(var(--destructive))]/50" />
          </CardContent>
        </Card>
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="panel-elevation lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-[hsl(var(--warning))]" />
              Obligations Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--warning))" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader>
            <CardTitle className="text-lg">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center">
            {statusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="80%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {statusData.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {c.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">No data to display</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Panels Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Upcoming & Overdue Deadlines</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('register')} className="text-[hsl(var(--warning))] hover:text-[hsl(var(--warning))]/80 hover:bg-[hsl(var(--warning))]/10">View All</Button>
          </CardHeader>
          <CardContent className="p-0">
             {upcomingDeadlines.length > 0 ? (
               <ul className="divide-y divide-[hsl(var(--border))]">
                 {upcomingDeadlines.map(item => {
                   const isOverdue = new Date(item.due_date) < new Date();
                   return (
                    <li key={item.id} className="p-4 flex justify-between items-center hover:bg-[hsl(var(--secondary))]/50 transition-colors cursor-pointer" onClick={() => navigate(`register?id=${item.id}`)}>
                      <div>
                        <p className="font-medium text-[hsl(var(--foreground))]">{item.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.authority?.acronym || 'Unknown'} • {item.facility || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${isOverdue ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--warning))]'}`}>
                          {item.due_date ? format(new Date(item.due_date), 'MMM d, yyyy') : 'No Date'}
                        </p>
                        {isOverdue && <span className="text-xs text-[hsl(var(--destructive))] font-bold">Overdue</span>}
                      </div>
                    </li>
                   )
                 })}
               </ul>
             ) : (
               <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">No upcoming deadlines found.</div>
             )}
          </CardContent>
        </Card>

        <Card className="panel-elevation">
          <CardHeader className="border-b border-[hsl(var(--border))] pb-4">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
             <div className="space-y-4">
                {records.slice(0,4).map(r => (
                  <div key={`act-${r.id}`} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[hsl(var(--secondary))] flex items-center justify-center shrink-0">
                      <Activity className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    </div>
                    <div>
                      <p className="text-sm text-[hsl(var(--foreground))]">Record <span className="font-medium">{r.title}</span> was updated.</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                        {r.updated_at ? format(new Date(r.updated_at), 'MMM d, h:mm a') : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {records.length === 0 && (
                  <div className="text-center text-[hsl(var(--muted-foreground))]">No recent activity.</div>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
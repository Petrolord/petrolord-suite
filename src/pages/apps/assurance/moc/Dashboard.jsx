import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCPageShell } from './components/MOCPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  Download, 
  AlertTriangle, 
  FileText, 
  CheckCircle, 
  Clock, 
  ArrowRight, 
  Activity, 
  CheckSquare 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/exportUtils';
import { useToast } from '@/hooks/use-toast';

export default function MOCDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const metrics = [
    { title: "Active MOCs", value: 42, icon: Activity, color: "text-[hsl(var(--primary))]" },
    { title: "Pending Approval", value: 12, icon: Clock, color: "text-[hsl(var(--warning))]" },
    { title: "Overdue Actions", value: 5, icon: AlertTriangle, color: "text-[hsl(var(--destructive))]" },
    { title: "Implemented (YTD)", value: 128, icon: CheckCircle, color: "text-[hsl(var(--success))]" }
  ];

  const stageData = [
    { name: 'Draft', value: 8, fill: 'hsl(var(--muted-foreground))' },
    { name: 'Screening', value: 5, fill: 'hsl(var(--info))' },
    { name: 'Review', value: 12, fill: 'hsl(var(--warning))' },
    { name: 'Approval', value: 7, fill: 'hsl(var(--warning))' },
    { name: 'Implementation', value: 10, fill: 'hsl(var(--primary))' }
  ];

  const monthlyTrend = [
    { name: 'Oct', submitted: 15, closed: 12 },
    { name: 'Nov', submitted: 18, closed: 14 },
    { name: 'Dec', submitted: 12, closed: 18 },
    { name: 'Jan', submitted: 22, closed: 15 },
    { name: 'Feb', submitted: 25, closed: 20 },
    { name: 'Mar', submitted: 18, closed: 22 },
  ];

  const recentActivity = [
    { id: 'MOC-2026-089', title: 'Upgrade Compressor C-101', stage: 'Review', time: '2h ago' },
    { id: 'MOC-2026-088', title: 'Update bypass procedure', stage: 'Approval', time: '4h ago' },
    { id: 'MOC-2026-085', title: 'Chemical injection rate change', stage: 'Implemented', time: '1d ago' },
    { id: 'MOC-2026-082', title: 'Temporary pipeline clamp', stage: 'Draft', time: '2d ago' },
  ];

  const handleExport = (type) => {
    const filename = `MOC-Dashboard-${new Date().toISOString().split('T')[0]}`;
    // Export combined structured data for the dashboard
    const exportData = recentActivity.map(act => ({
      MOC_ID: act.id,
      Title: act.title,
      Stage: act.stage,
      Time: act.time
    }));

    let success = false;
    if (type === 'csv') success = exportToCSV(exportData, filename);
    if (type === 'excel') success = exportToExcel(exportData, filename);
    if (type === 'pdf') success = exportToPDF('MOC Dashboard Summary', exportData, filename);

    if (success) {
      toast({ title: 'Export Successful', description: `${filename}.${type} downloaded.` });
    } else {
      toast({ title: 'Export Failed', description: 'No data to export.', variant: 'destructive' });
    }
  };

  return (
    <MOCPageShell title="MOC Dashboard">
      <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
        
        {/* Sticky Action Bar */}
        <div className="sticky-action-bar rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 mt-2 bg-[hsl(var(--card))] p-4 border border-[hsl(var(--border))] no-print">
           <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
             <Button className="btn-primary whitespace-nowrap shadow-md shadow-[hsl(var(--primary))]/20" onClick={() => navigate('new')}>
               <Plus className="w-4 h-4 mr-2" /> Create MOC
             </Button>
             <Button variant="outline" className="whitespace-nowrap bg-[hsl(var(--card))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('approvals')}>
               <CheckSquare className="w-4 h-4 mr-2" /> My Approvals (3)
             </Button>
           </div>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] self-end sm:self-auto">
                <Download className="w-4 h-4 mr-2" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
              <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')}>Export as Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m, i) => (
            <Card key={i} className="panel-elevation hover:panel-glow transition-all">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--muted-foreground))] mb-1">{m.title}</p>
                  <h3 className={`text-3xl font-bold ${m.color}`}>{m.value}</h3>
                </div>
                <div className="p-3 rounded-xl bg-[hsl(var(--secondary))]">
                  <m.icon className={`w-6 h-6 ${m.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="panel-elevation">
            <CardHeader className="border-b border-[hsl(var(--border))] pb-3">
              <CardTitle className="text-base">MOC Pipeline by Stage</CardTitle>
            </CardHeader>
            <CardContent className="p-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} layout="vertical" margin={{top: 5, right: 20, left: 40, bottom: 5}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} width={100} />
                  <Tooltip cursor={{fill: 'hsl(var(--secondary))'}} contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={40}>
                    {stageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="panel-elevation">
             <CardHeader className="border-b border-[hsl(var(--border))] pb-3">
              <CardTitle className="text-base">Monthly Trend (Submitted vs Closed)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} allowDecimals={false} />
                  <Tooltip contentStyle={{backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))'}} />
                  <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                  <Line type="monotone" dataKey="submitted" name="Submitted" stroke="hsl(var(--primary))" strokeWidth={2} dot={{r: 4}} />
                  <Line type="monotone" dataKey="closed" name="Closed" stroke="hsl(var(--success))" strokeWidth={2} dot={{r: 4}} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Lower Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="panel-elevation lg:col-span-2">
            <CardHeader className="flex flex-row justify-between items-center border-b border-[hsl(var(--border))] pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-[hsl(var(--primary))]" onClick={() => navigate('register')}>View All</Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[hsl(var(--border))]">
                {recentActivity.map((act, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-[hsl(var(--secondary))] transition-colors cursor-pointer" onClick={() => navigate(act.id)}>
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-[hsl(var(--secondary-background))] rounded-md border border-[hsl(var(--border))]">
                        <FileText className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{act.id}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{act.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className={`badge-status ${act.stage === 'Draft' ? 'badge-draft' : act.stage === 'Implemented' ? 'badge-success' : act.stage === 'Approval' ? 'badge-approval' : 'badge-review'}`}>
                        {act.stage}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))] w-12">{act.time}</span>
                      <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="panel-elevation border-[hsl(var(--destructive))]/30 shadow-[0_0_10px_rgba(239,68,68,0.05)]">
             <CardHeader className="border-b border-[hsl(var(--border))] pb-3 bg-[hsl(var(--destructive))]/5">
              <CardTitle className="text-base flex items-center text-[hsl(var(--destructive))]">
                <AlertTriangle className="w-4 h-4 mr-2" /> Attention Required
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="p-3 rounded-md bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
                <p className="text-xs font-semibold text-[hsl(var(--destructive))] mb-1">Overdue Actions (5)</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">3 implementation tasks and 2 pre-startup safety reviews are past due.</p>
                <Button variant="link" size="sm" className="px-0 text-[hsl(var(--primary))] h-auto mt-2 text-xs">View Actions</Button>
              </div>
              <div className="p-3 rounded-md bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]">
                <p className="text-xs font-semibold text-[hsl(var(--warning))] mb-1">Temporary MOCs Expiring (2)</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">MOC-2026-015 and MOC-2026-033 expire in less than 7 days.</p>
                <Button variant="link" size="sm" className="px-0 text-[hsl(var(--primary))] h-auto mt-2 text-xs">Review Expiries</Button>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </MOCPageShell>
  );
}
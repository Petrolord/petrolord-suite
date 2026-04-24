import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ShieldAlert, 
  FileText, 
  Users, 
  Activity, 
  RefreshCw, 
  ArrowRight, 
  Plus, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  GitBranch, 
  BookOpen, 
  Shield, 
  CheckCircle2,
  List
} from 'lucide-react';
import { useAssuranceAnalytics } from '@/hooks/useAssuranceAnalytics';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// Theme colors for charts matching index.css
const COLORS = {
  critical: 'hsl(0, 84%, 60%)',    // Destructive
  high: 'hsl(38, 92%, 50%)',       // Warning
  medium: 'hsl(217, 91%, 60%)',    // Primary
  low: 'hsl(160, 84%, 39%)',       // Success
  draft: 'hsl(214, 20%, 69%)',     // Muted
  text: 'hsl(214, 32%, 91%)',      // Foreground
  grid: 'hsl(218, 23%, 23%)'       // Border
};

export default function Assurance() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, refetch, lastUpdated } = useAssuranceAnalytics();

  const handleExport = (dataset, filename) => {
    if (!dataset || dataset.length === 0) {
      toast({ title: 'Export Failed', description: 'No data available to export.', variant: 'destructive' });
      return;
    }
    const csvContent = "data:text/csv;charset=utf-8," + 
      [Object.keys(dataset[0]).join(",")]
      .concat(dataset.map(row => Object.values(row).map(v => `"${(v||'').toString().replace(/"/g, '""')}"`).join(",")))
      .join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Export Successful', description: `${filename} has been downloaded.` });
  };

  const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (error) {
    return (
      <div className="p-8 w-full max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 animate-in fade-in zoom-in duration-500">
        <AlertTriangle className="w-12 h-12 text-[hsl(var(--destructive))]" />
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Analytics Unavailable</h2>
        <p className="text-[hsl(var(--muted-foreground))]">{error}</p>
        <Button onClick={refetch} className="btn-primary mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> Retry Connection
        </Button>
      </div>
    );
  }

  const renderMetric = (label, value, icon, colorClass) => (
    <div className="flex flex-col p-3 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))]">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${colorClass}`}>{loading ? '-' : value}</span>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[hsl(var(--border))] pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">Assurance & Compliance Hub</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm md:text-base">
            Unified reporting and real-time analytics across Risk, Documents, Peer Reviews, MOC, QA Plans, Regulatory Compliance, ISO Compliance, and Lessons Learned.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Last updated: {formatTime(lastUpdated)}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refetch} 
            disabled={loading}
            className="bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--primary))]"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* 1. Risk Register Analytics */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--destructive))]/10 rounded-md">
                <ShieldAlert className="w-5 h-5 text-[hsl(var(--destructive))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Risk Register Analytics</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[hsl(var(--secondary))]" onClick={() => handleExport(data.raw.risks, 'risks_export.csv')}>
                <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {renderMetric("Open Risks", data.risks.open, <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />, "text-[hsl(var(--warning))]")}
              {renderMetric("Critical", data.risks.critical, <ShieldAlert className="w-4 h-4 text-[hsl(var(--destructive))]" />, "text-[hsl(var(--destructive))]")}
              {renderMetric("Mitigated", data.risks.mitigated, <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />, "text-[hsl(var(--success))]")}
            </div>
            
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/2 h-[200px]">
                {data.risks.bySeverity.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.risks.bySeverity} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                        {data.risks.bySeverity.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase()] || COLORS.medium} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-lg">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">No risk data to display</span>
                  </div>
                )}
              </div>
              <div className="w-full md:w-1/2 space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Risks</h4>
                {data.risks.recent.length > 0 ? (
                  <ul className="space-y-2">
                    {data.risks.recent.map(r => (
                      <li key={r.id} className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/apps/assurance/risk-register/${r.id}`)}>
                        <span className="truncate pr-2 text-[hsl(var(--foreground))]">{r.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${r.status === 'Open' ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]' : 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'}`}>
                          {r.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No recent risks.</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between">
            <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/risk-register/new')}>
              <Plus className="w-4 h-4 mr-2" /> New Risk
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--primary-hover))]" onClick={() => navigate('/dashboard/apps/assurance/risk-register')}>
              View Register <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 2. MOC Analytics */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--info))]/10 rounded-md">
                <GitBranch className="w-5 h-5 text-[hsl(var(--info))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Management of Change</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[hsl(var(--secondary))]" onClick={() => toast({ description: "Exporting MOC data..." })}>
                <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {renderMetric("Active MOCs", "12", <GitBranch className="w-4 h-4 text-[hsl(var(--info))]" />, "text-[hsl(var(--foreground))]")}
              {renderMetric("Pending Approval", "4", <Clock className="w-4 h-4 text-[hsl(var(--warning))]" />, "text-[hsl(var(--warning))]")}
              {renderMetric("Implemented", "28", <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />, "text-[hsl(var(--success))]")}
            </div>
            
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/2 h-[200px]">
                {/* Mock Chart for MOC */}
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                      {name: 'Draft', value: 3},
                      {name: 'Review', value: 4},
                      {name: 'Implementation', value: 5},
                      {name: 'Closed', value: 28}
                    ]} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      <Cell fill={COLORS.draft} />
                      <Cell fill={COLORS.high} />
                      <Cell fill={COLORS.medium} />
                      <Cell fill={COLORS.low} />
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full md:w-1/2 space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Changes</h4>
                <ul className="space-y-2">
                  <li className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate('/dashboard/apps/assurance/management-of-change')}>
                    <span className="truncate pr-2 text-[hsl(var(--foreground))]">MOC-2026-042</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Review</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate('/dashboard/apps/assurance/management-of-change')}>
                    <span className="truncate pr-2 text-[hsl(var(--foreground))]">MOC-2026-041</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">Implement</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate('/dashboard/apps/assurance/management-of-change')}>
                    <span className="truncate pr-2 text-[hsl(var(--foreground))]">MOC-2026-040</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">Closed</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between">
            <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/management-of-change/new')}>
              <Plus className="w-4 h-4 mr-2" /> New MOC
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--info))] hover:bg-[hsl(var(--info))]/10" onClick={() => navigate('/dashboard/apps/assurance/management-of-change')}>
              MOC Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 3. Document Control Analytics */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--primary))]/10 rounded-md">
                <FileText className="w-5 h-5 text-[hsl(var(--primary))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Document Control</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[hsl(var(--secondary))]" onClick={() => handleExport(data.raw.docs, 'documents_export.csv')}>
                <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {renderMetric("Total Docs", data.docs.total, <FileText className="w-4 h-4 text-[hsl(var(--primary))]" />, "text-[hsl(var(--foreground))]")}
              {renderMetric("Pending", data.docs.pending, <Clock className="w-4 h-4 text-[hsl(var(--warning))]" />, "text-[hsl(var(--warning))]")}
              {renderMetric("Approved", data.docs.approved, <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />, "text-[hsl(var(--success))]")}
            </div>
            
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/2 h-[200px]">
                {data.docs.byStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.docs.byStatus} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={true} vertical={false} />
                      <XAxis type="number" stroke={COLORS.text} tick={{ fill: COLORS.draft, fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" stroke={COLORS.text} tick={{ fill: COLORS.draft, fontSize: 12 }} width={80} />
                      <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                      <Bar dataKey="value" fill={COLORS.medium} radius={[0, 4, 4, 0]} maxBarSize={40}>
                         {data.docs.byStatus.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.name === 'Approved' ? COLORS.low : entry.name === 'Draft' ? COLORS.draft : COLORS.high} />
                         ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-lg">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">No document data</span>
                  </div>
                )}
              </div>
              <div className="w-full md:w-1/2 space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Documents</h4>
                {data.docs.recent.length > 0 ? (
                  <ul className="space-y-2">
                    {data.docs.recent.map(d => (
                      <li key={d.id} className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/apps/assurance/document-control/${d.id}`)}>
                        <span className="truncate pr-2 text-[hsl(var(--foreground))]">{d.title || d.document_number}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${d.status === 'Approved' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' : 'bg-[hsl(var(--muted))]/20 text-[hsl(var(--muted-foreground))]'}`}>
                          {d.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No recent documents.</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between">
            <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/document-control/new')}>
              <Plus className="w-4 h-4 mr-2" /> Upload Doc
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--primary-hover))]" onClick={() => navigate('/dashboard/apps/assurance/document-control')}>
              Document Library <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 4. Peer Review Analytics */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--success))]/10 rounded-md">
                <Users className="w-5 h-5 text-[hsl(var(--success))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Peer Review</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[hsl(var(--secondary))]" onClick={() => handleExport(data.raw.reviews, 'reviews_export.csv')}>
                <Download className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {renderMetric("Active", data.reviews.active, <Activity className="w-4 h-4 text-[hsl(var(--primary))]" />, "text-[hsl(var(--foreground))]")}
              {renderMetric("Overdue", data.reviews.overdue, <Clock className="w-4 h-4 text-[hsl(var(--destructive))]" />, "text-[hsl(var(--destructive))]")}
              {renderMetric("Completed", data.reviews.completed, <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />, "text-[hsl(var(--success))]")}
            </div>
            
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="w-full md:w-1/2 h-[200px]">
                 {data.reviews.byStage.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.reviews.byStage} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                        {data.reviews.byStage.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'Closed' ? COLORS.low : entry.name === 'Draft' ? COLORS.draft : COLORS.high} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center border border-dashed border-[hsl(var(--border))] rounded-lg">
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">No review data</span>
                  </div>
                )}
              </div>
              <div className="w-full md:w-1/2 space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Reviews</h4>
                {data.reviews.recent.length > 0 ? (
                  <ul className="space-y-2">
                    {data.reviews.recent.map(r => (
                      <li key={r.id} className="flex justify-between items-center text-sm p-2 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer" onClick={() => navigate(`/dashboard/apps/assurance/peer-review-manager/${r.id}`)}>
                        <span className="truncate pr-2 text-[hsl(var(--foreground))]">{r.title || r.review_code}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${r.stage === 'Closed' ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]' : 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'}`}>
                          {r.stage}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No recent reviews.</p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between">
            <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/peer-review-manager/new')}>
              <Plus className="w-4 h-4 mr-2" /> Initiate Review
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--primary-hover))]" onClick={() => navigate('/dashboard/apps/assurance/peer-review-manager')}>
              Review Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 5. Quality Assurance Plan */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 rounded-md">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Quality Assurance Plans</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="flex justify-between space-x-4">
                {renderMetric("Total QA Plans", "8", <FileText className="w-4 h-4 text-emerald-500" />, "text-[hsl(var(--foreground))]")}
                {renderMetric("Active Plans", "5", <Activity className="w-4 h-4 text-blue-500" />, "text-blue-500")}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent QA Plans</h4>
                <ul className="space-y-2">
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/qa-plan')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Subsea Tie-back Installation QA</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">QAP-2026-012 • Engineering</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-500/10 text-emerald-500">Active</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/qa-plan')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Topside Module Fabrication</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">QAP-2026-009 • Construction</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Review</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between mt-auto">
             <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/qa-plan/new')}>
              <Plus className="w-4 h-4 mr-2" /> New QA Plan
            </Button>
            <Button variant="ghost" className="text-emerald-500 hover:bg-emerald-500/10" onClick={() => navigate('/dashboard/apps/assurance/qa-plan')}>
              QA Plan Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 6. Regulatory Compliance */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--warning))]/10 rounded-md">
                <Shield className="w-5 h-5 text-[hsl(var(--warning))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Regulatory Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="flex justify-between space-x-4">
                {renderMetric("Total Obligations", "142", <Shield className="w-4 h-4 text-[hsl(var(--warning))]" />, "text-[hsl(var(--foreground))]")}
                {renderMetric("Overdue", "3", <Clock className="w-4 h-4 text-[hsl(var(--destructive))]" />, "text-[hsl(var(--destructive))]")}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Compliance Items</h4>
                <ul className="space-y-2">
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/regulatory-compliance')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Annual Environmental Report</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">EPA • Facility Alpha</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]">Overdue</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/regulatory-compliance')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Well Integrity Certification</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">BSEE • Well X-15</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Pending</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between mt-auto">
             <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/regulatory-compliance/new')}>
              <Plus className="w-4 h-4 mr-2" /> New Obligation
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10" onClick={() => navigate('/dashboard/apps/assurance/regulatory-compliance')}>
              Compliance Hub <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 7. Lessons Learned */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--primary))]/10 rounded-md">
                <BookOpen className="w-5 h-5 text-[hsl(var(--primary))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">Lessons Learned</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="flex justify-between space-x-4">
                {renderMetric("Total Lessons", "156", <BookOpen className="w-4 h-4 text-[hsl(var(--primary))]" />, "text-[hsl(var(--foreground))]")}
                {renderMetric("Validated", "89", <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />, "text-[hsl(var(--success))]")}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Lessons</h4>
                <ul className="space-y-2">
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/lessons-learned')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Pump failure during startup</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Operations • Pump A-102</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">Validated</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/lessons-learned')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Drill bit selection optimization</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Drilling • Well X-15</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Review</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between mt-auto">
             <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/lessons-learned/new')}>
              <Plus className="w-4 h-4 mr-2" /> Capture Lesson
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10" onClick={() => navigate('/dashboard/apps/assurance/lessons-learned')}>
              Knowledge Base <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

        {/* 8. ISO Compliance */}
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))] shadow-lg flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[hsl(var(--border))] mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[hsl(var(--info))]/10 rounded-md">
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--info))]" />
              </div>
              <CardTitle className="text-lg text-[hsl(var(--foreground))]">ISO Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="flex justify-between space-x-4">
                {renderMetric("Total Clauses", "248", <List className="w-4 h-4 text-[hsl(var(--info))]" />, "text-[hsl(var(--foreground))]")}
                {renderMetric("Audit Findings", "14", <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))]" />, "text-[hsl(var(--warning))]")}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent Activity</h4>
                <ul className="space-y-2">
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/iso-compliance')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">ISO 9001:2015 Audit</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Internal Audit • HQ</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">Completed</span>
                  </li>
                  <li className="flex justify-between items-center text-sm p-3 hover:bg-[hsl(var(--secondary))] rounded-md transition-colors cursor-pointer border border-[hsl(var(--border))]" onClick={() => navigate('/dashboard/apps/assurance/iso-compliance')}>
                    <div>
                      <p className="font-medium text-[hsl(var(--foreground))]">Clause 7.1.5 Evidence</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Monitoring & Measuring Resources</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">Pending</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t border-[hsl(var(--border))] pt-4 flex justify-between mt-auto">
             <Button variant="outline" className="bg-transparent border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/apps/assurance/iso-compliance/new')}>
              <Plus className="w-4 h-4 mr-2" /> Add Clause
            </Button>
            <Button variant="ghost" className="text-[hsl(var(--info))] hover:bg-[hsl(var(--info))]/10" onClick={() => navigate('/dashboard/apps/assurance/iso-compliance')}>
              ISO Compliance <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>

      </div>
    </div>
  );
}
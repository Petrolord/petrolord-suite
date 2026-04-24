import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ShieldCheck, AlertTriangle, FileCheck, Users, Activity, Target, CheckCircle2, AlertOctagon } from 'lucide-react';

const COLORS = {
  compliant: 'hsl(160, 84%, 39%)',
  partial: 'hsl(38, 92%, 50%)',
  noncompliant: 'hsl(0, 84%, 60%)',
  muted: 'hsl(214, 20%, 69%)',
  primary: 'hsl(217, 91%, 60%)'
};

export default function Dashboard({ clauses = [], audits = [], findings = [], actions = [] }) {
  const metrics = useMemo(() => {
    const compliant = clauses.filter(c => c.status === 'Compliant').length;
    const partial = clauses.filter(c => c.status === 'Partial').length;
    const nonCompliant = clauses.filter(c => c.status === 'Non-Compliant').length;
    
    const openFindings = findings.filter(f => f.status === 'Open').length;
    const majorNC = findings.filter(f => f.type === 'Major NC').length;
    
    const overdueActions = actions.filter(a => a.status === 'Overdue').length;
    
    return {
      totalClauses: clauses.length,
      complianceRate: clauses.length ? Math.round((compliant / clauses.length) * 100) : 0,
      compliant,
      partial,
      nonCompliant,
      totalAudits: audits.length,
      openFindings,
      majorNC,
      overdueActions
    };
  }, [clauses, audits, findings, actions]);

  const complianceData = [
    { name: 'Compliant', value: metrics.compliant },
    { name: 'Partial', value: metrics.partial },
    { name: 'Non-Compliant', value: metrics.nonCompliant }
  ];

  const standardData = useMemo(() => {
    const counts = {};
    clauses.forEach(c => {
      counts[c.standard] = (counts[c.standard] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [clauses]);

  const MetricCard = ({ title, value, icon: Icon, description, colorClass }) => (
    <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-lg ${colorClass}`}>
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="text-3xl font-bold text-[hsl(var(--foreground))]">{value}</h3>
        </div>
        <div>
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</p>
          {description && <p className="text-xs text-[hsl(var(--muted-foreground))]/70 mt-1">{description}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Overall Compliance" value={`${metrics.complianceRate}%`} icon={ShieldCheck} colorClass="bg-emerald-500/10 text-emerald-500" description="Across all standards" />
        <MetricCard title="Total Clauses" value={metrics.totalClauses} icon={FileCheck} colorClass="bg-blue-500/10 text-blue-500" description="Tracked obligations" />
        <MetricCard title="Open Findings" value={metrics.openFindings} icon={AlertTriangle} colorClass="bg-amber-500/10 text-amber-500" description={`${metrics.majorNC} Major Non-Conformances`} />
        <MetricCard title="Overdue Actions" value={metrics.overdueActions} icon={AlertOctagon} colorClass="bg-red-500/10 text-red-500" description="Requires immediate attention" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle className="text-lg">Compliance Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={complianceData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                  {complianceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'Compliant' ? COLORS.compliant : entry.name === 'Partial' ? COLORS.partial : COLORS.noncompliant} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[hsl(var(--card))] border-[hsl(var(--border))]">
          <CardHeader>
            <CardTitle className="text-lg">Clauses by Standard</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={standardData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="value" fill={COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { DollarSign, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';
import { summarisePortfolio, CRITICAL_RISK_SCORE } from '../ExecutiveSummary';

const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: 11 } };
const HEALTH = [
    { key: 'onTrack', name: 'On track', fill: '#10b981' },
    { key: 'atRisk', name: 'At risk', fill: '#f59e0b' },
    { key: 'critical', name: 'Critical', fill: '#ef4444' },
    { key: 'unmeasured', name: 'Not measured', fill: '#94a3b8' },
];

const KPICard = ({ title, value, subtext, icon: Icon, color, testId }) => (
    <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-slate-400">{title}</p>
                    <h3 className="text-2xl font-bold text-white mt-2" data-testid={testId}>{value}</h3>
                </div>
                <div className={`p-2 rounded-lg bg-slate-800/50 ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">{subtext}</div>
        </CardContent>
    </Card>
);

// Senior test T1 (2026-09-27): the trend chips were constants, "Schedule
// Health 92%" was a literal, the average progress said it was weighted by
// budget and was not, and the status pie counted Green/Amber/Red in a field
// that holds "Active", so it drew nothing. All of it now reads the
// portfolio's own tasks and risks (summarisePortfolio in ExecutiveSummary).
const AnalyticsOverview = ({ projects, risks, tasks = [] }) => {
    const summary = useMemo(() => summarisePortfolio(projects, tasks, risks, new Date()), [projects, tasks, risks]);
    const totalBudget = summary.totalBudget;
    const weighted = projects.reduce((acc, p) => acc + (parseFloat(p.baseline_budget) || 0) * (parseFloat(p.percent_complete) || 0), 0);
    const avgProgress = totalBudget > 0 ? weighted / totalBudget : null;
    const openRisks = risks.filter((r) => String(r.status || '').toLowerCase() !== 'closed').length;
    const measured = projects.length - summary.health.unmeasured;
    const onTrackShare = measured > 0 ? (summary.health.onTrack / measured) * 100 : null;

    const healthData = HEALTH.map((h) => ({ ...h, value: summary.health[h.key] })).filter((h) => h.value > 0);

    const typeData = projects.reduce((acc, p) => {
        const type = p.project_type || 'Other';
        const existing = acc.find(i => i.name === type);
        if (existing) existing.value++;
        else acc.push({ name: type, value: 1 });
        return acc;
    }, []);

    const formatCurrency = (val) => `$${(val / 1000000).toFixed(1)}M`;

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard 
                    title="Portfolio Value" 
                    value={formatCurrency(totalBudget)} 
                    subtext="Total baseline budget" 
                    icon={DollarSign} 
                    color="text-emerald-400"
                />
                <KPICard 
                    title="Avg Progress" 
                    value={avgProgress == null ? '-' : `${Math.round(avgProgress)}%`} 
                    subtext="Weighted by baseline budget" 
                    icon={CheckCircle2} 
                    color="text-blue-400"
                />
                <KPICard 
                    title="Risk Exposure" 
                    value={summary.highRisks} 
                    subtext={`scoring ${CRITICAL_RISK_SCORE} or more, of ${openRisks} open risk${openRisks === 1 ? '' : 's'}`} 
                    icon={AlertTriangle} 
                    color="text-red-400"
                />
                <KPICard 
                    title="Schedule Health" 
                    value={onTrackShare == null ? '-' : `${Math.round(onTrackShare)}%`} 
                    testId="pm-analytics-schedule-health"
                    subtext={measured > 0 ? `of ${measured} measured project${measured === 1 ? '' : 's'} on track` : 'No project has dated, costed tasks yet'} 
                    icon={Calendar} 
                    color="text-purple-400"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Project Health (CPI and SPI)</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <div className="relative h-full w-full rounded-md bg-white p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={healthData} nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={healthData.length > 1 ? 5 : 0} dataKey="value">
                                    {healthData.map((h) => <Cell key={h.key} fill={h.fill} />)}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v} project${v === 1 ? '' : 's'}`, n]} />
                                <Legend {...LEGEND_PROPS} />
                            </PieChart>
                        </ResponsiveContainer>
                        <ChartLogo />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Projects by Type</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <div className="relative h-full w-full rounded-md bg-white p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={typeData} layout="vertical" margin={{ left: 8, right: 16 }}>
                                <CartesianGrid {...GRID_STYLE} horizontal={false} />
                                <XAxis type="number" {...AXIS} allowDecimals={false} />
                                <YAxis dataKey="name" type="category" {...AXIS} width={120} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} project${v === 1 ? '' : 's'}`, 'Count']} />
                                <Bar dataKey="value" name="Projects" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                        <ChartLogo />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AnalyticsOverview;
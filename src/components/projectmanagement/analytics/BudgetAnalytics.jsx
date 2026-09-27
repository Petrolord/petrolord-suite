import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';

const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: 11 } };

/**
 * EC6-0. Both charts here were fabrications: the cumulative trend was six
 * months of numbers written into the source (Jan 100 / 90 / 100 through Jun
 * 750 / 780 / 800), the same picture for every portfolio, and the cost
 * variance bar per project was `(Math.random() * 20) - 10`, a different
 * answer on every render.
 *
 * They now read the progress updates people have filed, which is the only
 * time-phased cost data the studio holds. With no updates there is nothing
 * to plot, and the panel says so.
 */
const BudgetAnalytics = ({ projects, financialData }) => {
    const updates = Array.isArray(financialData) ? financialData : [];
    const nameOf = (id) => {
        const project = projects.find((p) => p.id === id);
        const name = project?.name || 'Unknown';
        return name.length > 12 ? `${name.substring(0, 12)}...` : name;
    };

    const byMonth = new Map();
    updates.forEach((u) => {
        if (!u.report_date) return;
        const month = String(u.report_date).slice(0, 7);
        const row = byMonth.get(month) || { month, Planned: 0, Earned: 0, Actual: 0 };
        row.Planned += Number(u.planned_value) || 0;
        row.Earned += Number(u.earned_value) || 0;
        row.Actual += Number(u.actual_cost) || 0;
        byMonth.set(month, row);
    });
    const trendData = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

    // The latest update per project carries its current cost position.
    const latest = new Map();
    updates.forEach((u) => {
        const seen = latest.get(u.project_id);
        if (!seen || String(u.report_date) >= String(seen.report_date)) latest.set(u.project_id, u);
    });
    const varianceData = [...latest.values()]
        .filter((u) => (Number(u.planned_value) || 0) > 0)
        .slice(0, 8)
        .map((u) => ({
            name: nameOf(u.project_id),
            variance: Number((((Number(u.actual_cost) || 0) - Number(u.planned_value))
                / Number(u.planned_value) * 100).toFixed(1)),
        }));

    const NothingYet = ({ what }) => (
        <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-sm text-slate-400">
                No progress updates carry {what} yet. File a progress update on a project and it
                appears here; nothing on this panel is assumed.
            </p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="bg-slate-900 border-slate-800 h-full">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Reported Cost by Month (Portfolio)</CardTitle></CardHeader>
                        <CardContent className="h-[350px]">
                            {trendData.length === 0 ? <NothingYet what="a cost figure" /> : (
                            <div className="relative h-full w-full rounded-md bg-white p-2">
<ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorBudget" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="month" {...AXIS} />
                                    <YAxis {...AXIS} />
                                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Legend {...LEGEND_PROPS} />
                                    <Area type="monotone" dataKey="Planned" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBudget)" />
                                    <Area type="monotone" dataKey="Actual" stroke="#ef4444" fillOpacity={1} fill="url(#colorActual)" />
                                    <Area type="monotone" dataKey="Earned" stroke="#f59e0b" strokeDasharray="5 5" fill="none" />
                                </AreaChart>
                            </ResponsiveContainer>
<ChartLogo />
</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div>
                    <Card className="bg-slate-900 border-slate-800 h-full">
                        <CardHeader><CardTitle className="text-sm text-slate-300">Cost Variance % (Latest Update)</CardTitle></CardHeader>
                        <CardContent className="h-[350px]">
                            {varianceData.length === 0 ? <NothingYet what="a planned value to compare against" /> : (
                            <div className="relative h-full w-full rounded-md bg-white p-2">
<ResponsiveContainer width="100%" height="100%">
                                <BarChart data={varianceData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                                    <XAxis type="number" {...AXIS} />
                                    <YAxis dataKey="name" type="category" {...AXIS} width={80} fontSize={10} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    <Bar dataKey="variance" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                                        {varianceData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.variance > 0 ? '#ef4444' : '#10b981'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
<ChartLogo />
</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BudgetAnalytics;
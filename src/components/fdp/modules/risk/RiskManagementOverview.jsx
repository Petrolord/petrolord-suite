import React from 'react';
import { getRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, AlertOctagon, Activity, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { aggregateRisksByLevel, calculateRiskExposure, calculatePortfolioHealth } from '@/utils/fdp/riskCalculations';

const StatCard = ({ title, value, subtitle, icon: Icon, colorClass }) => (
    <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</p>
                    <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
                    {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
                </div>
                <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
                    <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
                </div>
            </div>
        </CardContent>
    </Card>
);

const RiskManagementOverview = ({ risks }) => {
    const levels = aggregateRisksByLevel(risks);
    const exposure = calculateRiskExposure(risks);
    const health = calculatePortfolioHealth(risks);

    // EC6-1: a risk with a factor missing is counted as unscored rather than
    // folded into Low, where it used to improve the health score.
    const chartData = [
        { name: 'Critical', count: levels.Critical, color: '#dc2626' },
        { name: 'High', count: levels.High, color: '#f97316' },
        { name: 'Medium', count: levels.Medium, color: '#eab308' },
        { name: 'Low', count: levels.Low, color: '#22c55e' },
        ...(levels.Unscored ? [{ name: 'Unscored', count: levels.Unscored, color: '#64748b' }] : []),
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Total Risks" 
                    value={risks.length} 
                    subtitle="Consolidated across project"
                    icon={AlertOctagon}
                    colorClass="bg-blue-500"
                />
                <StatCard 
                    title="Critical Risks" 
                    value={levels.Critical} 
                    subtitle="Requires immediate action"
                    icon={ShieldCheck}
                    colorClass="bg-red-600"
                />
                <StatCard 
                    title="Risk Exposure" 
                    value={`$${exposure.toFixed(1)}M`} 
                    subtitle="Est. cost impact (EMV)"
                    icon={TrendingUp}
                    colorClass="bg-orange-500"
                />
                <StatCard 
                    title="Portfolio Health" 
                    value={`${health}%`} 
                    subtitle="Risk weighted score"
                    icon={Activity}
                    colorClass="bg-green-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-sm">Risk Distribution by Severity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ChartFrame height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                                    <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                                    <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} allowDecimals={false}
                                        label={{ value: 'Risks', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                                    <Tooltip 
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{fill: 'transparent'}}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ChartFrame>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-sm">Top Critical Risks</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {risks
                                .sort((a,b) => (b.probability*b.impact) - (a.probability*a.impact))
                                .slice(0, 5)
                                .map(risk => (
                                <div key={risk.id} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0">
                                    <div>
                                        <p className="font-medium text-white">{risk.name}</p>
                                        <p className="text-xs text-slate-500">{risk.source} • {risk.type}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-400 font-mono">Score: {risk.probability * risk.impact}</span>
                                        {/* EC6-1: on the one scale, so this dot agrees with the register. */}
                                        <div className={`w-2 h-2 rounded-full ${getRiskLevel(riskScore(risk) ?? 0).level === 'Critical' ? 'bg-red-500' : 'bg-orange-500'}`} />
                                    </div>
                                </div>
                            ))}
                            {risks.length === 0 && <p className="text-slate-500 text-center py-8">No risks identified.</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default RiskManagementOverview;
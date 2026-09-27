import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';

const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: 11 } };

const RiskAnalytics = ({ risks }) => {
    // Heatmap Data Construction
    const heatmapData = [];
    for(let p=1; p<=5; p++) {
        for(let i=1; i<=5; i++) {
            const count = risks.filter(r => Math.round(r.probability) === p && Math.round(r.impact) === i).length;
            if(count > 0) heatmapData.push({ prob: p, impact: i, count });
        }
    }

    // Top Risks
    const topRisks = [...risks].sort((a,b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 5);

    const getColor = (score) => {
        if (score >= 15) return '#ef4444'; // Red
        if (score >= 8) return '#f59e0b'; // Amber
        return '#10b981'; // Green
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Risk Heatmap (Probability vs Impact)</CardTitle></CardHeader>
                    <CardContent className="h-[350px]">
                        <div className="relative h-full w-full rounded-md bg-white p-2">
<ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <XAxis type="number" dataKey="prob" name="Probability" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} {...AXIS} label={{ value: 'Probability (1 to 5)', position: 'bottom', fill: CHART_COLORS.axisText, fontSize: 12 }} />
                                <YAxis type="number" dataKey="impact" name="Impact" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} {...AXIS} label={{ value: 'Impact (1 to 5)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 12 }} />
                                <ZAxis type="number" dataKey="count" range={[100, 500]} name="Count" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                                    if (payload && payload.length) {
                                        const { prob, impact, count } = payload[0].payload;
                                        return <div className="bg-white p-2 rounded border border-slate-300 text-xs text-slate-800">{count} risk{count === 1 ? '' : 's'}<br/>Probability {prob}, impact {impact}</div>;
                                    }
                                    return null;
                                }}/>
                                <Scatter data={heatmapData} fill="#8884d8">
                                    {heatmapData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getColor(entry.prob * entry.impact)} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
<ChartLogo />
</div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-sm text-slate-300">Critical Risks (Top 5)</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow className="border-b-slate-800"><TableHead className="text-white">Risk Title</TableHead><TableHead className="text-white">Category</TableHead><TableHead className="text-white text-right">Score</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {topRisks.map((risk, i) => (
                                    <TableRow key={i} className="border-b-slate-800 hover:bg-slate-800/50">
                                        <TableCell className="text-slate-300 font-medium truncate max-w-[200px]" title={risk.title}>{risk.title}</TableCell>
                                        <TableCell><Badge variant="outline" className="border-slate-600 text-slate-400">{risk.category}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <span className={`font-bold ${risk.risk_score >= 15 ? 'text-red-400' : risk.risk_score >= 8 ? 'text-amber-400' : 'text-green-400'}`}>
                                                {risk.risk_score}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {topRisks.length === 0 && <TableRow><TableCell colSpan="3" className="text-center text-slate-500 py-4">No risks identified.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default RiskAnalytics;
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartPanel } from '@/components/ui/chart-panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';

const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: 11 } };

const ProjectTypeAnalytics = ({ projects }) => {
    // Aggregate data by project type
    const typeStats = projects.reduce((acc, p) => {
        const type = p.project_type || 'Other';
        if (!acc[type]) {
            acc[type] = { type, count: 0, budget: 0, progressSum: 0, risks: 0 };
        }
        acc[type].count += 1;
        acc[type].budget += (p.baseline_budget || 0);
        acc[type].progressSum += (p.percent_complete || 0);
        return acc;
    }, {});

    const data = Object.values(typeStats).map(s => ({
        ...s,
        avgProgress: Math.round(s.progressSum / s.count),
        budgetMillions: (s.budget / 1000000).toFixed(1)
    })).sort((a, b) => b.budget - a.budget);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartPanel title="Budget Distribution by Type ($MM)">
                        <div className="relative h-[300px] w-full">
<ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid {...GRID_STYLE} vertical={false} />
                                <XAxis dataKey="type" {...AXIS} interval={0} angle={-20} textAnchor="end" height={60} />
                                <YAxis {...AXIS} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Bar dataKey="budgetMillions" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Budget ($M)" />
                            </BarChart>
                        </ResponsiveContainer>
<ChartLogo />
                        </div>
                </ChartPanel>

                <ChartPanel title="Average Progress by Type">
                        <div className="relative h-[300px] w-full">
<ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid {...GRID_STYLE} vertical={false} />
                                <XAxis dataKey="type" {...AXIS} interval={0} angle={-20} textAnchor="end" height={60} />
                                <YAxis {...AXIS} domain={[0, 100]} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Bar dataKey="avgProgress" fill="#10b981" radius={[4, 4, 0, 0]} name="Progress (%)" />
                            </BarChart>
                        </ResponsiveContainer>
<ChartLogo />
                        </div>
                </ChartPanel>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-sm text-pl-text">Detailed Breakdown</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Project Type</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Total Budget</TableHead><TableHead className="text-right">Avg Progress</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {data.map((row, i) => (
                                <TableRow key={i} className="border-b-pl-border hover:bg-pl-sunken/60">
                                    <TableCell className="font-medium text-pl-text">{row.type}</TableCell>
                                    <TableCell className="text-right text-pl-muted font-pl-mono tabular-nums">{row.count}</TableCell>
                                    <TableCell className="text-right text-pl-text font-pl-mono tabular-nums">${row.budgetMillions}M</TableCell>
                                    <TableCell className="text-right text-pl-text font-pl-mono tabular-nums">{row.avgProgress}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default ProjectTypeAnalytics;
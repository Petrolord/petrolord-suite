import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { ChartPanel } from '@/components/ui/chart-panel';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

/**
 * NPV sensitivity for the plan in front of the user.
 *
 * EC6-0: every bar here used to be a literal. The chart was drawn around
 * "Base Case ($245MM)" whatever the plan said, and the caption said so in
 * dollars that belonged to no project. It now plots the screening engine's
 * own sweep (plus and minus 30 percent on each driver) of the same case the
 * NPV card above it reports.
 */
const SensitivityAnalysis = ({ economics }) => {
    if (!economics?.available) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center text-pl-warning-text text-sm font-medium mb-2">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        No sensitivity yet
                    </div>
                    <p className="text-sm text-pl-text">
                        The sweep runs on this plan's own case. It appears once the plan has the
                        cost, production and price the NPV needs.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const base = economics.metrics.npv;
    const tornadoData = economics.sensitivity
        .map((d) => ({
            name: `${d.name} (+/- 30%)`,
            min: Math.min(d.lowParamNPV, d.highParamNPV) - base,
            max: Math.max(d.lowParamNPV, d.highParamNPV) - base,
        }))
        .sort((a, b) => (b.max - b.min) - (a.max - a.min));

    return (
        <ChartPanel title="NPV Sensitivity (Tornado Chart)">
                <ChartFrame height={300}>
                        <BarChart
                            layout="vertical"
                            data={tornadoData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                            stackOffset="sign"
                        >
                            <CartesianGrid {...GRID_STYLE} horizontal={false} />
                            <XAxis type="number" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} tickFormatter={(v) => Number(v).toFixed(0)}
                                label={{ value: 'Change in NPV ($MM)', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                            <YAxis dataKey="name" type="category" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={120} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={TOOLTIP_STYLE}
                                formatter={(v) => `$${Number(v).toFixed(1)}MM`}
                            />
                            <Bar dataKey="min" fill="#ef4444" name="Downside Impact" stackId="a">
                                {tornadoData.map((entry, index) => (
                                    <Cell key={`cell-min-${index}`} fill="#ef4444" />
                                ))}
                            </Bar>
                            <Bar dataKey="max" fill="#22c55e" name="Upside Impact" stackId="a">
                                {tornadoData.map((entry, index) => (
                                    <Cell key={`cell-max-${index}`} fill="#22c55e" />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartFrame>
                <p className="text-xs text-pl-muted text-center mt-4">
                    Change in NPV ($MM) against this plan's base case (${base.toFixed(1)}MM), each
                    driver swept plus and minus 30 percent.
                </p>
        </ChartPanel>
    );
};

export default SensitivityAnalysis;

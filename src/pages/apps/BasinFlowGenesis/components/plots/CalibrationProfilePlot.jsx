import React from 'react';
import { ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

/**
 * Modeled-vs-measured depth profile (depth down the Y axis):
 * modeled = line through the final-state per-layer values,
 * measured = calibration points.
 */
const CalibrationProfilePlot = ({ title, xLabel, modeled, measured, color }) => {
    const data = [
        ...modeled.map(p => ({ depth: p.depth, modeled: p.value })),
        ...measured.map(p => ({ depth: p.depth, measured: p.value })),
    ].sort((a, b) => a.depth - b.depth);

    return (
        <div className="w-full h-full bg-white border border-slate-300 rounded-lg p-3 flex flex-col relative">
            <h4 className="text-xs text-center font-semibold mb-1" style={{ color: CHART_COLORS.axisLabel }}>{title}</h4>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart layout="vertical" data={data} margin={{ top: 5, right: 15, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                        <XAxis
                            type="number"
                            domain={['auto', 'auto']}
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: xLabel, position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: 10 }}
                        />
                        <YAxis
                            type="number"
                            dataKey="depth"
                            reversed
                            domain={['auto', 'auto']}
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: 'Depth (m)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                        <Line dataKey="modeled" name="Modeled" stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                        <Scatter dataKey="measured" name="Measured" fill="#0f172a" shape="diamond" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo style={{ height: '16px' }} />
        </div>
    );
};

export default CalibrationProfilePlot;

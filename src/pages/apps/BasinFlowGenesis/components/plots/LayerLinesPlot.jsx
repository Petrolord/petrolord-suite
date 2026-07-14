import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { alignSeriesByAge, seriesColor } from '../../services/resultsView';

/**
 * Shared per-layer-lines-vs-age plot on the suite white chartTheme.
 * `children` may add extras (e.g. maturity-window ReferenceAreas).
 */
const LayerLinesPlot = ({ results, field, title, yLabel, yDomain, children }) => {
    const { data, meta } = results;

    const chartData = useMemo(() => {
        if (!data?.timeSteps?.length || !data[field]) return [];
        return alignSeriesByAge(data.timeSteps, data[field], meta.layers);
    }, [data, field, meta]);

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative">
            <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>{title}</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={CHART_MARGINS.standard}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                        <XAxis
                            dataKey="age"
                            reversed
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <YAxis
                            stroke={CHART_COLORS.axisLine}
                            domain={yDomain}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                        {children}
                        {meta.layers.map((layer, idx) => (
                            <Line
                                key={layer.id || layer.name}
                                type="monotone"
                                dataKey={layer.name}
                                stroke={seriesColor(idx)}
                                strokeWidth={2}
                                dot={false}
                                connectNulls={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default LayerLinesPlot;

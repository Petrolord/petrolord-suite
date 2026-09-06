import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { alignSeriesByAge } from '../../services/resultsView';
import { depthToDisplay, depthLabel } from '../../services/units';

// Lithology fills — legible on the white chart background
const LITHOLOGY_COLORS = {
    sandstone: '#f4a261',
    shale: '#456990',
    limestone: '#2a9d8f',
    salt: '#e9c46a',
    coal: '#31363b',
};

const BurialHistoryPlot = ({ results, units = { depth: 'm' } }) => {
    const { data, meta } = results;
    const zU = units.depth;

    const chartData = useMemo(() => {
        if (!data?.timeSteps?.length) return [];
        return alignSeriesByAge(data.timeSteps, data.burial, meta.layers, e => [depthToDisplay(e.top, zU), depthToDisplay(e.bottom, zU)]);
    }, [data, meta, zU]);

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative">
            <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Burial History</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={CHART_MARGINS.standard}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                        <XAxis
                            dataKey="age"
                            reversed
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <YAxis
                            reversed
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: depthLabel(zU), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                        {meta.layers.map((layer) => (
                            <Area
                                key={layer.id || layer.name}
                                type="monotone"
                                dataKey={layer.name}
                                name={layer.name}
                                stroke={LITHOLOGY_COLORS[layer.lithology] || '#64748b'}
                                fill={LITHOLOGY_COLORS[layer.lithology] || '#64748b'}
                                fillOpacity={0.75}
                                connectNulls={false}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default BurialHistoryPlot;

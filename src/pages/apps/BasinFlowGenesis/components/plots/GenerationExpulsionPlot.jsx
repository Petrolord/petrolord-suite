import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { alignSeriesByAge, seriesColor } from '../../services/resultsView';

/**
 * Cumulative generated vs expelled hydrocarbon mass (kg HC per m²
 * column area) for source-rock layers — solid = generated,
 * dashed = expelled.
 */
const GenerationExpulsionPlot = ({ results }) => {
    const { data, meta } = results;

    const { chartData, sourceLayers } = useMemo(() => {
        if (!data?.timeSteps?.length) return { chartData: [], sourceLayers: [] };
        const sources = meta.layers.filter((_, li) =>
            (data.generation[li] || []).some(e => e.value > 0));
        const gen = alignSeriesByAge(data.timeSteps, data.generation, meta.layers);
        const exp = alignSeriesByAge(data.timeSteps, data.expulsion, meta.layers);
        const rows = gen.map((g, i) => {
            const point = { age: g.age };
            sources.forEach(layer => {
                point[`${layer.name} generated`] = g[layer.name];
                point[`${layer.name} expelled`] = exp[i][layer.name];
            });
            return point;
        });
        return { chartData: rows, sourceLayers: sources };
    }, [data, meta]);

    if (sourceLayers.length === 0) {
        return (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-white rounded-lg border border-slate-300">
                <p className="text-slate-500">No hydrocarbon generation — no source rock reached transformation.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative">
            <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Generation & Expulsion (cumulative)</h3>
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
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: 'Mass (kg HC/m²)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                        {sourceLayers.map((layer, idx) => (
                            <React.Fragment key={layer.id || layer.name}>
                                <Line type="monotone" dataKey={`${layer.name} generated`} stroke={seriesColor(idx)} strokeWidth={2} dot={false} connectNulls={false} />
                                <Line type="monotone" dataKey={`${layer.name} expelled`} stroke={seriesColor(idx)} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
                            </React.Fragment>
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default GenerationExpulsionPlot;

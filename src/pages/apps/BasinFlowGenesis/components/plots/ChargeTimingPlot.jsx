import React, { useMemo } from 'react';
import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';

/**
 * Petroleum-systems events chart: generation window and peak-rate age
 * per source layer. `data.generation` is CUMULATIVE mass, so the rate
 * is its per-step difference.
 */
const ChargeTimingPlot = ({ results }) => {
    const { data, meta } = results;

    const chartData = useMemo(() => {
        return meta.layers.map((layer, index) => {
            const genHist = data.generation[index];
            if (!genHist || genHist.length < 2) return null;

            // Per-step generation rate from the cumulative series.
            const rates = [];
            for (let i = 1; i < genHist.length; i++) {
                rates.push({ age: genHist[i].age, rate: genHist[i].value - genHist[i - 1].value });
            }
            const maxRate = Math.max(...rates.map(r => r.rate));
            if (!(maxRate > 0)) return null;

            const active = rates.filter(r => r.rate > 0.01 * maxRate);
            if (active.length === 0) return null;
            const peak = active.reduce((prev, cur) => (cur.rate > prev.rate ? cur : prev));

            return {
                name: layer.name,
                range: [active[active.length - 1].age, active[0].age],
                peakAge: peak.age,
            };
        }).filter(Boolean);
    }, [data, meta]);

    if (chartData.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-white rounded-lg border border-slate-300">
                <p className="text-slate-500">No significant generation events detected.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative">
            <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Petroleum Systems Events Chart</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart layout="vertical" data={chartData} margin={{ top: 20, right: 30, left: 60, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                        <XAxis
                            type="number"
                            reversed
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: 'Age (Ma)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Bar dataKey="range" fill="#059669" fillOpacity={0.55} name="Generation Window" barSize={20} />
                        <Scatter dataKey="peakAge" fill="#d97706" name="Peak Generation Rate" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default ChargeTimingPlot;

import React, { useMemo, useState } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { alignSeriesByAge, ageAxisProps, maxAgeOf, isoline, MATURITY_WINDOWS } from '../../services/resultsView';
import { depthToDisplay, depthLabel } from '../../services/units';

// Lithology fills — legible on the white chart background
const LITHOLOGY_COLORS = {
    sandstone: '#f4a261',
    shale: '#456990',
    limestone: '#2a9d8f',
    salt: '#e9c46a',
    coal: '#31363b',
};

// Overlays on the burial history (Basin T1-E1), as PetroMod draws them:
// %Ro isolines at the maturity-window boundaries, or isotherms.
const RO_LINES = MATURITY_WINDOWS.map((w) => ({ key: `ro_${w.from}`, value: w.from, label: `${w.from} %Ro`, color: w.fill }));
const ISOTHERMS_C = [60, 100, 150].map((t, i) => ({ key: `t_${t}`, value: t, label: `${t} °C`, color: ['#0ea5e9', '#f97316', '#dc2626'][i] }));

const BurialHistoryPlot = ({ results, units = { depth: 'm' } }) => {
    const { data, meta } = results;
    const zU = units.depth;
    const [overlay, setOverlay] = useState('ro');
    const lines = overlay === 'ro' ? RO_LINES : overlay === 'temp' ? ISOTHERMS_C : [];

    const chartData = useMemo(() => {
        if (!data?.timeSteps?.length) return [];
        const rows = alignSeriesByAge(data.timeSteps, data.burial, meta.layers, e => [depthToDisplay(e.top, zU), depthToDisplay(e.bottom, zU)]);
        const byAge = new Map(rows.map((r) => [r.age, r]));
        for (const l of lines) {
            for (const pt of isoline(results, overlay === 'ro' ? 'maturity' : 'temperature', l.value)) {
                const r = byAge.get(pt.age);
                if (r) r[l.key] = depthToDisplay(pt.depth, zU);
            }
        }
        return rows;
    }, [data, meta, zU, overlay]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative">
            <div className="flex items-center justify-center gap-3">
                <h3 className="text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Burial History</h3>
                <label className="text-[11px] text-slate-500 flex items-center gap-1">
                    Overlay
                    <select value={overlay} onChange={(e) => setOverlay(e.target.value)} data-testid="bf-burial-overlay"
                        className="h-6 text-[11px] border border-slate-300 rounded px-1 text-slate-700 bg-white">
                        <option value="ro">Maturity isolines (%Ro)</option>
                        <option value="temp">Isotherms (°C)</option>
                        <option value="none">None</option>
                    </select>
                </label>
            </div>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={CHART_MARGINS.standard}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                        <XAxis
                            {...ageAxisProps(maxAgeOf(results))}
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
                                isAnimationActive={false}
                            />
                        ))}
                        {lines.map((l) => (
                            <Line key={l.key} dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2}
                                strokeDasharray="6 3" dot={false} connectNulls isAnimationActive={false} />
                        ))}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default BurialHistoryPlot;

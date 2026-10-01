import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';
import { depthToDisplay, depthLabel } from '../../services/units';
import { pressureRows, pressureUnitFor, pressureSummary } from '../../services/pressureView';

// BF-U2-015: present-day pressure through the column from the burial
// history (compaction disequilibrium), depth downward: hydrostatic, pore
// and overburden. A 1D estimate; the note says what it is.
const PressurePlot = ({ results, units = { depth: 'm' }, onSend = null, sendHref = null }) => {
    const pU = pressureUnitFor(units.depth);
    const rows = useMemo(() => pressureRows(results, units.depth), [results, units.depth]);
    const sum = useMemo(() => pressureSummary(results, units.depth), [results, units.depth]);
    if (!rows.length) {
        return (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-white rounded-lg border border-slate-300" data-canvas="chart">
                <p className="text-slate-500" data-testid="bf-pressure-none">This result was computed before pressure was modelled. Run the model again.</p>
            </div>
        );
    }
    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative" data-canvas="chart">
            <div className="flex items-center justify-center gap-3 flex-wrap">
                <h3 className="text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Pressure, present day</h3>
                {sendHref && (
                    <Link to={sendHref} onClick={onSend} data-testid="bf-send-pressure"
                        className="text-[11px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100">Send to Pore Pressure Studio</Link>
                )}
            </div>
            <p className="text-center text-[11px] text-slate-500" data-testid="bf-pressure-note">{sum.text}</p>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart layout="vertical" data={rows} margin={{ top: 5, right: 20, left: 10, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                        <XAxis type="number" domain={[0, 'auto']} stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: `Pressure (${pU})`, position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                        <YAxis type="number" dataKey="depth" domain={[0, 'auto']} stroke={CHART_COLORS.axisLine}
                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                            label={{ value: depthLabel(units.depth), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                        <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                        <Line dataKey="hydrostatic" name="Hydrostatic" stroke="#2a9d8f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line dataKey="pore" name="Pore pressure" stroke="#c1121f" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        <Line dataKey="overburden" name="Overburden" stroke="#31363b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <ChartLogo />
        </div>
    );
};

export default PressurePlot;

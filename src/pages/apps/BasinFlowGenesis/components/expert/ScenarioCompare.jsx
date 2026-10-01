import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { compareScenarios, compareProfiles } from '../../services/scenarioCompare';
import { seriesColor } from '../../services/resultsView';
import { depthLabel } from '../../services/units';

// U2-008: the scenarios side by side. Rows that differ are marked; a column
// whose saved result does not belong to its inputs says so and shows no
// numbers (BF-U1-030 claimed a comparison that did not exist).
export default function ScenarioCompare({ scenarios }) {
    const { units } = useBasinFlow();
    const { columns, rows } = useMemo(() => compareScenarios(scenarios, units), [scenarios, units]);
    const profiles = useMemo(() => compareProfiles(scenarios, units), [scenarios, units]);
    const groups = [...new Set(rows.map((r) => r.group))];
    return (
        <div className="space-y-4" data-testid="bf-scenario-compare">
            <div className="overflow-x-auto rounded border border-pl-border bg-pl-surface">
                <table className="w-full text-xs text-pl-text">
                    <thead>
                        <tr className="border-b border-pl-border">
                            <th className="text-left p-2 font-medium text-pl-muted">Scenario</th>
                            {columns.map((c) => (
                                <th key={c.id} className="text-left p-2 font-semibold" data-testid="bf-compare-col">
                                    {c.name}
                                    <div className={`font-normal text-[10px] ${c.state.ok ? 'text-pl-muted' : 'text-pl-warning-text'}`} data-testid="bf-compare-col-state">{c.state.text}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((g) => (
                            <React.Fragment key={g}>
                                <tr><td colSpan={columns.length + 1} className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-pl-muted">{g}</td></tr>
                                {rows.filter((r) => r.group === g).map((r) => (
                                    <tr key={r.key} className={`border-t border-pl-border ${r.differs ? 'bg-pl-sunken' : ''}`} data-testid={`bf-compare-row-${r.key}`} data-differs={r.differs ? 'yes' : 'no'}>
                                        <td className="p-2 text-pl-muted">{r.label}{r.differs ? ' *' : ''}</td>
                                        {r.values.map((v, i) => <td key={i} className="p-2 font-mono">{v}</td>)}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                <p className="p-2 text-[10px] text-pl-muted">* differs between the scenarios.</p>
            </div>
            <div className="h-[360px] bg-white rounded-lg border border-slate-300 p-3 relative flex flex-col" data-canvas="chart">
                <h4 className="text-xs text-center font-semibold" style={{ color: CHART_COLORS.axisLabel }}>Present-day Ro through the column</h4>
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                            <XAxis type="number" dataKey="ro" domain={['auto', 'auto']} stroke={CHART_COLORS.axisLine}
                                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                label={{ value: '%Ro', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                            <YAxis type="number" dataKey="depth" reversed domain={[0, 'auto']} stroke={CHART_COLORS.axisLine}
                                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                label={{ value: depthLabel(units.depth), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                            <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                            {profiles.filter((p) => p.points.length).map((p, i) => (
                                <Line key={p.id} data={p.points} dataKey="ro" name={p.name} stroke={seriesColor(i)} strokeWidth={2} dot={false} isAnimationActive={false} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <ChartLogo style={{ height: '40px' }} />
            </div>
        </div>
    );
}

import React, { useMemo } from 'react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';
import { eventsChartRows, ageTicks, maxAgeOf } from '../../services/resultsView';

/**
 * Petroleum-system events chart (Magoon and Dow; Basin T1-003): one row per
 * element and process on the same geological time axis as the other plots
 * (oldest on the left), the critical moment marked. Drawn in HTML so the
 * row bars can hold several intervals each and print cleanly. Trap
 * formation and preservation are not modelled in 1D and are stated so.
 */
const ChargeTimingPlot = ({ results }) => {
    const maxAge = maxAgeOf(results);
    const { rows, criticalMoment } = useMemo(() => eventsChartRows(results), [results]);
    const ticks = ageTicks(maxAge);
    const x = (age) => `${(1 - age / (maxAge || 1)) * 100}%`;
    const w = ([older, younger]) => `${(Math.max(0, older - younger) / (maxAge || 1)) * 100}%`;

    if (!rows.length || !(maxAge > 0)) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-white rounded-lg border border-slate-300">
                <p className="text-slate-500">Run a simulation to see the events chart.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[400px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative" data-testid="bf-events-chart">
            <h3 className="text-center text-sm font-semibold mb-3" style={{ color: CHART_COLORS.axisLabel }}>Petroleum System Events Chart</h3>
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="relative flex-1 min-h-0">
                    {rows.map((r) => (
                        <div key={r.key} className="flex items-center h-9 border-b border-slate-100" data-testid={`bf-events-row-${r.key}`}>
                            <div className="w-36 shrink-0 pr-2 text-right text-[11px] text-slate-700 font-medium">{r.label}</div>
                            <div className="relative flex-1 h-5">
                                {r.intervals.length === 0 && <span className="absolute left-2 top-0.5 text-[10px] text-slate-400">none in this model</span>}
                                {r.intervals.map((iv, i) => (
                                    <div key={i} className="absolute top-0 h-5 rounded-sm" title={`${iv.layer}: ${iv.interval[0]} to ${iv.interval[1]} Ma`}
                                        style={{ left: x(iv.interval[0]), width: w(iv.interval), background: r.color, opacity: 0.8 }} />
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center h-9 border-b border-slate-100">
                        <div className="w-36 shrink-0 pr-2 text-right text-[11px] text-slate-700 font-medium">Trap formation</div>
                        <div className="flex-1 text-[10px] text-slate-400 pl-2">not modelled in 1D; mark it from the structural history</div>
                    </div>
                    {criticalMoment != null && (
                        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `calc(9rem + (100% - 9rem) * ${1 - criticalMoment / maxAge})` }} data-testid="bf-critical-moment">
                            <div className="h-full border-l-2 border-dashed border-red-600" />
                            <div className="absolute -top-4 -translate-x-1/2 text-[10px] font-semibold text-red-700 whitespace-nowrap">Critical moment {criticalMoment} Ma</div>
                        </div>
                    )}
                </div>
                <div className="flex mt-1">
                    <div className="w-36 shrink-0" />
                    <div className="relative flex-1 h-8 border-t border-slate-400">
                        {ticks.map((t) => (
                            <div key={t} className="absolute top-0 -translate-x-1/2 text-[10px] text-slate-600" style={{ left: x(t) }}>
                                <div className="h-1.5 border-l border-slate-400 mx-auto w-0" />{t}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="text-center text-[11px] text-slate-600">Age (Ma)</div>
            </div>
            <ChartLogo />
        </div>
    );
};

export default ChargeTimingPlot;

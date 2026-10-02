
import React, { useRef, useState, useMemo } from 'react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Expand, ZoomIn, AlertCircle, CheckCircle2, Activity, TrendingUp } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import ProbabilisticSummaryTable from './ProbabilisticSummaryTable';
import { ReportGenerator, REPORT_TEMPLATES } from '../tools/ReportGenerator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import html2canvas from 'html2canvas';
import ResultsModal from './ResultsModal';
import ChartFrame from '@/components/charts/ChartFrame';
import TornadoChart from './TornadoChart';
import SpiderChart from './SpiderChart';
import { tornadoSwings } from '@/lib/monteCarlo';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { inPlaceScale, headlineStream, runContext, runSignature } from '../../services/volumeDisplay';
import { reviewerLines } from '../../services/reportInfo';

const PARAM_LABELS = { area: 'Area', thickness: 'Thickness', ntg: 'NTG', phi: 'Porosity', sw: 'Water Sat.', fvf: 'Bo', bg: 'Bg', owc: 'OWC', goc: 'GOC', grvFactor: 'GRV Factor', gasCapFraction: 'Gas cap fraction', recovery: 'Oil RF', recoveryGas: 'Gas RF' };
// Per-variable formatting + short labels for the realization tracker (handles both
// analytic area/thickness samples and structural contact/GRV-factor samples).
const REALIZATION_FIELDS = {
    phi: { label: 'Phi', digits: 3 }, sw: { label: 'Sw', digits: 3 },
    area: { label: 'Area', digits: 0 }, thickness: { label: 'Thick', digits: 1 },
    owc: { label: 'OWC', digits: 0 }, goc: { label: 'GOC', digits: 0 },
    grvFactor: { label: 'GRV×', digits: 2 }, ntg: { label: 'NTG', digits: 2 },
    gasCapFraction: { label: 'Gas cap', digits: 2 }, recovery: { label: 'Oil RF %', digits: 1 }, recoveryGas: { label: 'Gas RF %', digits: 1 },
    fvf: { label: 'Bo', digits: 3 }, bg: { label: 'Bg', digits: 5 },
};
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

/**
 * The expectation curve as industry reads it (RCP-U1-006): the
 * probability of EXCEEDING each volume, so the 90% line meets the curve at
 * the P90 (low) volume. The engine's cdf points are non-exceedance
 * (percent of realizations at or below x); they were plotted as they came
 * under an "Expectation Curve" title with 90/50/10 guide lines, so the 90%
 * line read off the P10 (high) volume.
 */
export function exceedanceCurve(cdf, denom = 1) {
    return (cdf || []).map((p) => ({ x: +(p.x / denom).toFixed(3), y: +(100 - p.y).toFixed(2) }));
}

// Bin raw realizations + shape CDF / tornado series for the charts. Computed
// before any early return so hook order stays stable.
export function buildChartData(probResults, fluidType, unitSystem = 'field') {
    if (!probResults || !probResults.stats) return { histogram: [], cdf: [], tornado: [], swings: [] };
    const gas = fluidType === 'gas';
    const st = gas ? probResults.stats.giip : probResults.stats.stooip;
    const raw = (gas ? probResults.raw.giip : probResults.raw.stooip) || [];
    const d = inPlaceScale(headlineStream(fluidType), unitSystem).denom;
    if (!st || raw.length === 0) return { histogram: [], cdf: [], tornado: [], swings: [] };

    const vals = raw.map((v) => v / d);
    let mn = Infinity, mx = -Infinity;
    for (const v of vals) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const bins = 30;
    const w = (mx - mn) / bins || 1;
    const counts = Array(bins).fill(0);
    for (const v of vals) {
        let i = Math.floor((v - mn) / w);
        if (i >= bins) i = bins - 1;
        if (i < 0) i = 0;
        counts[i] += 1;
    }
    const histogram = counts.map((c, i) => ({ x: +(mn + (i + 0.5) * w).toFixed(3), count: c }));
    const cdf = exceedanceCurve(st.cdf, d);
    const tornado = (probResults.stats.sensitivity || []).map((s) => ({
        parameter: PARAM_LABELS[s.parameter] || s.parameter,
        contribution: +s.contribution.toFixed(1),
        dir: s.impactDirection,
    }));
    // Symmetric tornado: conditional P50 swings around the overall P50,
    // computed from the stored realizations. Legacy saved results without
    // raw samples fall back to the variance-share bars.
    const contribByParam = Object.fromEntries((probResults.stats.sensitivity || []).map((s) => [s.parameter, s.contribution]));
    const swings = tornadoSwings(probResults.raw?.samples || []).map((s) => ({
        label: PARAM_LABELS[s.parameter] || s.parameter,
        low: s.low / d,
        high: s.high / d,
        lowInputVol: s.lowInputVol / d,
        highInputVol: s.highInputVol / d,
        contribution: contribByParam[s.parameter],
        base: s.base / d,
    }));
    return { histogram, cdf, tornado, swings, p10: st.p10 / d, p50: st.p50 / d, p90: st.p90 / d };
}

const RealizationCard = ({ title, realization, unit, denom = 1e6 }) => {
    if (!realization || !realization.inputs) return null;
    // Show whichever variables this run actually sampled, in a stable order.
    const order = ['phi', 'sw', 'area', 'thickness', 'owc', 'goc', 'grvFactor', 'fvf', 'bg', 'ntg', 'gasCapFraction', 'recovery', 'recoveryGas'];
    const rows = order
        .filter((k) => Number.isFinite(realization.inputs[k]) && REALIZATION_FIELDS[k])
        .map((k) => ({ k, label: REALIZATION_FIELDS[k].label, val: realization.inputs[k].toFixed(REALIZATION_FIELDS[k].digits) }));
    return (
        <div className="bg-pl-sunken p-2 rounded border border-pl-border space-y-1">
            <div className="text-[10px] font-bold text-pl-muted border-b border-pl-border pb-1 mb-1">{title} Variables</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-pl-text">
                {rows.map((r) => (
                    <div key={r.k} className="flex justify-between"><span>{r.label}:</span> <span className="font-mono">{r.val}</span></div>
                ))}
            </div>
            <div className="pt-1 mt-1 border-t border-pl-border flex justify-between text-[10px] font-bold text-pl-text">
                <span>Vol:</span> <span>{(realization.targetVol / denom).toFixed(2)} {unit}</span>
            </div>
        </div>
    );
};

const ProbabilisticResultsDisplay = ({ isCompact = false }) => {
    const { state } = useReservoirCalc();
    const { probResults, inputs } = state;
    const { toast } = useToast();
    
    const [isFullViewOpen, setIsFullViewOpen] = useState(false);
    const [reportTemplate, setReportTemplate] = useState('technical');

    const histogramRef = useRef(null);
    const cdfRef = useRef(null);
    const tornadoRef = useRef(null);

    const [isExporting, setIsExporting] = useState(false);

    // RCP-U1-009: the run's own unit system and fluid, not the live workspace
    const run = runContext(probResults, state);
    const chartData = useMemo(
        () => buildChartData(probResults, run.fluidType, run.unitSystem),
        [probResults, run.fluidType, run.unitSystem],
    );

    if (!probResults || !probResults.stats) {
        return <div className="flex items-center justify-center h-full text-pl-muted">Run a simulation to see results.</div>;
    }

    const ft = run.fluidType;
    const isGas = ft === 'gas';
    
    const stats = isGas ? probResults.stats.giip : probResults.stats.stooip;
    const rawVolumes = isGas ? probResults.raw.giip : probResults.raw.stooip;
    const baseVal = probResults.stats.baseCaseValue;
    
    const { denom, label: unitLabel } = inPlaceScale(headlineStream(ft), run.unitSystem);
    // RCP-U1-028: the workspace changed after this run
    const stale = !!probResults.meta?.signature && probResults.meta.signature !== runSignature(state);
    const toggled = run.stamped && (run.unitSystem !== state.unitSystem || run.fluidType !== (inputs.fluidType || 'oil'));
    
    const diffBaseP50 = baseVal ? Math.abs(stats.p50 - baseVal) / baseVal * 100 : 0;

    const captureChart = async (ref) => {
        if (ref.current) {
            const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff' });
            return canvas.toDataURL('image/png');
        }
        return null;
    };

    const handleExportPDF = async () => {
        setIsExporting(true);
        toast({ title: "Generating Report", description: "Capturing charts and compiling data..." });
        
        try {
            const histImg = await captureChart(histogramRef);
            const cdfImg = await captureChart(cdfRef);
            const tornadoImg = await captureChart(tornadoRef);

            const chartImages = { histogram: histImg, cdf: cdfImg, tornado: tornadoImg };

            await ReportGenerator.generateProbabilisticReport(
                state.currentProjectMeta?.name || 'Project',
                probResults,
                run.unitSystem,
                chartImages,
                {
                    template: reportTemplate, fluidType: ft, reservoirName: state.reservoirName || 'Reservoir 1', report: inputs.report, inputMethod: state.inputMethod,
                    reviewer: reviewerLines({ report: inputs.report, unitSystem: run.unitSystem, inputMethod: state.inputMethod, fluidType: ft, inputs, probResults }),
                },
            );

            toast({ title: "Success", description: "Report downloaded successfully." });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Export Failed", description: "Could not generate PDF report. " + e.message });
        } finally {
            setIsExporting(false);
        }
    };

    const containerClass = isCompact ? "flex flex-col gap-4 p-2" : "grid grid-cols-1 gap-6 p-4";
    const cardClass = isCompact ? "p-3 min-h-[250px]" : "p-4 min-h-[400px]";

    return (
        <div className="h-full flex flex-col bg-pl-sunken text-pl-text overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
             {!isCompact && (
                <div className="flex justify-between items-end p-4 border-b border-pl-border sticky top-0 bg-pl-sunken z-10">
                    <div>
                        <h2 className="text-xl font-bold text-pl-text">Probabilistic Simulation Results</h2>
                        <div className="text-xs mt-1 flex items-center gap-3">
                            <span className="font-pl-mono font-bold text-pl-text bg-pl-sunken px-2 py-0.5 rounded border border-pl-border">
                                {(probResults.meta?.iterations || probResults.stats?.iterations || rawVolumes.length).toLocaleString()} Iterations
                                {probResults.raw?.thinned && <span className="font-normal text-pl-muted"> (saved: {probResults.raw.thinned.kept.toLocaleString()} kept for the charts)</span>}
                            </span>
                            {probResults.diagnostics.warnings.length > 0 ? (
                                <span className="text-pl-warning-text flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Warnings Present</span>
                            ) : (
                                <span className="text-pl-muted flex items-center gap-1" data-testid="rcp-mc-status"><CheckCircle2 className="w-3 h-3"/> No run warnings</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={reportTemplate} onValueChange={setReportTemplate}>
                            <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {REPORT_TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="default" size="sm" className="h-9 gap-2" onClick={handleExportPDF} disabled={isExporting}>
                            {isExporting ? <span className="animate-pulse">Exporting...</span> : <><Download className="w-4 h-4" /> Export PDF</>}
                        </Button>
                    </div>
                </div>
             )}

            {(stale || toggled) && (
                <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-xs text-pl-warning-text" data-testid="rcp-mc-stale">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                        {toggled
                            ? `This run was made in ${run.unitSystem} units for ${ft === 'oil_gas' ? 'oil and gas' : ft}; its numbers are shown in those units. `
                            : ''}
                        {stale ? 'The inputs have changed since this run. Run the simulation again to update it.' : ''}
                    </span>
                </div>
            )}

            {!isCompact && probResults.diagnostics.warnings.length > 0 && (
                <div className="mx-4 mt-4 space-y-2">
                    {probResults.diagnostics.warnings.map((w, idx) => (
                        <div key={idx} className="mb-diagnostic-warn flex items-center gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-xs text-pl-warning-text">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {w}
                        </div>
                    ))}
                </div>
            )}
            
            {!isCompact && baseVal > 0 && (
                <div className={`mx-4 mt-4 flex items-start gap-2 text-xs rounded-lg border px-3 py-2 ${diffBaseP50 > 40 ? 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text' : 'border-pl-border bg-pl-surface text-pl-muted'}`}>
                    <Activity className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        Monte Carlo P50 is {diffBaseP50.toFixed(0)}% {stats.p50 >= baseVal ? 'above' : 'below'} the deterministic base case ({(baseVal / denom).toFixed(2)} {unitLabel}).
                        A gap is expected: the P50 of a product of distributions rarely equals the product of the base-case inputs.
                        {diffBaseP50 > 40 && ' A large gap can indicate off-centre input distributions worth reviewing.'}
                    </span>
                </div>
            )}

            <div className={containerClass}>
                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-4`}>
                    {!isCompact && (
                         <Card className="p-4 text-center shadow-pl-sm">
                            <p className="text-xs text-pl-muted uppercase font-bold tracking-wider mb-1">P90 (Low estimate)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-pl-text">{(stats.p90 / denom).toFixed(2)}</span>
                                <span className="text-xs text-pl-muted">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                    <Card className={`${isCompact ? 'p-3' : 'p-4'} border-pl-primary text-center shadow-pl-sm relative overflow-hidden`}>
                        <p className="text-[10px] text-pl-primary-text uppercase font-bold tracking-wider mb-1">P50 (Best estimate)</p>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-black text-pl-text`}>{(stats.p50 / denom).toFixed(2)}</span>
                            <span className="text-xs text-pl-muted font-bold">{unitLabel}</span>
                        </div>
                        {isCompact && (
                             <div className="flex justify-between mt-2 pt-2 border-t border-pl-border text-[10px]">
                                 <div className="text-pl-muted">P90: <span className="text-pl-text">{(stats.p90 / denom).toFixed(1)}</span></div>
                                 <div className="text-pl-muted">P10: <span className="text-pl-text">{(stats.p10 / denom).toFixed(1)}</span></div>
                             </div>
                        )}
                    </Card>
                    {!isCompact && (
                        <Card className="p-4 text-center shadow-pl-sm">
                            <p className="text-xs text-pl-muted uppercase font-bold tracking-wider mb-1">P10 (High estimate)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-pl-text">{(stats.p10 / denom).toFixed(2)}</span>
                                <span className="text-sm text-pl-muted">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                </div>
                
                {isCompact && (
                    <Button variant="outline" size="sm" className="w-full border-dashed border-pl-border text-pl-muted hover:text-pl-text" onClick={() => setIsFullViewOpen(true)}>
                        <Expand className="w-3 h-3 mr-2" /> Expand All Charts & Diagnostics
                    </Button>
                )}

                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                    <Card className={`${cardClass} flex flex-col`}>
                        <div className="flex justify-between items-center mb-2 border-b border-pl-border pb-2">
                            <h3 className="text-xs font-bold text-pl-text flex items-center gap-2">
                                <ZoomIn className="w-3 h-3 text-pl-muted" /> Volume Distribution ({unitLabel})
                            </h3>
                        </div>
                        <div ref={histogramRef} data-canvas="chart">
                            <ChartFrame height={isCompact ? 200 : 280}>
                                <BarChart data={chartData.histogram} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
                                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                                    <XAxis dataKey="x" stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => v.toFixed(0)} />
                                    <YAxis stroke={CHART_COLORS.axisLine} tick={AXIS_TICK} allowDecimals={false} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                                        formatter={(v) => [v, 'Count']}
                                        labelFormatter={(x) => `${Number(x).toFixed(2)} ${unitLabel}`} />
                                    <Bar dataKey="count" fill="#2563eb" radius={[2, 2, 0, 0]} />
                                    {Number.isFinite(chartData.p90) && <ReferenceLine x={chartData.p90} stroke="#64748b" strokeDasharray="4 3" label={{ value: 'P90', position: 'top', fontSize: 9, fill: '#475569' }} />}
                                    {Number.isFinite(chartData.p50) && <ReferenceLine x={chartData.p50} stroke="#059669" strokeDasharray="4 3" label={{ value: 'P50', position: 'top', fontSize: 9, fill: '#059669' }} />}
                                    {Number.isFinite(chartData.p10) && <ReferenceLine x={chartData.p10} stroke="#64748b" strokeDasharray="4 3" label={{ value: 'P10', position: 'top', fontSize: 9, fill: '#475569' }} />}
                                </BarChart>
                            </ChartFrame>
                        </div>
                    </Card>

                    <Card className={`${cardClass} flex flex-col`}>
                        <div className="flex justify-between items-center mb-2 border-b border-pl-border pb-2">
                            <h3 className="text-xs font-bold text-pl-text flex items-center gap-2">
                                <TrendingUp className="w-3 h-3 text-pl-muted" /> Expectation curve (probability of exceeding)
                            </h3>
                        </div>
                        <div ref={cdfRef} data-canvas="chart">
                            <ChartFrame height={isCompact ? 200 : 280}>
                                <LineChart data={chartData.cdf} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
                                    <CartesianGrid {...GRID_STYLE} />
                                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => v.toFixed(0)} />
                                    <YAxis domain={[0, 100]} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => `${v}%`} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                                        formatter={(v) => [`${v}%`, 'Probability of exceeding']}
                                        labelFormatter={(x) => `${Number(x).toFixed(2)} ${unitLabel}`} />
                                    <ReferenceLine y={90} stroke="#94a3b8" strokeDasharray="2 2" />
                                    <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 2" />
                                    <ReferenceLine y={10} stroke="#94a3b8" strokeDasharray="2 2" />
                                    <Line type="monotone" dataKey="y" stroke="#059669" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ChartFrame>
                        </div>
                    </Card>
                </div>

                <Card className={`${isCompact ? 'p-3' : 'p-4'} flex flex-col`}>
                    <div className="flex justify-between items-center mb-2 border-b border-pl-border pb-2">
                        <h3 className="text-xs font-bold text-pl-text flex items-center gap-2">
                            <Activity className="w-3 h-3 text-pl-muted" /> Sensitivity Tornado (P50 swing per parameter)
                        </h3>
                        {chartData.swings.length > 0 && (
                            <span className="text-[10px] text-pl-muted">bar ends = P50 when the parameter sits in its bottom / top decile</span>
                        )}
                    </div>
                    <div ref={tornadoRef} data-canvas="chart">
                        {chartData.swings.length > 0 ? (
                            <ChartFrame height={Math.max(160, 44 + chartData.swings.length * 40)}>
                                <TornadoChart
                                    rows={chartData.swings}
                                    base={chartData.swings[0].base}
                                    unit={unitLabel}
                                    height={Math.max(160, 44 + chartData.swings.length * 40)}
                                />
                            </ChartFrame>
                        ) : chartData.tornado.length > 0 ? (
                            /* Legacy saved results carry no raw samples — fall back to variance shares. */
                            <ChartFrame height={Math.max(140, chartData.tornado.length * 34)}>
                                <BarChart data={chartData.tornado} layout="vertical" margin={{ top: 8, right: 40, bottom: 8, left: 24 }}>
                                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => `${v}%`} />
                                    <YAxis type="category" dataKey="parameter" width={80} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                                        formatter={(v, _n, p) => [`${v}%  (${p.payload.dir > 0 ? 'increases' : 'decreases'} volume)`, 'Contribution']} />
                                    <Bar dataKey="contribution" radius={[0, 3, 3, 0]}>
                                        {chartData.tornado.map((e, i) => (
                                            <Cell key={i} fill={e.dir > 0 ? '#059669' : '#dc2626'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ChartFrame>
                        ) : (
                            <div className="h-24 flex items-center justify-center text-pl-muted text-xs">Add at least one uncertainty variable to see sensitivity.</div>
                        )}
                    </div>
                </Card>

                {!isCompact && probResults.stats?.spider && (
                    <Card className="p-4 flex flex-col">
                        <div className="flex justify-between items-center mb-2 border-b border-pl-border pb-2">
                            <h3 className="text-xs font-bold text-pl-text flex items-center gap-2">
                                <Activity className="w-3 h-3 text-pl-muted" /> Spider plot ({ft === 'gas' ? 'GIIP' : 'STOIIP'} as each input moves)
                            </h3>
                            <span className="text-[10px] text-pl-muted">steeper line = more sensitive; dashed = all inputs at their medians</span>
                        </div>
                        <SpiderChart spider={probResults.stats.spider} denom={denom} unit={unitLabel} />
                    </Card>
                )}

                {!isCompact && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                         <Card className="lg:col-span-3 p-4 flex flex-col">
                            <div className="flex justify-between items-center mb-4 border-b border-pl-border pb-2">
                                <h3 className="text-sm font-bold text-pl-text">Detailed Statistics</h3>
                            </div>
                            <ProbabilisticSummaryTable />
                         </Card>
                         
                         <Card className="lg:col-span-1 p-4 flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-pl-text border-b border-pl-border pb-2">Realization Tracker</h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                                <RealizationCard title="P90" realization={probResults.diagnostics.tracking.P90} unit={unitLabel} denom={denom} />
                                <RealizationCard title="P50" realization={probResults.diagnostics.tracking.P50} unit={unitLabel} denom={denom} />
                                <RealizationCard title="P10" realization={probResults.diagnostics.tracking.P10} unit={unitLabel} denom={denom} />
                            </div>
                         </Card>
                    </div>
                )}
            </div>
            
            <ResultsModal isOpen={isFullViewOpen} onClose={() => setIsFullViewOpen(false)} />
        </div>
    );
};

export default ProbabilisticResultsDisplay;


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
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const PARAM_LABELS = { area: 'Area', thickness: 'Thickness', ntg: 'NTG', phi: 'Porosity', sw: 'Water Sat.', fvf: 'Bo', bg: 'Bg', owc: 'OWC', goc: 'GOC', grvFactor: 'GRV Factor' };
// Per-variable formatting + short labels for the realization tracker (handles both
// analytic area/thickness samples and structural contact/GRV-factor samples).
const REALIZATION_FIELDS = {
    phi: { label: 'Phi', digits: 3 }, sw: { label: 'Sw', digits: 3 },
    area: { label: 'Area', digits: 0 }, thickness: { label: 'Thick', digits: 1 },
    owc: { label: 'OWC', digits: 0 }, goc: { label: 'GOC', digits: 0 },
    grvFactor: { label: 'GRV×', digits: 2 }, ntg: { label: 'NTG', digits: 2 },
    fvf: { label: 'Bo', digits: 3 }, bg: { label: 'Bg', digits: 5 },
};
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

// Bin raw realizations + shape CDF / tornado series for the charts. Computed
// before any early return so hook order stays stable.
function buildChartData(probResults, fluidType) {
    if (!probResults || !probResults.stats) return { histogram: [], cdf: [], tornado: [] };
    const gas = fluidType === 'gas';
    const st = gas ? probResults.stats.giip : probResults.stats.stooip;
    const raw = (gas ? probResults.raw.giip : probResults.raw.stooip) || [];
    const d = gas ? 1e9 : 1e6;
    if (!st || raw.length === 0) return { histogram: [], cdf: [], tornado: [] };

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
    const cdf = (st.cdf || []).map((p) => ({ x: +(p.x / d).toFixed(3), y: +p.y.toFixed(2) }));
    const tornado = (probResults.stats.sensitivity || []).map((s) => ({
        parameter: PARAM_LABELS[s.parameter] || s.parameter,
        contribution: +s.contribution.toFixed(1),
        dir: s.impactDirection,
    }));
    return { histogram, cdf, tornado, p10: st.p10 / d, p50: st.p50 / d, p90: st.p90 / d };
}

const RealizationCard = ({ title, realization, unit }) => {
    if (!realization || !realization.inputs) return null;
    // Show whichever variables this run actually sampled, in a stable order.
    const order = ['phi', 'sw', 'area', 'thickness', 'owc', 'goc', 'grvFactor', 'fvf', 'bg', 'ntg'];
    const rows = order
        .filter((k) => Number.isFinite(realization.inputs[k]) && REALIZATION_FIELDS[k])
        .map((k) => ({ k, label: REALIZATION_FIELDS[k].label, val: realization.inputs[k].toFixed(REALIZATION_FIELDS[k].digits) }));
    return (
        <div className="bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1 mb-1">{title} Variables</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-slate-300">
                {rows.map((r) => (
                    <div key={r.k} className="flex justify-between"><span>{r.label}:</span> <span className="font-mono">{r.val}</span></div>
                ))}
            </div>
            <div className="pt-1 mt-1 border-t border-slate-800 flex justify-between text-[10px] font-bold text-emerald-400">
                <span>Vol:</span> <span>{(realization.targetVol / 1e6).toFixed(2)} {unit}</span>
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

    const chartData = useMemo(
        () => buildChartData(probResults, inputs.fluidType || 'oil'),
        [probResults, inputs.fluidType],
    );

    if (!probResults || !probResults.stats) {
        return <div className="flex items-center justify-center h-full text-slate-500">Run a simulation to see results.</div>;
    }

    const ft = inputs.fluidType || 'oil';
    const isGas = ft === 'gas';
    
    const stats = isGas ? probResults.stats.giip : probResults.stats.stooip;
    const rawVolumes = isGas ? probResults.raw.giip : probResults.raw.stooip;
    const baseVal = probResults.stats.baseCaseValue;
    
    const unitLabel = isGas ? (state.unitSystem === 'field' ? 'Bscf' : 'MMsm³') : 'MMstb';
    const denom = isGas ? 1e9 : 1e6; 
    
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
                state.currentProjectMeta?.name || state.reservoirName || 'Project',
                probResults,
                state.unitSystem,
                chartImages,
                { template: reportTemplate, fluidType: ft },
            );

            toast({ title: "Success", description: "Report downloaded successfully.", className: "bg-emerald-900 text-white border-emerald-800" });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Export Failed", description: "Could not generate PDF report. " + e.message });
        } finally {
            setIsExporting(false);
        }
    };

    const containerClass = isCompact ? "flex flex-col gap-4 p-2" : "grid grid-cols-1 gap-6 p-4";
    const cardClass = isCompact ? "p-3 bg-slate-900 border-slate-800 min-h-[250px]" : "p-4 bg-slate-900 border-slate-800 min-h-[400px]";

    return (
        <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
             {!isCompact && (
                <div className="flex justify-between items-end p-4 border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white">Probabilistic Simulation Results</h2>
                        <div className="text-xs mt-1 flex items-center gap-3">
                            <span className="text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
                                {rawVolumes.length.toLocaleString()} Iterations
                            </span>
                            {probResults.diagnostics.warnings.length > 0 ? (
                                <span className="text-amber-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Warnings Present</span>
                            ) : (
                                <span className="text-blue-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Fully Validated</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={reportTemplate} onValueChange={setReportTemplate}>
                            <SelectTrigger className="h-9 w-[170px] text-xs bg-slate-900 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {REPORT_TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="default" size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={handleExportPDF} disabled={isExporting}>
                            {isExporting ? <span className="animate-pulse">Exporting...</span> : <><Download className="w-4 h-4" /> Export PDF</>}
                        </Button>
                    </div>
                </div>
             )}

            {!isCompact && probResults.diagnostics.warnings.length > 0 && (
                <div className="mx-4 mt-4 space-y-2">
                    {probResults.diagnostics.warnings.map((w, idx) => (
                        <div key={idx} className="mb-diagnostic-warn flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {w}
                        </div>
                    ))}
                </div>
            )}
            
            {!isCompact && baseVal > 0 && (
                <div className={`mx-4 mt-4 flex items-start gap-2 text-xs rounded-lg border px-3 py-2 ${diffBaseP50 > 40 ? 'border-amber-800/50 bg-amber-950/20 text-amber-300' : 'border-slate-800 bg-slate-900/40 text-slate-400'}`}>
                    <Activity className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        Monte Carlo P50 is {diffBaseP50.toFixed(0)}% {stats.p50 >= baseVal ? 'above' : 'below'} the deterministic base case ({(baseVal / denom).toFixed(2)} {unitLabel}).
                        A gap is expected — the P50 of a product of distributions rarely equals the product of the base-case inputs.
                        {diffBaseP50 > 40 && ' A large gap can indicate off-centre input distributions worth reviewing.'}
                    </span>
                </div>
            )}

            <div className={containerClass}>
                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-4`}>
                    {!isCompact && (
                         <Card className="p-4 bg-slate-900 border-slate-800 text-center shadow-md">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">P90 (Proven)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-white">{(stats.p90 / denom).toFixed(2)}</span>
                                <span className="text-xs text-slate-500">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                    <Card className={`${isCompact ? 'p-3' : 'p-4'} bg-emerald-950/20 border-emerald-500/30 text-center shadow-lg relative overflow-hidden`}>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-400"></div>
                        <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-1">P50 (Probable)</p>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className={`${isCompact ? 'text-3xl' : 'text-4xl'} font-black text-white`}>{(stats.p50 / denom).toFixed(2)}</span>
                            <span className="text-xs text-emerald-400 font-bold">{unitLabel}</span>
                        </div>
                        {isCompact && (
                             <div className="flex justify-between mt-2 pt-2 border-t border-emerald-900/30 text-[10px]">
                                 <div className="text-slate-400">P90: <span className="text-white">{(stats.p90 / denom).toFixed(1)}</span></div>
                                 <div className="text-slate-400">P10: <span className="text-white">{(stats.p10 / denom).toFixed(1)}</span></div>
                             </div>
                        )}
                    </Card>
                    {!isCompact && (
                        <Card className="p-4 bg-slate-900 border-slate-800 text-center shadow-md">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">P10 (Possible)</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-3xl font-bold text-white">{(stats.p10 / denom).toFixed(2)}</span>
                                <span className="text-sm text-slate-500">{unitLabel}</span>
                            </div>
                        </Card>
                    )}
                </div>
                
                {isCompact && (
                    <Button variant="outline" size="sm" className="w-full border-dashed border-slate-700 text-slate-400 hover:text-white" onClick={() => setIsFullViewOpen(true)}>
                        <Expand className="w-3 h-3 mr-2" /> Expand All Charts & Diagnostics
                    </Button>
                )}

                <div className={`grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-6`}>
                    <Card className={`${cardClass} flex flex-col`}>
                        <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                <ZoomIn className="w-3 h-3 text-blue-400" /> Volume Distribution ({unitLabel})
                            </h3>
                        </div>
                        <div ref={histogramRef}>
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
                        <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                <TrendingUp className="w-3 h-3 text-emerald-400" /> Cumulative Probability (Expectation Curve)
                            </h3>
                        </div>
                        <div ref={cdfRef}>
                            <ChartFrame height={isCompact ? 200 : 280}>
                                <LineChart data={chartData.cdf} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
                                    <CartesianGrid {...GRID_STYLE} />
                                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => v.toFixed(0)} />
                                    <YAxis domain={[0, 100]} stroke={CHART_COLORS.axisLine} tick={AXIS_TICK}
                                        tickFormatter={(v) => `${v}%`} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                                        formatter={(v) => [`${v}%`, 'Cumulative']}
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

                <Card className={`${isCompact ? 'p-3' : 'p-4'} bg-slate-900 border-slate-800 flex flex-col`}>
                    <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
                        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                            <Activity className="w-3 h-3 text-purple-400" /> Variance Decomposition (Tornado)
                        </h3>
                    </div>
                    <div ref={tornadoRef}>
                        {chartData.tornado.length > 0 ? (
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
                            <div className="h-24 flex items-center justify-center text-slate-500 text-xs">Add at least one uncertainty variable to see sensitivity.</div>
                        )}
                    </div>
                </Card>

                {!isCompact && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                         <Card className="lg:col-span-3 p-4 bg-slate-900 border-slate-800 flex flex-col">
                            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                                <h3 className="text-sm font-bold text-slate-200">Detailed Statistics</h3>
                            </div>
                            <ProbabilisticSummaryTable />
                         </Card>
                         
                         <Card className="lg:col-span-1 p-4 bg-slate-900 border-slate-800 flex flex-col gap-2">
                            <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">Realization Tracker</h3>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                                <RealizationCard title="P90" realization={probResults.diagnostics.tracking.P90} unit={unitLabel} />
                                <RealizationCard title="P50" realization={probResults.diagnostics.tracking.P50} unit={unitLabel} />
                                <RealizationCard title="P10" realization={probResults.diagnostics.tracking.P10} unit={unitLabel} />
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

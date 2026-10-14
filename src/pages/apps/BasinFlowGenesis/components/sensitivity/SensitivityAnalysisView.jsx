
import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Play, RefreshCw } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { SimulationEngine } from '@/pages/apps/BasinFlowGenesis/services/SimulationEngine';
import { runBasin, RunCancelled } from '@/pages/apps/BasinFlowGenesis/services/runClient';
import { sensitivityOutputs, outputValue, sweepValues, TRAP_PARAMS } from '@/pages/apps/BasinFlowGenesis/services/sensitivity';
import { depthToDisplay, depthFromDisplay } from '@/pages/apps/BasinFlowGenesis/services/units';
import { useToast } from '@/components/ui/use-toast';

const PARAM_DEFAULTS = {
    heatFlow: { min: 40, max: 80, steps: 5 },
    erosion: { min: 0, max: 2000, steps: 5 }, // metres; shown in the display unit
    conductivity: { min: 0.7, max: 1.3, steps: 5 },
    trapAge: { min: 0, max: 20, steps: 5 },
    efficiency: { min: 0.02, max: 0.2, steps: 5 },
};
const fmt = (v, p = 3) => (Number.isFinite(v) ? Number(v.toPrecision(p)).toLocaleString('en-US') : '');

// Build the swept project for one parameter value — every run goes
// through the real SimulationEngine (the pre-G7 tab faked results with
// Math.random).
export const applySweptParameter = (state, parameter, value) => {
    const project = {
        stratigraphy: state.stratigraphy,
        heatFlow: state.heatFlow,
        erosionEvents: state.erosionEvents,
        settings: state.settings,
    };
    if (parameter === 'heatFlow') {
        return { ...project, heatFlow: { type: 'constant', value } };
    }
    if (parameter === 'erosion') {
        const events = (state.erosionEvents?.length > 0)
            ? state.erosionEvents.map((ev, i) => (i === 0 ? { ...ev, amount: value } : ev))
            : [{ age: 10, amount: value }];
        return { ...project, erosionEvents: events };
    }
    if (parameter === 'conductivity') {
        return {
            ...project,
            stratigraphy: state.stratigraphy.map(l => {
                const base = SimulationEngine.resolveThermal(l);
                return { ...l, thermal: { ...base, conductivity: base.conductivity * value } };
            }),
        };
    }
    return project;
};

const SensitivityAnalysisView = () => {
    const { state, units } = useBasinFlow();
    const { toast } = useToast();
    const traps = useMemo(() => (Array.isArray(state.settings?.traps) ? state.settings.traps : []), [state.settings?.traps]);
    const outputs = useMemo(() => sensitivityOutputs(state.stratigraphy || [], traps), [state.stratigraphy, traps]);
    const [parameter, setParameter] = useState('heatFlow');
    const [trapId, setTrapId] = useState('');
    const trap = traps.find((t) => t.id === trapId) || traps[0] || null;
    const isTrapParam = TRAP_PARAMS.includes(parameter);
    const depthU = units?.depth || 'm';
    // the range as typed, in display units (erosion in the display depth unit)
    const shown = (p, r) => (p === 'erosion' ? { ...r, min: Math.round(depthToDisplay(r.min, depthU)), max: Math.round(depthToDisplay(r.max, depthU)) } : r);
    const [range, setRange] = useState(() => shown('heatFlow', PARAM_DEFAULTS.heatFlow));
    const [output, setOutput] = useState('');
    const outKey = outputs.some((o) => o.key === output) ? output : (outputs[0]?.key || 'roMax');
    const [runs, setRuns] = useState(null); // [{x, result, trapOverride?}]
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const abortRef = useRef(null);

    const current = useMemo(() => {
        if (parameter === 'heatFlow') return state.heatFlow?.type === 'constant' ? Number(state.heatFlow.value) : null;
        if (parameter === 'erosion') return state.erosionEvents?.length ? depthToDisplay(Number(state.erosionEvents[0].amount) || 0, depthU) : 0;
        if (parameter === 'conductivity') return 1;
        if (parameter === 'trapAge') return trap ? Number(trap.formedMa) : null;
        if (parameter === 'efficiency') return trap ? Number(trap.efficiency) : null;
        return null;
    }, [parameter, state.heatFlow, state.erosionEvents, trap, depthU]);

    const handleParameterChange = (value) => {
        setParameter(value);
        setRange(shown(value, PARAM_DEFAULTS[value] || PARAM_DEFAULTS.heatFlow));
        setRuns(null);
        if (TRAP_PARAMS.includes(value)) {
            const t = trap; if (t) setOutput(`charge:${t.id}`);
        }
    };

    const handleRun = async () => {
        const values = sweepValues(range.min, range.max, range.steps);
        if (!values.length) return;
        if (isTrapParam) {
            if (!state.results?.data?.timeSteps?.length) { toast({ variant: 'destructive', title: 'Run the model first', description: 'Trap age and efficiency are swept on the current run.' }); return; }
            if (!trap) { toast({ variant: 'destructive', title: 'No trap', description: 'Add a trap on the Analysis tab, Timing.' }); return; }
            setRuns(values.map((x) => ({ x, result: state.results, trapOverride: { id: trap.id, [parameter === 'trapAge' ? 'formedMa' : 'efficiency']: x } })));
            return;
        }
        setIsRunning(true); setProgress(0);
        const ctrl = new AbortController(); abortRef.current = ctrl;
        const out = [];
        try {
            for (let i = 0; i < values.length; i++) {
                const v = parameter === 'erosion' ? depthFromDisplay(values[i], depthU) : values[i];
                const project = applySweptParameter(state, parameter, v);
                const result = await runBasin(project, { signal: ctrl.signal, onProgress: (p) => setProgress(Math.round(((i + p / 100) / values.length) * 100)) });
                out.push({ x: values[i], result });
            }
            setRuns(out);
            toast({ title: 'Sensitivity complete', description: `${values.length} runs of the engine.` });
        } catch (e) {
            if (!(e instanceof RunCancelled)) toast({ variant: 'destructive', title: 'Sensitivity failed', description: e.message });
        } finally {
            setIsRunning(false); abortRef.current = null;
        }
    };

    const rows = useMemo(() => (runs || []).map((r) => ({
        parameter: r.x,
        result: outputValue(r.result, outKey, { stratigraphy: state.stratigraphy || [], traps, trapOverride: r.trapOverride || null }),
    })), [runs, outKey, state.stratigraphy, traps]);
    const outDef = outputs.find((o) => o.key === outKey) || { label: 'Maximum Ro now in the column (%)' };
    const paramLabel = {
        heatFlow: 'Constant heat flow (mW/m²)',
        erosion: `Eroded thickness, first event (${depthU})`,
        conductivity: 'Conductivity scale (times the library)',
        trapAge: `Age ${trap?.name || 'the trap'} formed (Ma)`,
        efficiency: `Migration efficiency, ${trap?.name || 'the trap'}`,
    }[parameter];
    const sel = 'w-full h-8 bg-pl-surface border border-pl-border-strong rounded px-2 text-xs text-pl-text';

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto" data-testid="bf-sens">
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card>
                    <CardHeader><CardTitle className="text-pl-text text-sm">Analysis Config</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-pl-muted" htmlFor="bf-sens-param">Vary</Label>
                            <select id="bf-sens-param" data-testid="bf-sens-param" className={sel} value={parameter} onChange={(e) => handleParameterChange(e.target.value)}>
                                <option value="heatFlow">Heat flow (mW/m²)</option>
                                <option value="erosion">Eroded thickness ({depthU})</option>
                                <option value="conductivity">Conductivity scale</option>
                                {traps.length > 0 && <option value="trapAge">Age a trap formed (Ma)</option>}
                                {traps.length > 0 && <option value="efficiency">Migration efficiency</option>}
                            </select>
                        </div>
                        {isTrapParam && (
                            <div className="space-y-2">
                                <Label className="text-xs text-pl-muted" htmlFor="bf-sens-trap">Trap</Label>
                                <select id="bf-sens-trap" data-testid="bf-sens-trap" className={sel} value={trap?.id || ''} onChange={(e) => { setTrapId(e.target.value); setOutput(`charge:${e.target.value}`); setRuns(null); }}>
                                    {traps.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs text-pl-muted">Min</Label>
                                <Input type="number" step="any" data-testid="bf-sens-min" value={range.min} onChange={e => setRange({...range, min: e.target.value})} className="h-8 text-xs" />
                            </div>
                            <div>
                                <Label className="text-xs text-pl-muted">Max</Label>
                                <Input type="number" step="any" data-testid="bf-sens-max" value={range.max} onChange={e => setRange({...range, max: e.target.value})} className="h-8 text-xs" />
                            </div>
                        </div>
                        <div>
                             <Label className="text-xs text-pl-muted">Steps</Label>
                             <Input type="number" data-testid="bf-sens-steps" value={range.steps} onChange={e => setRange({...range, steps: e.target.value})} className="h-8 text-xs" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-pl-muted" htmlFor="bf-sens-output">Read</Label>
                            <select id="bf-sens-output" data-testid="bf-sens-output" className={sel} value={outKey} onChange={(e) => setOutput(e.target.value)}>
                                {outputs.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                        </div>
                        <Button className="w-full" onClick={handleRun} disabled={isRunning} data-testid="bf-sens-run">
                            {isRunning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            {isRunning ? `Running ${progress} %` : isTrapParam ? 'Sweep on this run' : 'Run Analysis'}
                        </Button>
                        {isRunning && <Button variant="outline" size="sm" className="w-full" data-testid="bf-sens-cancel" onClick={() => abortRef.current?.abort()}>Cancel</Button>}
                        <p className="text-[11px] text-pl-muted">{isTrapParam ? 'Trap age and efficiency do not change the burial or the maturity, so they are swept on the run on screen.' : 'Each value is a full run of the engine with everything else as the model has it. The output can be changed after the runs.'}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="col-span-12 lg:col-span-9 space-y-4">
                 <Card className="bg-white border-slate-300 min-h-[400px]" data-canvas="chart">
                    <CardContent className="p-4 h-[420px] flex flex-col relative">
                        <h3 className="text-center text-sm font-semibold mb-4" style={{ color: CHART_COLORS.axisLabel }} data-testid="bf-sens-title">{outDef.label} against {paramLabel.charAt(0).toLowerCase() + paramLabel.slice(1)}</h3>
                        {runs ? (
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={rows} margin={CHART_MARGINS.standard}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                        <XAxis
                                            dataKey="parameter" type="number" domain={['dataMin', 'dataMax']}
                                            stroke={CHART_COLORS.axisLine}
                                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                            label={{ value: paramLabel, position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                                        />
                                        <YAxis
                                            stroke={CHART_COLORS.axisLine}
                                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                            label={{ value: outDef.unit || 'factor', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                                        />
                                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} formatter={(v) => [fmt(v), outDef.label]} />
                                        {Number.isFinite(current) && <ReferenceLine x={current} stroke="#dc2626" strokeDasharray="4 3" label={{ value: 'model', position: 'top', fill: '#dc2626', fontSize: 11 }} />}
                                        <Line type="monotone" dataKey="result" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name={outDef.label} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-500">
                                <p>Run analysis to see sensitivity plot.</p>
                            </div>
                        )}
                        <ChartLogo />
                    </CardContent>
                 </Card>
                 {runs && (
                    <table className="w-full text-xs text-pl-text bg-pl-surface rounded border border-pl-border" data-testid="bf-sens-table">
                        <thead><tr className="text-left text-pl-muted"><th className="font-normal p-1.5">{paramLabel}</th><th className="font-normal p-1.5 text-right">{outDef.label}</th></tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-t border-pl-border" data-testid={`bf-sens-row-${i}`}>
                                    <td className="p-1.5 font-mono">{fmt(r.parameter, 4)}</td>
                                    <td className="p-1.5 font-mono text-right">{fmt(r.result)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 )}
            </div>
        </div>
    );
};

export default SensitivityAnalysisView;

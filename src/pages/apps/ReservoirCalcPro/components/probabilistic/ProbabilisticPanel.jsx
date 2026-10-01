import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, ChevronLeft, PlayCircle, Loader2, RotateCcw, AlertTriangle, FileText } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import NumberField from '../common/NumberField';
import { useToast } from '@/components/ui/use-toast';
import { distScaleFactor } from '../../services/unitsCatalog';
import {
    distKeysFor, syncDistParams, recentreDist, formatDistributions, centralOf,
} from '../../services/distributions';
import CorrelationEditor, { correlationsProblem } from './CorrelationEditor';

const DIST_TYPES = [
    { value: 'triangular', label: 'Triangular' },
    { value: 'normal', label: 'Normal' },
    { value: 'lognormal', label: 'Lognormal' },
    { value: 'uniform', label: 'Uniform' },
];


const Num = ({ labelText, value, onChange, invalid }) => (
    <div className="flex-1">
        <span className="text-[9px] text-pl-muted block text-center mb-0.5">{labelText}</span>
        <NumberField className={`h-7 text-xs text-center ${invalid ? 'border-pl-danger text-pl-danger-text' : ''}`}
            value={value} onCommit={(v) => onChange(v ?? 0)} emptyValue={0} />
    </div>
);

const DistInput = ({ label, value, baseValue, onChange, consistencyMode, paramKey }) => {
    if (!value) return null;
    const type = value.type || 'triangular';
    const central = centralOf(value);
    const diffPercent = baseValue ? Math.abs((central - baseValue) / baseValue) * 100 : 0;
    const isDeviation = consistencyMode && diffPercent > 5;

    const set = (patch) => onChange({ ...value, ...patch });

    return (
        <div className="space-y-1.5 p-2 bg-pl-sunken rounded border border-pl-border">
            <div className="flex justify-between items-center">
                <Label className="text-[11px] font-bold text-pl-text">{label}</Label>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-pl-muted">Base: {Number(baseValue).toFixed(4)}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-pl-muted hover:text-pl-text"
                        title="Revert central value to deterministic base case"
                        onClick={() => set(type === 'uniform'
                            ? { min: baseValue * 0.8, max: baseValue * 1.2 }
                            : (type === 'triangular' ? { p50: baseValue } : { mean: baseValue }))}>
                        <RotateCcw className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <Select value={type} onValueChange={(t) => set({ type: t })}>
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {DIST_TYPES.map((d) => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
                </SelectContent>
            </Select>

            {type === 'triangular' && (
                <div className="flex gap-2">
                    <Num labelText="Min" value={value.p90} onChange={(v) => set({ p90: v })} />
                    <Num labelText="Most likely" value={value.p50} onChange={(v) => set({ p50: v })} invalid={isDeviation} />
                    <Num labelText="Max" value={value.p10} onChange={(v) => set({ p10: v })} />
                </div>
            )}
            {(type === 'normal' || type === 'lognormal') && (
                <div className="flex gap-2">
                    <Num labelText="Mean" value={value.mean} onChange={(v) => set({ mean: v })} invalid={isDeviation} />
                    <Num labelText="Std Dev" value={value.stdDev} onChange={(v) => set({ stdDev: v })} />
                </div>
            )}
            {type === 'uniform' && (
                <div className="flex gap-2">
                    <Num labelText="Min" value={value.min} onChange={(v) => set({ min: v })} />
                    <Num labelText="Max" value={value.max} onChange={(v) => set({ max: v })} />
                </div>
            )}

            {isDeviation && (
                <div className="text-[9px] text-pl-danger-text flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Central value deviates &gt;5% from base case.
                </div>
            )}
        </div>
    );
};

const ProbabilisticPanel = () => {
    const { state, calculate, mcProgress, cancelSimulation } = useReservoirCalc();
    const { toast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [consistencyMode, setConsistencyMode] = useState(true);
    const [iterations, setIterations] = useState(10000);
    // U2-006: the run is in a background worker, so 100k and 250k no
    // longer freeze the page
    const ITERATION_OPTIONS = [1000, 5000, 10000, 50000, 100000, 250000];
    const [seedText, setSeedText] = useState('');
    // U2-002: the correlation pairs the engine applies (starts from the
    // long-standing porosity-Sw -0.8)
    const [correlations, setCorrelations] = useState([{ a: 'porosity', b: 'sw', rho: -0.8 }]);

    const fluidType = state.inputs.fluidType || 'oil';
    // the headline stream: gas for a gas reservoir, the oil leg otherwise
    const isGas = fluidType === 'gas';

    const base = state.baseCase?.inputs || state.inputs;

    // Structural input methods integrate GRV from the surface against sampled contacts,
    // so the geometric uncertainty is the CONTACT depths (+ a GRV factor) rather than
    // free area/thickness marginals.
    const structural = state.inputMethod === 'hybrid' || state.inputMethod === 'surfaces' || state.inputMethod === 'areadepth';
    const len = state.unitSystem === 'field' ? 'ft' : 'm';
    const distLabel = (key) => ({
        porosity: 'Porosity (fraction)',
        sw: 'Water Saturation (fraction)',
        ntg: 'Net-to-Gross (fraction)',
        thickness: `Gross Thickness (${len})`,
        area: `Area (${state.unitSystem === 'field' ? 'acres' : 'km²'})`,
        goc: `Gas-Oil Contact (GOC, ${len})`,
        owc: fluidType === 'gas' ? `Gas-Water Contact (GWC, ${len})` : `Oil-Water Contact (OWC, ${len})`,
        grvFactor: 'GRV Factor (structural uncertainty)',
        fvf: `Oil FVF (${state.unitSystem === 'field' ? 'rb/stb' : 'rm³/sm³'})`,
        bg: `Gas FVF (Bg, ${state.unitSystem === 'field' ? 'rcf/scf' : 'rm³/sm³'})`,
        gasCapFraction: 'Gas Cap Fraction of GRV',
        recovery: 'Oil Recovery Factor (%)',
        recoveryGas: 'Gas Recovery Factor (%)',
    }[key] || key);
    const corrProblem = correlationsProblem(correlations, distLabel);

    // U1 (RCP-U1-008): the keys follow the input method and fluid while
    // the panel is open, the whole distribution moves with a new base
    // case, and a malformed distribution stops the run with the reason.
    const distKeys = distKeysFor({ structural, fluidType, inputMethod: state.inputMethod });
    const distKeysSig = distKeys.join(',');
    const [distParams, setDistParams] = useState(() => syncDistParams({}, distKeys, base, state.unitSystem));
    useEffect(() => {
        setDistParams((prev) => syncDistParams(prev, distKeys, base, state.unitSystem));
    }, [distKeysSig]); // eslint-disable-line react-hooks/exhaustive-deps
    const [problems, setProblems] = useState([]);

    // Rescale the geometric distributions when the Field/Metric system toggles,
    // mirroring the canonical-input conversion in the context reducer (area
    // acre↔km², thickness/contacts ft↔m). Fractions and FVFs scale by 1.
    const prevSystem = useRef(state.unitSystem);
    useEffect(() => {
        const from = prevSystem.current;
        const to = state.unitSystem;
        if (from === to) return;
        prevSystem.current = to;
        setDistParams(prev => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
                const f = distScaleFactor(key, from, to);
                if (f === 1 || !next[key]) continue;
                const d = { ...next[key] };
                for (const p of ['p90', 'p50', 'p10', 'mean', 'stdDev', 'min', 'max']) {
                    if (typeof d[p] === 'number' && isFinite(d[p])) d[p] = d[p] * f;
                }
                next[key] = d;
            }
            return next;
        });
    }, [state.unitSystem]);

    // Consistency mode: move each distribution onto the deterministic base,
    // keeping its shape (a shift for contacts, a ratio otherwise)
    useEffect(() => {
        if (consistencyMode && state.baseCase) {
            setDistParams(prev => {
                const next = { ...prev };
                for (const key in next) {
                    const b = state.baseCase.inputs[key];
                    if (b !== undefined && b !== null && key !== 'grvFactor') next[key] = recentreDist(next[key], b, key);
                }
                return next;
            });
        }
    }, [state.baseCase, consistencyMode]);

    const steps = [
        { id: 'inputs', title: 'Distributions' },
        { id: 'settings', title: 'Settings' },
        { id: 'simulate', title: 'Simulation' }
    ];

    const handleParamChange = (key, val) => {
        setDistParams(prev => ({ ...prev, [key]: val }));
    };

    const runSimulation = async () => {
        if (state.isCalculating) return;

        try {
            let hasDeviation = false;
            for (const key of distKeys) {
                const val = distParams[key];
                const b = base[key];
                if (!val || !consistencyMode || !b || key === 'grvFactor') continue;
                const diff = Math.abs((centralOf(val) - b) / b) * 100;
                if (diff > 5) hasDeviation = true;
            }
            const { formatted, problems: bad } = formatDistributions(distParams, distKeys);
            setProblems(bad);
            if (bad.length) {
                toast({ variant: "destructive", title: "Check the distributions", description: bad[0] });
                return;
            }

            if (consistencyMode && hasDeviation) {
                // Advisory only: a deliberately shifted distribution is legitimate, and the
                // MC output P50 need not match the deterministic base — so we proceed.
                toast({ title: "Heads up", description: "Some input central values differ >5% from the deterministic base case. Running anyway." });
            }

            const seedNum = seedText.trim() === '' ? undefined : Number(seedText);
            if (seedNum !== undefined && !(Number.isInteger(seedNum) && seedNum >= 0)) {
                toast({ variant: "destructive", title: "Check the seed", description: 'The seed is a whole number of 0 or more, or empty for a new seed each run.' });
                return;
            }
            if (corrProblem) {
                toast({ variant: "destructive", title: "Check the correlations", description: corrProblem });
                return;
            }
            const out = await calculate(formatted, { consistencyMode, iterations, seed: seedNum, correlations: correlations.map(({ a, b, rho }) => ({ a, b, rho: Number(rho) })) });
            if (out?.cancelled) {
                toast({ title: "Run cancelled", description: 'The previous results were kept.' });
                return;
            }
            if (out?.ok) toast({ title: "Simulation Complete", description: `${iterations.toLocaleString()} iterations run.` });
        } catch (err) {
            toast({ variant: "destructive", title: "Simulation Failed", description: err.message });
        }
    };

    const activeStep = steps[currentStep];
    const baseVol = isGas ? state.baseCase?.results?.giip : state.baseCase?.results?.stooip;
    const baseUnit = isGas ? (state.unitSystem === 'field' ? 'scf' : 'sm³') : (state.unitSystem === 'field' ? 'STB' : 'sm³');
    const displayVol = baseVol ? (baseVol / 1e6).toFixed(2) + ' MM' : 'N/A';

    return (
        <div className="flex flex-col h-full bg-pl-surface overflow-hidden">
            <div className="p-3 border-b border-pl-border bg-pl-sunken flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-pl-text">Probabilistic Analysis</h3>
                    <div className="flex gap-1">
                        {steps.map((s, i) => (
                            <div key={s.id} className={`h-1.5 w-6 rounded-full transition-colors ${i === currentStep ? 'bg-pl-primary' : i < currentStep ? 'bg-pl-primary/40' : 'bg-pl-border'}`} />
                        ))}
                    </div>
                </div>
                {state.baseCase && (
                    <div className="flex items-center justify-between bg-pl-surface border border-pl-border p-2 rounded">
                        <span className="text-[10px] text-pl-muted">Linked Deterministic Base Volume:</span>
                        <span className="text-xs font-mono font-bold text-pl-text">{displayVol} {baseUnit}</span>
                    </div>
                )}
            </div>

            <div className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 space-y-3">
                <div className="mb-2">
                    <h4 className="text-sm font-medium text-pl-text">{activeStep.title}</h4>
                </div>

                {currentStep === 0 && (
                    <div className="space-y-3" data-testid="rcp-mc-dists">
                        {structural && (
                            <div className="text-[10px] text-pl-info-text bg-pl-info-bg border border-pl-info/40 rounded px-2 py-1">
                                GRV is integrated from the {state.inputMethod === 'areadepth' ? 'area/depth table' : 'top surface'} against the sampled contacts below ({state.unitSystem === 'field' ? 'ft' : 'm'}, TVDSS elevation, negative below the datum).
                            </div>
                        )}
                        {distKeys.map((key) => (
                            <DistInput key={key} paramKey={key} label={distLabel(key)} value={distParams[key]}
                                baseValue={key === 'grvFactor' ? 1 : base[key]}
                                onChange={v => handleParamChange(key, v)}
                                consistencyMode={key === 'grvFactor' ? false : consistencyMode} />
                        ))}
                        {problems.length > 0 && (
                            <ul className="text-[10px] text-pl-danger-text list-disc pl-4" data-testid="rcp-mc-problems">
                                {problems.map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-pl-sunken rounded border border-pl-border">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-bold text-pl-text">Base-Case Consistency Mode</Label>
                                <p className="text-[10px] text-pl-muted">Recenter distribution P50s on the deterministic base case and flag large drift (advisory only; it does not block a run).</p>
                            </div>
                            <Switch checked={consistencyMode} onCheckedChange={setConsistencyMode} />
                        </div>
                        <div className="p-3 bg-pl-sunken rounded border border-pl-border space-y-2">
                            <Label className="text-xs font-bold text-pl-text">Monte Carlo Iterations</Label>
                            <div className="flex gap-1.5">
                                {ITERATION_OPTIONS.map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setIterations(n)}
                                        aria-pressed={iterations === n}
                                        className={`flex-1 py-1.5 rounded text-[11px] border transition-colors ${iterations === n ? 'bg-pl-primary border-pl-primary text-pl-primary-fg' : 'bg-pl-surface border-pl-border text-pl-muted hover:text-pl-text'}`}
                                    >
                                        {n >= 1000 ? `${n / 1000}k` : n}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-pl-muted">More iterations give smoother tails (P90/P10). The run is in the background with progress and Cancel.</p>
                            <Label className="text-[10px] text-pl-muted" htmlFor="rcp-mc-seed">Random seed (empty: a new seed each run)</Label>
                            <input id="rcp-mc-seed" data-testid="rcp-mc-seed" inputMode="numeric" value={seedText}
                                onChange={(e) => setSeedText(e.target.value)}
                                className="h-7 w-full rounded border border-pl-border bg-pl-surface px-2 text-xs text-pl-text" />
                            <p className="text-[10px] text-pl-muted">Every run records its seed. The same inputs and seed give the same realizations.</p>
                        </div>
                        <CorrelationEditor keys={distKeys} labelOf={distLabel} value={correlations} onChange={setCorrelations} problem={corrProblem} />
                        <div className="p-3 bg-pl-sunken rounded border border-pl-border space-y-2">
                            <Label className="text-xs font-bold text-pl-text flex items-center gap-1"><FileText className="w-3 h-3"/> Active Engine Features</Label>
                            <ul className="text-[10px] text-pl-muted list-disc pl-4 space-y-1">
                                <li>Cholesky Decomposition for correlated sampling</li>
                                <li>Correlations from the table above (a matrix that cannot hold is refused)</li>
                                <li>Strict out-of-bounds rejection logging</li>
                                <li>Variance decomposition (Tornado charting)</li>
                                <li>Detailed P-value realization tracking</li>
                            </ul>
                        </div>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="flex flex-col items-center justify-center py-6 space-y-4">
                        <div className={`p-4 rounded-full bg-pl-sunken ${state.isCalculating ? 'animate-pulse' : ''}`}>
                            {state.isCalculating ? <Loader2 className="w-12 h-12 text-pl-primary-text animate-spin" /> : <PlayCircle className="w-12 h-12 text-pl-muted" />}
                        </div>
                        <div className="text-center">
                            <h5 className="text-sm font-medium text-pl-text">{state.isCalculating ? 'Simulating...' : 'Ready to Simulate'}</h5>
                            <p className="text-[10px] text-pl-muted mt-1">{iterations.toLocaleString()} Iterations • Correlated Variables • Rejection Handled</p>
                        </div>
                        {state.isCalculating && mcProgress !== null && (
                            <div className="w-full space-y-1" data-testid="rcp-mc-progress">
                                <div className="h-2 w-full rounded bg-pl-sunken border border-pl-border overflow-hidden">
                                    <div className="h-full bg-pl-primary transition-[width]" style={{ width: `${Math.round((mcProgress || 0) * 100)}%` }} />
                                </div>
                                <p className="text-[10px] text-pl-muted text-center">{Math.round((mcProgress || 0) * 100)}% of {iterations.toLocaleString()} realizations</p>
                            </div>
                        )}
                        {corrProblem && <p className="text-[10px] text-pl-danger-text" data-testid="rcp-corr-block">Run is blocked: {corrProblem}</p>}
                        <Button className="w-full" data-testid="rcp-mc-run" onClick={runSimulation} disabled={state.isCalculating || !!corrProblem}>
                            {state.isCalculating ? "Processing..." : "Run Monte Carlo"}
                        </Button>
                        {state.isCalculating && (
                            <Button variant="outline" className="w-full" data-testid="rcp-mc-cancel" onClick={cancelSimulation}>
                                Cancel run
                            </Button>
                        )}
                        {state.probResults?.meta?.seed !== undefined && state.probResults?.meta?.seed !== null && !state.isCalculating && (
                            <p className="text-[10px] text-pl-muted" data-testid="rcp-mc-last-seed">Last run: seed {state.probResults.meta.seed}{state.probResults.meta.ranIn === 'worker' ? ', background worker' : ''}</p>
                        )}
                    </div>
                )}
            </div>

            <div className="p-2 border-t border-pl-border bg-pl-sunken flex justify-between flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(p => p - 1)} disabled={currentStep === 0 || state.isCalculating} className="text-[10px] h-7">
                    <ChevronLeft className="w-3 h-3 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={() => setCurrentStep(p => p + 1)} disabled={currentStep === steps.length - 1 || state.isCalculating} className={`text-[10px] h-7 ${currentStep === steps.length - 1 ? 'opacity-0' : ''}`}>
                    Next <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
            </div>
        </div>
    );
};

export default ProbabilisticPanel;
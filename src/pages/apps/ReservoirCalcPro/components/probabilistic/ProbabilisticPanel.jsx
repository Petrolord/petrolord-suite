import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, ChevronLeft, PlayCircle, Loader2, RotateCcw, AlertTriangle, FileText } from 'lucide-react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { useToast } from '@/components/ui/use-toast';

const DIST_TYPES = [
    { value: 'triangular', label: 'Triangular' },
    { value: 'normal', label: 'Normal' },
    { value: 'lognormal', label: 'Lognormal' },
    { value: 'uniform', label: 'Uniform' },
];

// The distribution's central value, used for base-case consistency checks.
const centralValue = (v) => {
    if (v.type === 'uniform') return (Number(v.min) + Number(v.max)) / 2;
    if (v.type === 'normal' || v.type === 'lognormal') return Number(v.mean);
    return Number(v.p50);
};

const Num = ({ labelText, value, onChange, invalid }) => (
    <div className="flex-1">
        <span className="text-[9px] text-slate-500 block text-center mb-0.5">{labelText}</span>
        <Input type="number" className={`h-7 text-xs bg-slate-900 text-center ${invalid ? 'border-red-500 text-red-400' : 'border-slate-700'}`}
            value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
);

const DistInput = ({ label, value, baseValue, onChange, consistencyMode }) => {
    const type = value.type || 'triangular';
    const central = centralValue(value);
    const diffPercent = baseValue ? Math.abs((central - baseValue) / baseValue) * 100 : 0;
    const isDeviation = consistencyMode && diffPercent > 5;

    const set = (patch) => onChange({ ...value, ...patch });

    return (
        <div className="space-y-1.5 p-2 bg-slate-950 rounded border border-slate-800">
            <div className="flex justify-between items-center">
                <Label className="text-[11px] font-bold text-slate-300">{label}</Label>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-500">Base: {Number(baseValue).toFixed(4)}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-blue-400"
                        title="Revert central value to deterministic base case"
                        onClick={() => set(type === 'uniform'
                            ? { min: baseValue * 0.8, max: baseValue * 1.2 }
                            : (type === 'triangular' ? { p50: baseValue } : { mean: baseValue }))}>
                        <RotateCcw className="w-3 h-3" />
                    </Button>
                </div>
            </div>

            <Select value={type} onValueChange={(t) => set({ type: t })}>
                <SelectTrigger className="h-6 text-[10px] bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {DIST_TYPES.map((d) => <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>)}
                </SelectContent>
            </Select>

            {type === 'triangular' && (
                <div className="flex gap-2">
                    <Num labelText="P90 (Min)" value={value.p90} onChange={(v) => set({ p90: v })} />
                    <Num labelText="P50 (Mode)" value={value.p50} onChange={(v) => set({ p50: v })} invalid={isDeviation} />
                    <Num labelText="P10 (Max)" value={value.p10} onChange={(v) => set({ p10: v })} />
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
                <div className="text-[9px] text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Central value deviates &gt;5% from base case.
                </div>
            )}
        </div>
    );
};

const ProbabilisticPanel = () => {
    const { state, calculate } = useReservoirCalc();
    const { toast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [consistencyMode, setConsistencyMode] = useState(true);
    const [iterations, setIterations] = useState(10000);
    const ITERATION_OPTIONS = [1000, 5000, 10000, 50000];

    const fluidType = state.inputs.fluidType || 'oil';
    const isGas = fluidType === 'gas' || fluidType === 'oil_gas';
    const isOil = fluidType === 'oil' || fluidType === 'oil_gas';

    const base = state.baseCase?.inputs || state.inputs;

    const generateDefaultDist = (val) => ({
        type: 'triangular',
        p90: val * 0.8, p50: val, p10: val * 1.2,     // triangular
        mean: val, stdDev: val * 0.1,                 // normal / lognormal
        min: val * 0.8, max: val * 1.2               // uniform
    });

    const [distParams, setDistParams] = useState({
        porosity: generateDefaultDist(base.porosity || 0.20),
        sw: generateDefaultDist(base.sw || 0.30),
        thickness: generateDefaultDist(base.thickness || 50),
        area: generateDefaultDist(base.area || 1000),
        ...(isOil ? { fvf: generateDefaultDist(base.fvf || 1.2) } : {}),
        ...(isGas ? { bg: generateDefaultDist(base.bg || 0.005) } : {})
    });

    // Auto-update P50 when deterministic baseline changes and consistency mode is ON
    useEffect(() => {
        if (consistencyMode && state.baseCase) {
            setDistParams(prev => {
                const next = { ...prev };
                for (let key in next) {
                    const base = state.baseCase.inputs[key];
                    if (base !== undefined) {
                        // Recentre whichever fields drive the active distribution's centre.
                        next[key] = { ...next[key], p50: base, mean: base };
                    }
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
            const formatted = {};
            let hasDeviation = false;

            for (const [key, val] of Object.entries(distParams)) {
                const central = val.type === 'uniform' ? (val.min + val.max) / 2
                    : (val.type === 'triangular' ? val.p50 : val.mean);
                if (consistencyMode && base[key]) {
                    const diff = Math.abs((central - base[key]) / base[key]) * 100;
                    if (diff > 5) hasDeviation = true;
                }

                if (val.type === 'uniform') {
                    formatted[key] = { type: 'uniform', min: Math.min(val.min, val.max), max: Math.max(val.min, val.max) };
                } else if (val.type === 'normal' || val.type === 'lognormal') {
                    formatted[key] = { type: val.type, mean: val.mean, stdDev: val.stdDev };
                } else {
                    const min = Math.min(val.p90, val.p10);
                    const max = Math.max(val.p90, val.p10);
                    formatted[key] = { type: 'triangular', min, mode: val.p50, max };
                }
            }

            if (consistencyMode && hasDeviation) {
                toast({ variant: "destructive", title: "Consistency Error", description: "One or more P50 values deviate >5% from the deterministic base case. Turn off Consistency Mode to proceed." });
                return;
            }

            formatted.ntg = { type: 'constant', value: base.ntg || 1.0 };
            
            await calculate(formatted, { consistencyMode, iterations });

            toast({ title: "Simulation Complete", description: `${iterations.toLocaleString()} iterations run.` });
        } catch (err) {
            toast({ variant: "destructive", title: "Simulation Failed", description: err.message });
        }
    };

    const activeStep = steps[currentStep];
    const baseVol = isGas ? state.baseCase?.results?.giip : state.baseCase?.results?.stooip;
    const baseUnit = isGas ? (state.unitSystem === 'field' ? 'scf' : 'sm³') : (state.unitSystem === 'field' ? 'STB' : 'sm³');
    const displayVol = baseVol ? (baseVol / 1e6).toFixed(2) + ' MM' : 'N/A';

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
            <div className="p-3 border-b border-slate-800 bg-slate-950/50 flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Probabilistic Analysis</h3>
                    <div className="flex gap-1">
                        {steps.map((s, i) => (
                            <div key={s.id} className={`h-1.5 w-6 rounded-full transition-colors ${i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-blue-900' : 'bg-slate-800'}`} />
                        ))}
                    </div>
                </div>
                {state.baseCase && (
                    <div className="flex items-center justify-between bg-blue-950/30 border border-blue-900/50 p-2 rounded">
                        <span className="text-[10px] text-blue-200">Linked Deterministic Base Volume:</span>
                        <span className="text-xs font-mono font-bold text-white">{displayVol} {baseUnit}</span>
                    </div>
                )}
            </div>

            <div className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 space-y-3">
                <div className="mb-2">
                    <h4 className="text-sm font-medium text-slate-200">{activeStep.title}</h4>
                </div>

                {currentStep === 0 && (
                    <div className="space-y-3">
                        <DistInput label="Porosity (fraction)" paramKey="porosity" value={distParams.porosity} baseValue={base.porosity} onChange={v => handleParamChange('porosity', v)} consistencyMode={consistencyMode} />
                        <DistInput label="Water Saturation (fraction)" paramKey="sw" value={distParams.sw} baseValue={base.sw} onChange={v => handleParamChange('sw', v)} consistencyMode={consistencyMode} />
                        <DistInput label={`Gross Thickness (${state.unitSystem === 'field' ? 'ft' : 'm'})`} paramKey="thickness" value={distParams.thickness} baseValue={base.thickness} onChange={v => handleParamChange('thickness', v)} consistencyMode={consistencyMode} />
                        <DistInput label={`Area (${state.unitSystem === 'field' ? 'acres' : 'km²'})`} paramKey="area" value={distParams.area} baseValue={base.area} onChange={v => handleParamChange('area', v)} consistencyMode={consistencyMode} />
                        {isOil && <DistInput label="Oil FVF (rb/stb)" paramKey="fvf" value={distParams.fvf} baseValue={base.fvf} onChange={v => handleParamChange('fvf', v)} consistencyMode={consistencyMode} />}
                        {isGas && <DistInput label="Gas FVF (Bg)" paramKey="bg" value={distParams.bg} baseValue={base.bg} onChange={v => handleParamChange('bg', v)} consistencyMode={consistencyMode} />}
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-slate-950 rounded border border-slate-800">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-bold text-white">Base-Case Consistency Mode</Label>
                                <p className="text-[10px] text-slate-400">Strictly enforce P50 within 5% of deterministic base parameters.</p>
                            </div>
                            <Switch checked={consistencyMode} onCheckedChange={setConsistencyMode} />
                        </div>
                        <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-2">
                            <Label className="text-xs font-bold text-white">Monte Carlo Iterations</Label>
                            <div className="flex gap-1.5">
                                {ITERATION_OPTIONS.map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setIterations(n)}
                                        className={`flex-1 py-1.5 rounded text-[11px] border transition-colors ${iterations === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                                    >
                                        {n >= 1000 ? `${n / 1000}k` : n}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-500">More iterations = smoother tails (P90/P10) at the cost of runtime.</p>
                        </div>
                        <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-2">
                            <Label className="text-xs font-bold text-white flex items-center gap-1"><FileText className="w-3 h-3"/> Active Engine Features</Label>
                            <ul className="text-[10px] text-slate-400 list-disc pl-4 space-y-1">
                                <li>Cholesky Decomposition for correlated sampling</li>
                                <li>Automatic Porosity-Sw negative correlation (-0.8)</li>
                                <li>Strict out-of-bounds rejection logging</li>
                                <li>Variance decomposition (Tornado charting)</li>
                                <li>Detailed P-value realization tracking</li>
                            </ul>
                        </div>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="flex flex-col items-center justify-center py-6 space-y-4">
                        <div className={`p-4 rounded-full bg-emerald-900/20 ${state.isCalculating ? 'animate-pulse' : ''}`}>
                            {state.isCalculating ? <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" /> : <PlayCircle className="w-12 h-12 text-emerald-500" />}
                        </div>
                        <div className="text-center">
                            <h5 className="text-sm font-medium text-white">{state.isCalculating ? 'Simulating...' : 'Ready to Simulate'}</h5>
                            <p className="text-[10px] text-slate-500 mt-1">{iterations.toLocaleString()} Iterations • Correlated Variables • Rejection Handled</p>
                        </div>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white w-full" onClick={runSimulation} disabled={state.isCalculating}>
                            {state.isCalculating ? "Processing..." : "Run Monte Carlo"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="p-2 border-t border-slate-800 bg-slate-950/50 flex justify-between flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(p => p - 1)} disabled={currentStep === 0 || state.isCalculating} className="text-[10px] h-7">
                    <ChevronLeft className="w-3 h-3 mr-1" /> Back
                </Button>
                <Button size="sm" onClick={() => setCurrentStep(p => p + 1)} disabled={currentStep === steps.length - 1 || state.isCalculating} className={`text-[10px] h-7 ${currentStep === steps.length - 1 ? 'opacity-0' : 'bg-blue-600'}`}>
                    Next <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
            </div>
        </div>
    );
};

export default ProbabilisticPanel;
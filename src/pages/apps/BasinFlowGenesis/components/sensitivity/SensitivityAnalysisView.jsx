
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, RefreshCw } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { SimulationEngine } from '@/pages/apps/BasinFlowGenesis/services/SimulationEngine';
import { finalDepthProfile } from '@/pages/apps/BasinFlowGenesis/services/resultsView';
import { JobScheduler } from '@/pages/apps/BasinFlowGenesis/services/JobScheduler';
import { useToast } from '@/components/ui/use-toast';

const PARAM_DEFAULTS = {
    heatFlow: { min: 40, max: 80, steps: 5 },
    erosion: { min: 0, max: 2000, steps: 5 },
    conductivity: { min: 0.7, max: 1.3, steps: 5 },
};

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
    const { state } = useBasinFlow();
    const { toast } = useToast();

    const [parameter, setParameter] = useState('heatFlow');
    const [range, setRange] = useState(PARAM_DEFAULTS.heatFlow);
    const [results, setResults] = useState(null);
    const [isRunning, setIsRunning] = useState(false);

    const handleParameterChange = (value) => {
        setParameter(value);
        setRange(PARAM_DEFAULTS[value] || PARAM_DEFAULTS.heatFlow);
        setResults(null);
    };

    const handleRun = async () => {
        setIsRunning(true);
        toast({ title: "Sensitivity Analysis Started", description: `Running ${range.steps} simulations...` });

        const stepSize = (range.max - range.min) / (range.steps - 1);
        const values = Array.from({length: range.steps}, (_, i) => range.min + (i * stepSize));

        try {
            const processor = async (payload, updateProgress) => {
                const runResults = [];
                for (let i = 0; i < payload.values.length; i++) {
                    const val = payload.values[i];
                    const project = applySweptParameter(state, payload.parameter, val);
                    const simResult = await SimulationEngine.run(project);
                    const profile = finalDepthProfile(simResult);
                    const maxRo = profile.length > 0 ? Math.max(...profile.map(p => p.ro)) : 0;
                    runResults.push({ parameter: val, result: maxRo });
                    updateProgress(Math.round(((i + 1) / payload.values.length) * 100));
                }
                return runResults;
            };

            const jobId = await JobScheduler.addJob('sensitivity', { values, parameter }, processor);

            const checkJob = setInterval(() => {
                const job = JobScheduler.getJob(jobId);
                if (job.status === 'completed') {
                    clearInterval(checkJob);
                    setResults(job.result);
                    setIsRunning(false);
                    toast({ title: "Analysis Complete", description: "Results ready for viewing." });
                } else if (job.status === 'failed') {
                    clearInterval(checkJob);
                    setIsRunning(false);
                    toast({ variant: "destructive", title: "Analysis Failed", description: job.error });
                }
            }, 300);

        } catch (e) {
            setIsRunning(false);
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };

    const paramLabel = {
        heatFlow: 'Constant Heat Flow (mW/m²)',
        erosion: 'Erosion Amount (m)',
        conductivity: 'Thermal Conductivity Scale',
    }[parameter];

    return (
        <div className="h-full grid grid-cols-12 gap-4 p-4 overflow-y-auto">
            <div className="col-span-12 lg:col-span-3 space-y-4">
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader><CardTitle className="text-white text-sm">Analysis Config</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-400">Target Parameter</Label>
                            <Select value={parameter} onValueChange={handleParameterChange}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="heatFlow">Heat Flow (mW/m²)</SelectItem>
                                    <SelectItem value="erosion">Erosion Amount (m)</SelectItem>
                                    <SelectItem value="conductivity">Thermal Cond. Scale</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs text-slate-400">Min</Label>
                                <Input type="number" value={range.min} onChange={e => setRange({...range, min: +e.target.value})} className="bg-slate-950 border-slate-800 h-8 text-xs" />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-400">Max</Label>
                                <Input type="number" value={range.max} onChange={e => setRange({...range, max: +e.target.value})} className="bg-slate-950 border-slate-800 h-8 text-xs" />
                            </div>
                        </div>

                        <div>
                             <Label className="text-xs text-slate-400">Steps</Label>
                             <Input type="number" value={range.steps} onChange={e => setRange({...range, steps: Math.max(2, +e.target.value)})} className="bg-slate-950 border-slate-800 h-8 text-xs" />
                        </div>

                        <Button
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={handleRun}
                            disabled={isRunning}
                        >
                            {isRunning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                            {isRunning ? 'Running...' : 'Run Analysis'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="col-span-12 lg:col-span-9">
                 <Card className="bg-white border-slate-300 h-full min-h-[400px]">
                    <CardContent className="p-4 h-full flex flex-col relative">
                        <h3 className="text-center text-sm font-semibold mb-4" style={{ color: CHART_COLORS.axisLabel }}>Parameter Sensitivity: Max Final %Ro</h3>
                        {results ? (
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={results} margin={CHART_MARGINS.standard}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                        <XAxis
                                            dataKey="parameter"
                                            stroke={CHART_COLORS.axisLine}
                                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                            label={{ value: paramLabel, position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                                        />
                                        <YAxis
                                            stroke={CHART_COLORS.axisLine}
                                            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                                            label={{ value: 'Max %Ro', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                                        />
                                        <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
                                        <Line type="monotone" dataKey="result" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} name="Max Ro" />
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
            </div>
        </div>
    );
};

export default SensitivityAnalysisView;

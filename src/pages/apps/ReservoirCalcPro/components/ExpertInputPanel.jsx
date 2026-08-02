import React, { useState, useEffect } from 'react';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Calculator, ScanLine, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import FluidTypeSelector from './tools/FluidTypeSelector';
import FluidContactManager from './tools/FluidContactManager';
import MapGenerationPanel from './tools/MapGenerationPanel';
import SurfaceDataManager from './tools/SurfaceDataManager';
import AOIPanel from './AOIPanel';
import ProbabilisticPanel from './probabilistic/ProbabilisticPanel';
import { FLUID_PRESETS, FluidPropertyCalculator } from '../services/FluidPropertyLibrary';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import UnitInput from './common/UnitInput';
import NumberField from './common/NumberField';
import { defaultInputUnits } from '../services/unitsCatalog';

const ExpertInputPanel = () => {
    const {
        state, updateInputs, setUnitSystem, setCalcMethod,
        setInputMethod, setInputUnit, calculate
    } = useReservoirCalc();
    
    const [isCalcOpen, setCalcOpen] = useState(false);
    const [calcParams, setCalcParams] = useState({ api: 35, gasGrav: 0.7, rs: 500, temp: 160 });
    const [isSettingsOpen, setSettingsOpen] = useState(true);

    useEffect(() => {
        if (!state.inputs.area && !state.inputs.thickness && state.inputMethod === 'simple') {
            console.log("Applying Default Test Values...");
            updateInputs({
                area: 5000,
                thickness: 50,
                ntg: 1.0,
                porosity: 0.20,
                sw: 0.30,
                fvf: 1.2,
                recovery: 25,
                recoveryGas: 70,
                bg: 0.005,
                pressure: 3500,
                temperature: 180,
                permeability: 100,
                api: 35,
                gasGrav: 0.7,
                fluidType: 'oil',
                owc: -8000,
                goc: -7000
            });
        }
    }, [state.inputMethod]); 

    // Auto-calculate deterministic baseline when inputs change in deterministic mode
    useEffect(() => {
        if (state.calcMethod === 'deterministic') {
            const timeout = setTimeout(() => {
                calculate();
            }, 500); // debounce deterministic base case calculation
            return () => clearTimeout(timeout);
        }
    }, [state.inputs, state.calcMethod, state.unitSystem, state.inputMethod]);

    const handleDetChange = (field, val) => updateInputs({ [field]: val });
    const handleFluidChange = (val) => updateInputs({ fluidType: val });
    
    const applyPreset = (presetKey, type) => {
        const p = FLUID_PRESETS[type][presetKey];
        if (p) {
            updateInputs({
                fvf: p.bo || state.inputs.fvf,
                bg: p.bg || state.inputs.bg,
            });
        }
    };
    
    const runFluidCalc = () => {
        const bo = FluidPropertyCalculator.calculateBo(calcParams.rs, calcParams.gasGrav, calcParams.api, calcParams.temp);
        updateInputs({ fvf: bo });
        setCalcOpen(false);
    };

    const fluidType = state.inputs.fluidType || 'oil';
    const inputUnits = state.inputUnits || defaultInputUnits(state.unitSystem);
    const unitInputProps = (field) => ({
        field,
        canonicalValue: state.inputs?.[field],
        displayUnit: inputUnits[field],
        unitSystem: state.unitSystem,
        onValueChange: (canonical) => updateInputs({ [field]: canonical }),
        onUnitChange: (u) => setInputUnit(field, u)
    });

    if (state.calcMethod === 'probabilistic') {
        return (
            <div className="h-full flex flex-col space-y-2 p-2 overflow-hidden">
                <Card className="p-3 bg-slate-900 border-slate-800 space-y-3 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold text-white">Simulation Setup</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-[10px] text-slate-500">System</Label>
                            <Select value={state.unitSystem || 'field'} onValueChange={setUnitSystem}>
                                <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="field">Field</SelectItem>
                                    <SelectItem value="metric">Metric</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[10px] text-slate-500">Mode</Label>
                            <Select value={state.calcMethod || 'deterministic'} onValueChange={setCalcMethod}>
                                <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="deterministic">Deterministic</SelectItem>
                                    <SelectItem value="probabilistic">Probabilistic</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <FluidTypeSelector value={fluidType} onChange={handleFluidChange} />
                </Card>
                <div className="flex-1 overflow-hidden rounded-lg border border-slate-800">
                    <ProbabilisticPanel />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-2 overflow-hidden space-y-2">
            <Collapsible open={isSettingsOpen} onOpenChange={setSettingsOpen} className="space-y-2 flex-shrink-0">
                <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-slate-900/50 cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => setSettingsOpen(!isSettingsOpen)}>
                        <span className="text-xs font-bold text-white">Project Settings</span>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                {isSettingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    
                    <CollapsibleContent className="p-3 pt-0 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-[10px] text-slate-500">System</Label>
                                <Select value={state.unitSystem || 'field'} onValueChange={setUnitSystem}>
                                    <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="field">Field</SelectItem>
                                        <SelectItem value="metric">Metric</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] text-slate-500">Mode</Label>
                                <Select value={state.calcMethod || 'deterministic'} onValueChange={setCalcMethod}>
                                    <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="deterministic">Deterministic</SelectItem>
                                        <SelectItem value="probabilistic">Probabilistic</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <FluidTypeSelector value={fluidType} onChange={handleFluidChange} />

                        <div className="space-y-2 pt-2 border-t border-slate-800">
                            <Label className="text-[10px] text-slate-400">Input Method</Label>
                            <RadioGroup 
                                value={state.inputMethod} 
                                onValueChange={setInputMethod}
                                className="grid grid-cols-3 gap-1"
                            >
                                {['simple', 'hybrid', 'surfaces'].map(m => (
                                    <div key={m}>
                                        <RadioGroupItem value={m} id={`im-${m}`} className="peer sr-only" />
                                        <Label htmlFor={`im-${m}`} className="flex items-center justify-center rounded-md border border-slate-800 bg-slate-950 py-1.5 px-1 hover:bg-slate-900 peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:text-blue-400 cursor-pointer text-[9px] capitalize text-center transition-all">
                                            {m}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Tabs defaultValue="geometry" className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full bg-slate-900 border border-slate-800 rounded-md p-0.5 h-auto grid grid-cols-5 mb-2">
                    <TabsTrigger value="geometry" className="text-[10px] h-7 px-0">Geo</TabsTrigger>
                    <TabsTrigger value="fluid" className="text-[10px] h-7 px-0">Fluid</TabsTrigger>
                    <TabsTrigger value="surfaces" className="text-[10px] h-7 px-0">Surf</TabsTrigger>
                    <TabsTrigger value="aoi" className="text-[10px] h-7 px-0"><ScanLine className="w-3 h-3" /></TabsTrigger>
                    <TabsTrigger value="mapping" className="text-[10px] h-7 px-0">Maps</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                    <TabsContent value="geometry" className="mt-0 space-y-3">
                         <div className="bg-blue-900/20 border border-blue-800 p-2 rounded text-[10px] text-blue-300 mb-2 leading-tight">
                            <strong>Convention:</strong> Z-Axis is Negative Downwards (e.g. -8000 ft is deeper than -7000 ft).
                        </div>

                        {state.inputMethod === 'simple' ? (
                            <UnitInput label="Area" {...unitInputProps('area')} />
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-xs text-slate-400">Surface Selection Managed in Surfaces Tab</Label>
                                {state.inputs.topSurfaceId ? (
                                    <div className="text-xs text-emerald-400 font-medium flex items-center gap-2">
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Top Surface Selected
                                    </div>
                                ) : (
                                    <div className="text-xs text-red-400 font-medium flex items-center gap-2">
                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div> No Top Surface
                                    </div>
                                )}
                            </div>
                        )}

                        {state.inputMethod !== 'surfaces' && (
                            <UnitInput label="Gross Thickness" {...unitInputProps('thickness')}
                                hint="Enter the gross interval thickness. Net rock is derived as gross times Net-to-Gross (set NTG under Petrophysics below). Do not enter net pay here with NTG below 1, or the net cut is applied twice." />
                        )}
                        
                        <div className="pt-2 border-t border-slate-800">
                            <FluidContactManager />
                        </div>

                        <div className="pt-2 border-t border-slate-800 space-y-2">
                            <Label className="text-xs font-bold text-slate-300">Petrophysics</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-slate-400">Net-to-Gross</Label>
                                    <NumberField value={state.inputs?.ntg} onCommit={v => handleDetChange('ntg', v ?? 0)} className="h-8 bg-slate-900" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-slate-400">Porosity</Label>
                                    <NumberField value={state.inputs?.porosity} onCommit={v => handleDetChange('porosity', v ?? 0)} className="h-8 bg-slate-900" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-slate-400">Water Saturation</Label>
                                    <NumberField value={state.inputs?.sw} onCommit={v => handleDetChange('sw', v ?? 0)} className="h-8 bg-slate-900" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-slate-400">Permeability (mD)</Label>
                                    <NumberField value={state.inputs?.permeability} onCommit={v => handleDetChange('permeability', v ?? 0)} className="h-8 bg-slate-900" />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 space-y-2">
                            <Label className="text-xs font-bold text-slate-300">Reservoir Conditions</Label>
                            <div className="grid grid-cols-1 gap-2">
                                <UnitInput label="Initial Pressure" {...unitInputProps('pressure')} />
                                <UnitInput label="Temperature" {...unitInputProps('temperature')} />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="fluid" className="mt-0 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-500">Quick Presets</Label>
                            <div className="flex flex-wrap gap-2">
                                {fluidType === 'oil' && Object.keys(FLUID_PRESETS.oil).map(k => (
                                    <Button key={k} variant="outline" size="sm" onClick={() => applyPreset(k, 'oil')} className="text-[10px] h-6 px-2">{FLUID_PRESETS.oil[k].name}</Button>
                                ))}
                                {fluidType === 'gas' && Object.keys(FLUID_PRESETS.gas).map(k => (
                                    <Button key={k} variant="outline" size="sm" onClick={() => applyPreset(k, 'gas')} className="text-[10px] h-6 px-2">{FLUID_PRESETS.gas[k].name}</Button>
                                ))}
                            </div>
                        </div>
                         {(fluidType === 'oil' || fluidType === 'oil_gas') && (
                            <div className="space-y-2 p-2 bg-slate-900/50 rounded border border-slate-800/50">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs text-emerald-400 font-bold">Oil Properties</Label>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setCalcOpen(true)}><Calculator className="w-3 h-3" /></Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Oil Gravity (API)</Label>
                                        <NumberField value={state.inputs?.api} onCommit={v => handleDetChange('api', v ?? 0)} className="h-8 bg-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Recovery Factor (%)</Label>
                                        <NumberField value={state.inputs?.recovery} onCommit={v => handleDetChange('recovery', v ?? 0)} className="h-8 bg-slate-900" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Formation Vol Factor (Bo)</Label>
                                    <div className="flex gap-2">
                                        <NumberField value={state.inputs?.fvf} onCommit={v => handleDetChange('fvf', v ?? 0)} className="h-8 bg-slate-900" />
                                        <span className="text-[10px] self-center text-slate-500">{state.unitSystem === 'field' ? 'rb/stb' : 'rm³/sm³'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(fluidType === 'gas' || fluidType === 'oil_gas') && (
                            <div className="space-y-2 p-2 bg-slate-900/50 rounded border border-slate-800/50">
                                <Label className="text-xs text-amber-400 font-bold">Gas Properties</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Gas Gravity (Air=1)</Label>
                                        <NumberField value={state.inputs?.gasGrav} onCommit={v => handleDetChange('gasGrav', v ?? 0)} className="h-8 bg-slate-900" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Recovery Factor (%)</Label>
                                        <NumberField value={state.inputs?.recoveryGas} onCommit={v => handleDetChange('recoveryGas', v ?? 0)} className="h-8 bg-slate-900" />
                                    </div>
                                </div>
                                <UnitInput label="Gas FVF (Bg)" {...unitInputProps('bg')}
                                    hint="Pick the convention your PVT report uses. Values in rb/scf and rb/Mscf are converted internally (5.614583 ft³/bbl)." />
                                {fluidType === 'oil_gas' && state.inputMethod === 'simple' && (
                                    <div className="space-y-1">
                                        <Label className="text-xs">Gas Cap Fraction of GRV</Label>
                                        <NumberField min="0" max="0.99" step="0.05" value={state.inputs?.gasCapFraction} onCommit={v => handleDetChange('gasCapFraction', v)} className="h-8 bg-slate-900" />
                                        <p className="text-[10px] text-slate-500">Share of gross rock volume in the gas cap (0–1). Splits the pore volume between gas cap and oil leg. Structural methods use the GOC instead.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="surfaces" className="mt-0 h-full">
                        <SurfaceDataManager />
                    </TabsContent>

                    <TabsContent value="aoi" className="mt-0 h-full">
                        <AOIPanel />
                    </TabsContent>

                    <TabsContent value="mapping" className="mt-0 h-full">
                        <MapGenerationPanel />
                    </TabsContent>
                </div>
            </Tabs>
            
            <Dialog open={isCalcOpen} onOpenChange={setCalcOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <DialogHeader><DialogTitle>Fluid Property Calculator</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div><Label>Oil Gravity (API)</Label><NumberField value={calcParams.api} onCommit={v => setCalcParams({...calcParams, api: v ?? 0})} className="bg-slate-950 border-slate-700"/></div>
                        <div><Label>Gas Gravity (Air=1)</Label><NumberField value={calcParams.gasGrav} onCommit={v => setCalcParams({...calcParams, gasGrav: v ?? 0})} className="bg-slate-950 border-slate-700"/></div>
                        <div><Label>Solution GOR (scf/stb)</Label><NumberField value={calcParams.rs} onCommit={v => setCalcParams({...calcParams, rs: v ?? 0})} className="bg-slate-950 border-slate-700"/></div>
                        <div><Label>Temp (F)</Label><NumberField value={calcParams.temp} onCommit={v => setCalcParams({...calcParams, temp: v ?? 0})} className="bg-slate-950 border-slate-700"/></div>
                    </div>
                    <DialogFooter>
                        <Button onClick={runFluidCalc}>Calculate Bo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ExpertInputPanel;
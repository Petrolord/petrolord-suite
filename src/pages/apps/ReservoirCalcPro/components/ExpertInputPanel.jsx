import { useSearchParams } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import ProjectUnitSystemNote from '@/components/units/ProjectUnitSystemNote';
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
import EarthModelProspectNote from './EarthModelProspectNote'; // Earth Modeling U2-009 handoff
import RegistryPanel from './RegistryPanel';
import ProbabilisticPanel from './probabilistic/ProbabilisticPanel';
import { FLUID_PRESETS, FluidPropertyCalculator } from '../services/FluidPropertyLibrary';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import UnitInput from './common/UnitInput';
import NumberField from './common/NumberField';
import ReportDetails from './common/ReportDetails';
import { defaultInputUnits, cgrUnitLabel, CGR_METRIC_PER_FIELD } from '../services/unitsCatalog';

const ExpertInputPanel = () => {
    const {
        state, updateInputs, setUnitSystem, profileUnitSystem, setCalcMethod,
        setInputMethod, setInputUnit, calculate
    } = useReservoirCalc();
    
    const [isCalcOpen, setCalcOpen] = useState(false);
    // Earth Modeling / Mapping deep link (EM5): ?surface=<geo_surfaces id>
    // opens the Surfaces tab with the import dialog on that row
    const [searchParams] = useSearchParams();
    const linkedSurfaceId = searchParams.get('surface');
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
                // gas presets carry a condensate yield in STB/MMscf (RCP-U1-017)
                ...(type === 'gas' ? { cgr: p.yield > 0 ? (state.unitSystem === 'metric' ? p.yield * CGR_METRIC_PER_FIELD : p.yield) : null } : {}),
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
                <Card className="p-3 space-y-3 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold text-pl-text">Simulation Setup</Label>
                    </div>
                    <ProjectUnitSystemNote system={state.unitSystem || 'field'} profileSystem={profileUnitSystem} />
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-[10px] text-pl-muted">System</Label>
                            <Select value={state.unitSystem || 'field'} onValueChange={setUnitSystem}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="field">Field</SelectItem>
                                    <SelectItem value="metric">Metric</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-[10px] text-pl-muted">Mode</Label>
                            <Select value={state.calcMethod || 'deterministic'} onValueChange={setCalcMethod}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="deterministic">Deterministic</SelectItem>
                                    <SelectItem value="probabilistic">Probabilistic</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <FluidTypeSelector value={fluidType} onChange={handleFluidChange} />
                    <ReportDetails />
                </Card>
                <div className="flex-1 overflow-hidden rounded-lg border border-pl-border">
                    <ProbabilisticPanel />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-2 overflow-hidden space-y-2">
            <EarthModelProspectNote />
            <Collapsible open={isSettingsOpen} onOpenChange={setSettingsOpen} className="space-y-2 flex-shrink-0">
                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between p-3 bg-pl-surface cursor-pointer hover:bg-pl-sunken transition-colors" onClick={() => setSettingsOpen(!isSettingsOpen)}>
                        <span className="text-xs font-bold text-pl-text">Project Settings</span>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                {isSettingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    
                    <CollapsibleContent className="p-3 pt-0 space-y-3">
                        <ProjectUnitSystemNote system={state.unitSystem || 'field'} profileSystem={profileUnitSystem} />
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-[10px] text-pl-muted">System</Label>
                                <Select value={state.unitSystem || 'field'} onValueChange={setUnitSystem}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="field">Field</SelectItem>
                                        <SelectItem value="metric">Metric</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] text-pl-muted">Mode</Label>
                                <Select value={state.calcMethod || 'deterministic'} onValueChange={setCalcMethod}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="deterministic">Deterministic</SelectItem>
                                        <SelectItem value="probabilistic">Probabilistic</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <FluidTypeSelector value={fluidType} onChange={handleFluidChange} />
                        <ReportDetails />

                        <div className="space-y-2 pt-2 border-t border-pl-border">
                            <Label className="text-[10px] text-pl-muted">Input Method</Label>
                            <RadioGroup 
                                value={state.inputMethod} 
                                onValueChange={setInputMethod}
                                className="grid grid-cols-3 gap-1"
                            >
                                {['simple', 'hybrid', 'surfaces'].map(m => (
                                    <div key={m}>
                                        <RadioGroupItem value={m} id={`im-${m}`} className="peer sr-only" />
                                        <Label htmlFor={`im-${m}`} className="flex items-center justify-center rounded-md border border-pl-border bg-pl-sunken py-1.5 px-1 hover:bg-pl-surface peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-surface peer-data-[state=checked]:text-pl-primary-text cursor-pointer text-[9px] capitalize text-center transition-all">
                                            {m}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Tabs defaultValue={linkedSurfaceId ? 'surfaces' : 'geometry'} className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full border rounded-md p-0.5 h-auto grid grid-cols-6 mb-2">
                    <TabsTrigger value="geometry" className="text-[10px] h-7 px-0" data-testid="rcp-tab-geometry">Geo</TabsTrigger>
                    <TabsTrigger value="fluid" className="text-[10px] h-7 px-0">Fluid</TabsTrigger>
                    <TabsTrigger value="surfaces" className="text-[10px] h-7 px-0" data-testid="rcp-tab-surfaces">Surf</TabsTrigger>
                    <TabsTrigger value="registry" className="text-[10px] h-7 px-0" data-testid="rcp-tab-registry" title="Wells, zones, surfaces and polygons from the shared registry">Wells</TabsTrigger>
                    <TabsTrigger value="aoi" className="text-[10px] h-7 px-0" data-testid="rcp-tab-aoi" title="Areas of interest"><ScanLine className="w-3 h-3" /></TabsTrigger>
                    <TabsTrigger value="mapping" className="text-[10px] h-7 px-0">Maps</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                    <TabsContent value="geometry" className="mt-0 space-y-3">
                         <div className="bg-pl-info-bg border border-pl-info/40 p-2 rounded text-[10px] text-pl-info-text mb-2 leading-tight">
                            <strong>Convention:</strong> Z-Axis is Negative Downwards (e.g. -8000 ft is deeper than -7000 ft).
                        </div>

                        {state.inputMethod === 'simple' ? (
                            <UnitInput label="Area" {...unitInputProps('area')} />
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-xs text-pl-muted">Surface Selection Managed in Surfaces Tab</Label>
                                {state.inputs.topSurfaceId ? (
                                    <div className="text-xs text-pl-success-text font-medium flex items-center gap-2">
                                        <div className="w-2 h-2 bg-pl-success rounded-full"></div> Top Surface Selected
                                    </div>
                                ) : (
                                    <div className="text-xs text-pl-danger-text font-medium flex items-center gap-2">
                                        <div className="w-2 h-2 bg-pl-danger rounded-full"></div> No Top Surface
                                    </div>
                                )}
                            </div>
                        )}

                        {state.inputMethod !== 'surfaces' && (
                            <UnitInput label="Gross Thickness" {...unitInputProps('thickness')}
                                hint="Enter the gross interval thickness. Net rock is derived as gross times Net-to-Gross (set NTG under Petrophysics below). Do not enter net pay here with NTG below 1, or the net cut is applied twice." />
                        )}
                        
                        <div className="pt-2 border-t border-pl-border">
                            <FluidContactManager />
                        </div>

                        <div className="pt-2 border-t border-pl-border space-y-2">
                            <Label className="text-xs font-bold text-pl-text">Petrophysics</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-pl-muted">Net-to-Gross</Label>
                                    <NumberField value={state.inputs?.ntg} onCommit={v => handleDetChange('ntg', v ?? 0)} className="h-8" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-pl-muted">Porosity</Label>
                                    <NumberField value={state.inputs?.porosity} onCommit={v => handleDetChange('porosity', v ?? 0)} className="h-8" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-pl-muted">Water Saturation</Label>
                                    <NumberField value={state.inputs?.sw} onCommit={v => handleDetChange('sw', v ?? 0)} className="h-8" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-pl-muted">Permeability (mD)</Label>
                                    <NumberField value={state.inputs?.permeability} onCommit={v => handleDetChange('permeability', v ?? 0)} className="h-8" />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-pl-border space-y-2">
                            <Label className="text-xs font-bold text-pl-text">Reservoir Conditions</Label>
                            <div className="grid grid-cols-1 gap-2">
                                <UnitInput label="Initial Pressure" {...unitInputProps('pressure')} />
                                <UnitInput label="Temperature" {...unitInputProps('temperature')} />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="fluid" className="mt-0 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-pl-muted">Quick Presets</Label>
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
                            <div className="space-y-2 p-2 bg-pl-surface rounded border border-pl-border">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs text-pl-text font-bold">Oil Properties</Label>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setCalcOpen(true)}><Calculator className="w-3 h-3" /></Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Oil Gravity (API)</Label>
                                        <NumberField value={state.inputs?.api} onCommit={v => handleDetChange('api', v ?? 0)} className="h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Recovery Factor (%)</Label>
                                        <NumberField value={state.inputs?.recovery} onCommit={v => handleDetChange('recovery', v ?? 0)} className="h-8" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Formation Vol Factor (Bo)</Label>
                                    <div className="flex gap-2">
                                        <NumberField value={state.inputs?.fvf} onCommit={v => handleDetChange('fvf', v ?? 0)} className="h-8" />
                                        <span className="text-[10px] self-center text-pl-muted">{state.unitSystem === 'field' ? 'rb/stb' : 'rm³/sm³'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(fluidType === 'gas' || fluidType === 'oil_gas') && (
                            <div className="space-y-2 p-2 bg-pl-surface rounded border border-pl-border">
                                <Label className="text-xs text-pl-text font-bold">Gas Properties</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Gas Gravity (Air=1)</Label>
                                        <NumberField value={state.inputs?.gasGrav} onCommit={v => handleDetChange('gasGrav', v ?? 0)} className="h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Recovery Factor (%)</Label>
                                        <NumberField value={state.inputs?.recoveryGas} onCommit={v => handleDetChange('recoveryGas', v ?? 0)} className="h-8" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Condensate-gas ratio, CGR ({cgrUnitLabel(state.unitSystem)})</Label>
                                    <NumberField value={state.inputs?.cgr} onCommit={v => handleDetChange('cgr', v)} className="h-8" data-testid="rcp-cgr" />
                                    <p className="text-[10px] text-pl-muted">Leave empty for dry gas. Condensate in place = GIIP x CGR; recoverable condensate takes the gas recovery factor.</p>
                                </div>
                                <UnitInput label="Gas FVF (Bg)" {...unitInputProps('bg')}
                                    hint="Pick the convention your PVT report uses. Values in rb/scf and rb/Mscf are converted internally (5.614583 ft³/bbl)." />
                                {fluidType === 'oil_gas' && state.inputMethod === 'simple' && (
                                    <div className="space-y-1">
                                        <Label className="text-xs">Gas Cap Fraction of GRV</Label>
                                        <NumberField min="0" max="0.99" step="0.05" value={state.inputs?.gasCapFraction} onCommit={v => handleDetChange('gasCapFraction', v)} className="h-8" />
                                        <p className="text-[10px] text-pl-muted">Share of gross rock volume in the gas cap (0–1). Splits the pore volume between gas cap and oil leg. Structural methods use the GOC instead.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="registry" className="mt-0">
                        <RegistryPanel />
                    </TabsContent>
                    <TabsContent value="surfaces" className="mt-0 h-full">
                        <SurfaceDataManager preselectSurfaceId={linkedSurfaceId} />
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
                <DialogContent>
                    <DialogHeader><DialogTitle>Fluid Property Calculator</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div><Label>Oil Gravity (API)</Label><NumberField value={calcParams.api} onCommit={v => setCalcParams({...calcParams, api: v ?? 0})}/></div>
                        <div><Label>Gas Gravity (Air=1)</Label><NumberField value={calcParams.gasGrav} onCommit={v => setCalcParams({...calcParams, gasGrav: v ?? 0})}/></div>
                        <div><Label>Solution GOR (scf/stb)</Label><NumberField value={calcParams.rs} onCommit={v => setCalcParams({...calcParams, rs: v ?? 0})}/></div>
                        <div><Label>Temp (F)</Label><NumberField value={calcParams.temp} onCommit={v => setCalcParams({...calcParams, temp: v ?? 0})}/></div>
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
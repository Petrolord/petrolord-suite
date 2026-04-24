
import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { HeatFlowPresets } from '../../data/HeatFlowPresets';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Thermometer, Activity } from 'lucide-react';

const HeatFlowStep = () => {
    const { wizardData, setWizardData } = useGuidedMode();

    return (
        <div className="h-full flex gap-6">
            <div className="flex-1 flex flex-col">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">Heat Flow History</h2>
                    <p className="text-slate-400">Select the thermal boundary condition at the base of the lithosphere.</p>
                </div>

                <RadioGroup 
                    value={wizardData.heatFlowId} 
                    onValueChange={(val) => setWizardData(prev => ({ ...prev, heatFlowId: val }))}
                    className="grid grid-cols-1 gap-3 pr-2"
                >
                    {HeatFlowPresets.map(preset => (
                        <div key={preset.id}>
                            <RadioGroupItem value={preset.id} id={preset.id} className="peer sr-only" />
                            <Label 
                                htmlFor={preset.id}
                                className="flex flex-col p-4 rounded-lg border-2 border-slate-800 bg-slate-900 cursor-pointer hover:bg-slate-800/50 peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-900/10 transition-all"
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 font-bold text-white">
                                        <Thermometer className={`w-5 h-5 ${preset.type === 'constant' ? 'text-blue-400' : 'text-amber-400'}`} />
                                        {preset.name}
                                    </div>
                                    <div className="text-sm font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                        {preset.range}
                                    </div>
                                </div>
                                <p className="text-sm text-slate-400">{preset.description}</p>
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>

            <div className="w-96 shrink-0 border-l border-slate-800 pl-6 flex flex-col">
                <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Thermal History Preview
                </h3>
                
                <div className="flex-1 bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex items-center justify-center text-slate-500">
                    Chart removed
                </div>
            </div>
        </div>
    );
};

export default HeatFlowStep;

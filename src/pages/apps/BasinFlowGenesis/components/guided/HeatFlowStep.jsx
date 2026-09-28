
import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { HeatFlowPresets } from '../../data/HeatFlowPresets';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Thermometer, Activity } from 'lucide-react';
import HeatFlowChart from '../history/HeatFlowChart';

const HeatFlowStep = () => {
    const { wizardData, setWizardData } = useGuidedMode();
    const preset = HeatFlowPresets.find((p) => p.id === wizardData.heatFlowId);
    const maxAge = Math.max(1, ...(wizardData.layers || []).map((l) => Number(l.ageStart) || 0));

    return (
        <div className="h-full flex gap-6">
            <div className="flex-1 flex flex-col">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-pl-text mb-2">Heat Flow History</h2>
                    <p className="text-pl-muted">Select the thermal boundary condition at the base of the lithosphere.</p>
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
                                className="flex flex-col p-4 rounded-lg border-2 border-pl-border bg-pl-surface cursor-pointer hover:bg-pl-sunken peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-sunken transition-all"
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 font-bold text-pl-text">
                                        <Thermometer className={`w-5 h-5 ${preset.type === 'constant' ? 'text-pl-info-text' : 'text-pl-warning-text'}`} />
                                        {preset.name}
                                    </div>
                                    <div className="text-sm font-mono text-pl-text bg-pl-bg px-2 py-1 rounded border border-pl-border">
                                        {preset.range}
                                    </div>
                                </div>
                                <p className="text-sm text-pl-muted">{preset.description}</p>
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>

            <div className="w-96 shrink-0 border-l border-pl-border pl-6 flex flex-col">
                <h3 className="text-xs font-bold text-pl-muted uppercase mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Thermal History Preview
                </h3>
                
                {preset ? (
                    <HeatFlowChart
                        heatFlow={preset.type === 'constant' ? { type: 'constant', value: preset.value } : { type: 'variable', history: preset.history }}
                        maxAge={Math.max(maxAge, 200)}
                        height={260}
                    />
                ) : (
                    <div className="flex-1 bg-pl-surface rounded-lg border border-pl-border p-2 flex items-center justify-center text-pl-muted">
                        Choose a model to preview it.
                    </div>
                )}
            </div>
        </div>
    );
};

export default HeatFlowStep;

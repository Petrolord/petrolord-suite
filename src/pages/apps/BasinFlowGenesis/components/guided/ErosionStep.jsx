import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { ErosionPresets } from '../../data/ErosionPresets';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Mountain, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { depthToDisplay, depthFromDisplay, tidy } from '../../services/units';

const ErosionStep = () => {
    const { wizardData, setWizardData } = useGuidedMode();
    const { units } = useBasinFlow();
    const custom = wizardData.erosionEvent || { age: 10, amount: 500 };
    const setCustom = (patch) => setWizardData((prev) => ({ ...prev, erosionEvent: { ...(prev.erosionEvent || { age: 10, amount: 500 }), ...patch } }));

    return (
        <div className="h-full flex gap-6">
             <div className="flex-1 flex flex-col">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-pl-text mb-2">Erosion Events</h2>
                    <p className="text-pl-muted">Specify if the basin experienced significant uplift and removal of overburden.</p>
                </div>

                <RadioGroup 
                    value={wizardData.erosionOption} 
                    onValueChange={(val) => setWizardData(prev => ({ ...prev, erosionOption: val }))}
                    className="grid grid-cols-1 gap-4"
                >
                    {ErosionPresets.map(opt => (
                        <div key={opt.id}>
                            <RadioGroupItem value={opt.id} id={opt.id} className="peer sr-only" />
                            <Label 
                                htmlFor={opt.id}
                                className="flex flex-col p-4 rounded-lg border-2 border-pl-border bg-pl-surface cursor-pointer hover:bg-pl-sunken peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-sunken transition-all"
                            >
                                 <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 font-bold text-pl-text">
                                        <Mountain className={`w-5 h-5 ${opt.amount > 0 ? 'text-pl-primary-text' : 'text-pl-muted'}`} />
                                        {opt.name}
                                    </div>
                                    {opt.amount > 0 && (
                                        <div className="text-sm font-mono text-pl-text font-bold">
                                            ~{opt.amount}m Removal
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-pl-muted">{opt.description}</p>
                                
                                {opt.id === 'custom' && wizardData.erosionOption === 'custom' && (
                                    <div className="mt-4 p-3 bg-pl-bg rounded border border-pl-border grid grid-cols-2 gap-3 text-xs" onClick={(e) => e.preventDefault()}>
                                        <label className="text-pl-muted">
                                            Age of the uplift (Ma)
                                            <Input type="number" step="any" data-testid="bf-wizard-erosion-age" value={custom.age} onChange={(e) => setCustom({ age: parseFloat(e.target.value) })} className="mt-1 h-8" />
                                        </label>
                                        <label className="text-pl-muted">
                                            Section removed ({units.depth})
                                            <Input type="number" step="any" data-testid="bf-wizard-erosion-amount" value={tidy(depthToDisplay(custom.amount, units.depth))} onChange={(e) => setCustom({ amount: depthFromDisplay(parseFloat(e.target.value), units.depth) })} className="mt-1 h-8" />
                                        </label>
                                    </div>
                                )}
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>
            
            <div className="w-80 shrink-0 border-l border-pl-border pl-6">
                 <h3 className="text-xs font-bold text-pl-muted uppercase mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Impact Warning
                </h3>
                <div className="p-4 bg-pl-warning-bg border border-pl-warning/40 rounded-lg text-sm text-pl-warning-text leading-relaxed">
                    <p className="mb-3">
                        Erosion events significantly impact maturity modeling by cooling source rocks after maximum burial.
                    </p>
                    <p>
                        Ensure your estimate matches regional unconformities (e.g., Late Cretaceous uplift).
                        Overestimating erosion will result in modeled maturities that are too high for present-day depths.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ErosionStep;
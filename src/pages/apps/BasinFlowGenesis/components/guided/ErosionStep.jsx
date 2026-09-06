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
                    <h2 className="text-2xl font-bold text-white mb-2">Erosion Events</h2>
                    <p className="text-slate-400">Specify if the basin experienced significant uplift and removal of overburden.</p>
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
                                className="flex flex-col p-4 rounded-lg border-2 border-slate-800 bg-slate-900 cursor-pointer hover:bg-slate-800/50 peer-data-[state=checked]:border-emerald-500 peer-data-[state=checked]:bg-emerald-900/10 transition-all"
                            >
                                 <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2 font-bold text-white">
                                        <Mountain className={`w-5 h-5 ${opt.amount > 0 ? 'text-amber-500' : 'text-slate-500'}`} />
                                        {opt.name}
                                    </div>
                                    {opt.amount > 0 && (
                                        <div className="text-sm font-mono text-amber-400 font-bold">
                                            ~{opt.amount}m Removal
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-slate-400">{opt.description}</p>
                                
                                {opt.id === 'custom' && wizardData.erosionOption === 'custom' && (
                                    <div className="mt-4 p-3 bg-slate-950 rounded border border-slate-800 grid grid-cols-2 gap-3 text-xs" onClick={(e) => e.preventDefault()}>
                                        <label className="text-slate-400">
                                            Age of the uplift (Ma)
                                            <Input type="number" step="any" data-testid="bf-wizard-erosion-age" value={custom.age} onChange={(e) => setCustom({ age: parseFloat(e.target.value) })} className="mt-1 h-8 bg-slate-900" />
                                        </label>
                                        <label className="text-slate-400">
                                            Section removed ({units.depth})
                                            <Input type="number" step="any" data-testid="bf-wizard-erosion-amount" value={tidy(depthToDisplay(custom.amount, units.depth))} onChange={(e) => setCustom({ amount: depthFromDisplay(parseFloat(e.target.value), units.depth) })} className="mt-1 h-8 bg-slate-900" />
                                        </label>
                                    </div>
                                )}
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>
            
            <div className="w-80 shrink-0 border-l border-slate-800 pl-6">
                 <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Impact Warning
                </h3>
                <div className="p-4 bg-amber-900/10 border border-amber-900/30 rounded-lg text-sm text-amber-200/80 leading-relaxed">
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
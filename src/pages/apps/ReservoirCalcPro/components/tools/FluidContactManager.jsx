import React, { useState, useEffect, useRef } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Droplets, ArrowDown } from 'lucide-react';

const FluidContactManager = () => {
    const { state, updateInputs } = useReservoirCalc();
    const { fluidType, owc, goc } = state.inputs;
    
    // Local state for immediate UI feedback
    const [localOwc, setLocalOwc] = useState(owc ?? '');
    const [localGoc, setLocalGoc] = useState(goc ?? '');

    // Sync local state when global state changes externally
    useEffect(() => {
        if (owc !== localOwc && document.activeElement !== document.getElementById('owc-input')) {
            setLocalOwc(owc ?? '');
        }
    }, [owc]);

    useEffect(() => {
        if (goc !== localGoc && document.activeElement !== document.getElementById('goc-input')) {
            setLocalGoc(goc ?? '');
        }
    }, [goc]);

    // Debounce/Blur handler to update context
    const handleCommit = (field, value) => {
        const numVal = value === '' ? null : parseFloat(value);
        updateInputs({ [field]: numVal });
    };

    const handleKeyDown = (e, field, value) => {
        if (e.key === 'Enter') {
            handleCommit(field, value);
            e.target.blur();
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Droplets className="w-3 h-3 text-blue-400" /> FLUID CONTACTS
            </div>

            <Card className="bg-slate-900/50 border-slate-800 p-2 space-y-2">
                {(fluidType === 'oil' || fluidType === 'oil_gas') && (
                    <div className="space-y-1">
                        <Label htmlFor="owc-input" className="text-xs text-blue-300">OWC (Oil-Water)</Label>
                        <div className="relative">
                            <Input 
                                id="owc-input"
                                type="number" 
                                value={localOwc}
                                onChange={(e) => setLocalOwc(e.target.value)}
                                onBlur={() => handleCommit('owc', localOwc)}
                                onKeyDown={(e) => handleKeyDown(e, 'owc', localOwc)}
                                className="h-8 bg-slate-950 border-blue-900/50 focus:border-blue-500 pr-8 text-right font-mono text-xs"
                                placeholder="Depth"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none opacity-50">
                                <ArrowDown className="w-3 h-3 text-slate-500" />
                            </div>
                        </div>
                    </div>
                )}

                {(fluidType === 'gas' || fluidType === 'oil_gas') && (
                    <div className="space-y-1">
                        <Label htmlFor="goc-input" className="text-xs text-red-300">{fluidType === 'gas' ? 'GWC (Gas-Water)' : 'GOC (Gas-Oil)'}</Label>
                         <div className="relative">
                            <Input 
                                id="goc-input"
                                type="number" 
                                value={localGoc}
                                onChange={(e) => setLocalGoc(e.target.value)}
                                onBlur={() => handleCommit('goc', localGoc)}
                                onKeyDown={(e) => handleKeyDown(e, 'goc', localGoc)}
                                className="h-8 bg-slate-950 border-red-900/50 focus:border-red-500 pr-8 text-right font-mono text-xs"
                                placeholder="Depth"
                            />
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none opacity-50">
                                <ArrowDown className="w-3 h-3 text-slate-500" />
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="text-[10px] text-slate-500 italic mt-1 px-1">
                    * Assuming Z values represent Depth (Positive Downwards).
                </div>
            </Card>
        </div>
    );
};

export default FluidContactManager;
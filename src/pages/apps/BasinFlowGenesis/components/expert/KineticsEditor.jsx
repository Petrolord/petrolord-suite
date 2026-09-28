import React from 'react';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

const KineticsEditor = ({ layer, onUpdate }) => {
    const params = layer.sourceRock || { isSource: false, kerogen: 'type2', toc: 2.0, hi: 450 };

    const handleChange = (field, value) => {
        onUpdate({ ...params, [field]: value });
    };

    if (!params.isSource) {
        return (
             <div className="p-3 bg-pl-sunken rounded border border-pl-border text-center">
                <p className="text-xs text-pl-muted mb-2">Not a source rock.</p>
                <button 
                    onClick={() => handleChange('isSource', true)}
                    className="text-xs text-pl-primary-text hover:underline"
                >
                    Enable Source Rock
                </button>
             </div>
        );
    }

    return (
        <div className="space-y-3 p-3 bg-pl-sunken rounded border border-pl-border">
            <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-pl-muted uppercase tracking-wider">Kinetics & Richness</h4>
                <button 
                    onClick={() => handleChange('isSource', false)}
                    className="text-[10px] text-pl-muted hover:text-pl-danger-text"
                >
                    Disable
                </button>
            </div>
            
            <div className="space-y-2">
                <div>
                    <Label className="text-[10px] text-pl-muted">Kerogen Type</Label>
                    <Select value={params.kerogen} onValueChange={(v) => handleChange('kerogen', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="type1">Type I (Lacustrine)</SelectItem>
                            <SelectItem value="type2">Type II (Marine)</SelectItem>
                            <SelectItem value="type3">Type III (Humic)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <Label className="text-[10px] text-pl-muted">TOC (%)</Label>
                        <input 
                            type="number" step="0.1"
                            value={params.toc}
                            onChange={(e) => handleChange('toc', parseFloat(e.target.value))}
                            className={`${COMPACT_FIELD_THEMED} h-7`}
                        />
                    </div>
                    <div>
                        <Label className="text-[10px] text-pl-muted">HI (mg/g)</Label>
                        <input 
                            type="number" step="10"
                            value={params.hi}
                            onChange={(e) => handleChange('hi', parseFloat(e.target.value))}
                            className={`${COMPACT_FIELD_THEMED} h-7`}
                        />
                    </div>
                </div>
            </div>
            
            <div className="text-[10px] text-pl-muted italic bg-pl-sunken p-1 rounded">
                Using Pepper & Corvi (1995) standard kinetics for {params.kerogen}.
            </div>
        </div>
    );
};

export default KineticsEditor;
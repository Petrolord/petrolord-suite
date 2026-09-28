import React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Droplets, Flame, Layers } from 'lucide-react';

const FluidTypeSelector = ({ value, onChange }) => {
    return (
        <div className="space-y-3">
            <Label className="text-xs font-medium text-pl-muted uppercase tracking-wider">Fluid System</Label>
            <RadioGroup 
                value={value} 
                onValueChange={onChange}
                className="grid grid-cols-3 gap-3"
            >
                <div>
                    <RadioGroupItem value="oil" id="ft-oil" className="peer sr-only" />
                    <Label htmlFor="ft-oil" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-pl-border bg-pl-sunken p-3 hover:bg-pl-surface hover:border-pl-border-strong peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-surface cursor-pointer transition-all group">
                        <Droplets className="w-5 h-5 text-pl-muted" />
                        <span className="text-xs font-medium text-pl-muted group-hover:text-pl-text">Oil</span>
                    </Label>
                </div>
                <div>
                    <RadioGroupItem value="gas" id="ft-gas" className="peer sr-only" />
                    <Label htmlFor="ft-gas" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-pl-border bg-pl-sunken p-3 hover:bg-pl-surface hover:border-pl-border-strong peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-surface cursor-pointer transition-all group">
                        <Flame className="w-5 h-5 text-pl-muted" />
                        <span className="text-xs font-medium text-pl-muted group-hover:text-pl-text">Gas</span>
                    </Label>
                </div>
                <div>
                    <RadioGroupItem value="oil_gas" id="ft-mixed" className="peer sr-only" />
                    <Label htmlFor="ft-mixed" className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-pl-border bg-pl-sunken p-3 hover:bg-pl-surface hover:border-pl-border-strong peer-data-[state=checked]:border-pl-primary peer-data-[state=checked]:bg-pl-surface cursor-pointer transition-all group">
                        <Layers className="w-5 h-5 text-pl-muted" />
                        <span className="text-xs font-medium text-pl-muted group-hover:text-pl-text">Oil + Gas</span>
                    </Label>
                </div>
            </RadioGroup>
        </div>
    );
};

export default FluidTypeSelector;
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

const ThermalPropertiesEditor = ({ layer, onUpdate }) => {
    const params = layer.thermal || { conductivity: 2.5, radiogenic: 1.0e-6, heatCapacity: 1000, anisotropy: 1.0 };

    const handleChange = (field, value) => {
        onUpdate({ ...params, [field]: value });
    };

    return (
        <div className="space-y-3 p-3 bg-pl-sunken rounded border border-pl-border">
             <h4 className="text-xs font-semibold text-pl-muted uppercase tracking-wider">Thermal Properties</h4>
             
             <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                    <Label className="text-[10px] text-pl-muted">Conductivity (W/mK)</Label>
                    <Input 
                        type="number" step="0.1"
                        value={params.conductivity}
                        onChange={(e) => handleChange('conductivity', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
                <div className="col-span-1">
                    <Label className="text-[10px] text-pl-muted">Radiogenic (W/m³)</Label>
                    <Input 
                        type="number" step="0.1e-7"
                        value={params.radiogenic}
                        onChange={(e) => handleChange('radiogenic', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
                 <div className="col-span-1">
                    <Label className="text-[10px] text-pl-muted">Heat Capacity (J/kgK)</Label>
                    <Input 
                        type="number" step="10"
                        value={params.heatCapacity}
                        onChange={(e) => handleChange('heatCapacity', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
                <div className="col-span-1">
                    <Label className="text-[10px] text-pl-muted">Anisotropy (Kh/Kv)</Label>
                    <Input 
                        type="number" step="0.1"
                        value={params.anisotropy || 1.0}
                        onChange={(e) => handleChange('anisotropy', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
             </div>
        </div>
    );
};

export default ThermalPropertiesEditor;
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CompactionModelEditor = ({ layer, onUpdate }) => {
    const params = layer.compaction || { model: 'exponential', phi0: 0.5, c: 0.0004 };

    const handleChange = (field, value) => {
        onUpdate({ ...params, [field]: value });
    };

    return (
        <div className="space-y-3 p-3 bg-pl-sunken rounded border border-pl-border">
            <h4 className="text-xs font-semibold text-pl-muted uppercase tracking-wider">Compaction Model</h4>
            
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                    <Label className="text-[10px] text-pl-muted">Model Type</Label>
                    <Select value={params.model} onValueChange={(v) => handleChange('model', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="exponential">Exponential (Athy)</SelectItem>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="reciprocal">Reciprocal</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div>
                    <Label className="text-[10px] text-pl-muted">Surface Porosity (φ0)</Label>
                    <Input 
                        type="number" step="0.01" min="0" max="1"
                        value={params.phi0}
                        onChange={(e) => handleChange('phi0', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
                
                <div>
                    <Label className="text-[10px] text-pl-muted">Coeff. c (1/m)</Label>
                    <Input 
                        type="number" step="0.00001"
                        value={params.c}
                        onChange={(e) => handleChange('c', parseFloat(e.target.value))}
                        className="h-7 text-xs"
                    />
                </div>
            </div>
            
            <div className="text-[10px] text-pl-muted italic mt-1">
                {params.model === 'exponential' && "φ(z) = φ0 * exp(-c * z)"}
                {params.model === 'linear' && "φ(z) = φ0 - c * z"}
            </div>
        </div>
    );
};

export default CompactionModelEditor;
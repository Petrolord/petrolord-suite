import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

const GeomechLimits = ({ data, onChange }) => {
    const update = (key, value) => {
        onChange({ ...data, [key]: value });
    };
    
    const updateMudWindow = (field, value) => {
        const currentWindow = data.mudWindow || { min: 0, max: 0 };
        update('mudWindow', { ...currentWindow, [field]: parseFloat(value) });
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-pl-muted" />
                    Geomechanics & Limits
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Pore Pressure Grad. (ppg)</Label>
                        <Input 
                            type="number" step="0.1"
                            value={data.porePressureGradient || ''} 
                            onChange={(e) => update('porePressureGradient', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Fracture Gradient (ppg)</Label>
                        <Input 
                            type="number" step="0.1"
                            value={data.fractureGradient || ''} 
                            onChange={(e) => update('fractureGradient', parseFloat(e.target.value))}
                        />
                    </div>
                </div>

                <div className="pt-2 border-t border-pl-border">
                    <Label className="text-xs text-pl-muted font-bold mb-2 block">Safe Mud Weight Window (ppg)</Label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                             <span className="text-[10px] text-pl-muted uppercase">Min</span>
                             <Input 
                                type="number" step="0.1"
                                value={data.mudWindow?.min || ''} 
                                onChange={(e) => updateMudWindow('min', e.target.value)}
                            />
                        </div>
                        <div className="w-2 h-[1px] bg-pl-border-strong mt-4"></div>
                        <div className="flex-1">
                            <span className="text-[10px] text-pl-muted uppercase">Max</span>
                            <Input 
                                type="number" step="0.1"
                                value={data.mudWindow?.max || ''} 
                                onChange={(e) => updateMudWindow('max', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-2 p-2 bg-pl-sunken rounded text-xs text-pl-muted border border-pl-border">
                    <strong>Risk Note:</strong> Ensure mud weight stays within limits to prevent kicks or formation damage.
                </div>
            </CardContent>
        </Card>
    );
};

export default GeomechLimits;
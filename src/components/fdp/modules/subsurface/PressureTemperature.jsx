import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Thermometer } from 'lucide-react';

const PressureTemperature = ({ data, onChange }) => {
    const update = (key, value) => {
        onChange({ ...data, [key]: value });
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium text-pl-text flex items-center">
                    <Thermometer className="w-5 h-5 mr-2 text-pl-muted" />
                    Pressure & Temperature
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Datum Depth (ft/m)</Label>
                        <Input 
                            type="number"
                            value={data.datumDepth || ''} 
                            onChange={(e) => update('datumDepth', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Datum Pressure (psi)</Label>
                        <Input 
                            type="number"
                            value={data.datumPressure || ''} 
                            onChange={(e) => update('datumPressure', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Pressure Gradient (psi/ft)</Label>
                        <Input 
                            type="number" step="0.01"
                            value={data.gradient || ''} 
                            onChange={(e) => update('gradient', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs text-pl-muted">Temp. Gradient (°/100ft)</Label>
                        <Input 
                            type="number" step="0.01"
                            value={data.temperatureGradient || ''} 
                            onChange={(e) => update('temperatureGradient', parseFloat(e.target.value))}
                        />
                    </div>
                </div>
                
                {/* Simple visualizer placeholder */}
                <div className="mt-4 h-32 bg-pl-sunken rounded border border-pl-border flex items-center justify-center text-xs text-pl-muted">
                    Pressure Plot Preview
                </div>
            </CardContent>
        </Card>
    );
};

export default PressureTemperature;
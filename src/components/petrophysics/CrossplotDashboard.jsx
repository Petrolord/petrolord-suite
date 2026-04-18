
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScatterChart } from 'lucide-react';
import { calculateLinearRegression, calculatePowerLawRegression, calculateExponentialRegression } from '@/utils/petrophysicsCalculations';

const CrossplotDashboard = ({ data, curveMap }) => {
    const [xAxis, setXAxis] = useState('NPHI');
    const [yAxis, setYAxis] = useState('RHOB');
    const [colorAxis, setColorAxis] = useState('GR');
    const [showTrend, setShowTrend] = useState(false);
    const [trendType, setTrendType] = useState('linear');

    const applyPreset = (preset) => {
        if (preset === 'den-neu') {
            setXAxis('NPHI'); setYAxis('RHOB'); setColorAxis('GR');
        } else if (preset === 'pickett') {
            setXAxis('PHIE'); setYAxis('RES_DEEP'); setColorAxis('VSH'); setTrendType('power');
        } else if (preset === 'buckles') {
            setXAxis('PHIE'); setYAxis('SW'); setColorAxis('VSH'); setTrendType('power');
        } else if (preset === 'phi-k') {
            setXAxis('PHIE'); setYAxis('PERM'); setColorAxis('VSH'); setTrendType('exponential');
        }
    };

    const availableCurves = useMemo(() => {
        return Object.keys(curveMap).filter(k => curveMap[k]);
    }, [curveMap]);

    return (
        <div className="h-full flex gap-4">
            <Card className="w-64 bg-slate-950 border-slate-800 flex flex-col shrink-0">
                <CardHeader className="pb-3 border-b border-slate-800">
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        <ScatterChart className="w-4 h-4 text-blue-400" /> Crossplot
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs text-slate-400 uppercase">Presets</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => applyPreset('den-neu')}>Den-Neu</Button>
                            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => applyPreset('pickett')}>Pickett</Button>
                            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => applyPreset('buckles')}>Buckles</Button>
                            <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => applyPreset('phi-k')}>Phi-K</Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-xs text-slate-400 uppercase">Axes</Label>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">X Axis</Label>
                            <Select value={xAxis} onValueChange={setXAxis}>
                                <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">Y Axis</Label>
                            <Select value={yAxis} onValueChange={setYAxis}>
                                <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500">Color (Z)</Label>
                            <Select value={colorAxis} onValueChange={setColorAxis}>
                                <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-800">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="show-trend" checked={showTrend} onCheckedChange={setShowTrend} />
                            <Label htmlFor="show-trend" className="text-xs text-slate-300">Show Trend Line</Label>
                        </div>
                        {showTrend && (
                            <Select value={trendType} onValueChange={setTrendType}>
                                <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="linear">Linear (y=mx+c)</SelectItem>
                                    <SelectItem value="power">Power (Archie)</SelectItem>
                                    <SelectItem value="exponential">Exponential (Phi-K)</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden relative flex items-center justify-center text-slate-500">
                Chart removed
            </div>
        </div>
    );
};

export default CrossplotDashboard;

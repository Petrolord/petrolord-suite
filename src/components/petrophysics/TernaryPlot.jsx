
import React, { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

const TernaryPlot = ({ data, curveMap }) => {
    const [aAxis, setAAxis] = useState('NPHI'); 
    const [bAxis, setBAxis] = useState('RHOB'); 
    const [cAxis, setCAxis] = useState('GR');   

    const availableCurves = useMemo(() => {
        return Object.keys(curveMap).filter(k => curveMap[k]);
    }, [curveMap]);

    return (
        <div className="h-full flex gap-4">
            <Card className="w-48 bg-slate-950 border-slate-800 p-4 shrink-0 space-y-4">
                <h3 className="text-sm font-bold text-white">Ternary Axes</h3>
                <div className="space-y-1">
                    <Label className="text-[10px] text-cyan-400">Top (A)</Label>
                    <Select value={aAxis} onValueChange={setAAxis}>
                        <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-[10px] text-purple-400">Left (B)</Label>
                    <Select value={bAxis} onValueChange={setBAxis}>
                        <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-[10px] text-green-400">Right (C)</Label>
                    <Select value={cAxis} onValueChange={setCAxis}>
                        <SelectTrigger className="h-7 text-xs bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {availableCurves.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <p className="text-[10px] text-slate-500 pt-4">
                    Use for lithology (e.g. Qtz, Cal, Dol) or component analysis.
                </p>
            </Card>

            <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center text-slate-500">
                Chart removed
            </div>
        </div>
    );
};

export default TernaryPlot;

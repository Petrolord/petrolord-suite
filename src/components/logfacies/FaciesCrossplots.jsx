
import React, { useState } from 'react';
import { Maximize2, PenTool, MousePointer2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';

const FaciesCrossplots = ({ data, faciesColors, onSelection }) => {
    const [xCurve, setXCurve] = useState('NPHI');
    const [yCurve, setYCurve] = useState('RHOB');
    const [selectionMode, setSelectionMode] = useState('zoom');

    return (
        <Card className="h-full bg-slate-900 border-slate-800 flex flex-col shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    Interactive Crossplot
                </CardTitle>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1 bg-slate-950 rounded-md p-1 border border-slate-800">
                        <Toggle 
                            pressed={selectionMode === 'zoom'} 
                            onPressedChange={() => setSelectionMode('zoom')}
                            size="sm"
                            className="h-7 w-7 data-[state=on]:bg-slate-800"
                        >
                            <MousePointer2 className="w-4 h-4" />
                        </Toggle>
                        <Toggle 
                            pressed={selectionMode === 'lasso'} 
                            onPressedChange={() => setSelectionMode('lasso')}
                            size="sm"
                            className="h-7 w-7 data-[state=on]:bg-slate-800"
                        >
                            <PenTool className="w-4 h-4" />
                        </Toggle>
                    </div>
                    
                    <Select value={xCurve} onValueChange={setXCurve}>
                        <SelectTrigger className="h-8 w-24 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="NPHI">NPHI</SelectItem>
                            <SelectItem value="GR">GR</SelectItem>
                            <SelectItem value="DT">DT</SelectItem>
                            <SelectItem value="RT">RT</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-slate-500 text-xs">vs</span>
                    <Select value={yCurve} onValueChange={setYCurve}>
                        <SelectTrigger className="h-8 w-24 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="RHOB">RHOB</SelectItem>
                            <SelectItem value="NPHI">NPHI</SelectItem>
                            <SelectItem value="GR">GR</SelectItem>
                            <SelectItem value="DT">DT</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white"><Maximize2 className="w-4 h-4" /></Button>
                </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px] p-2 relative flex items-center justify-center text-slate-500">
                Chart removed
            </CardContent>
        </Card>
    );
};

export default FaciesCrossplots;

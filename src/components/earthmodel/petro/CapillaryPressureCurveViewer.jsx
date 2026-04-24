
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

const CapillaryPressureCurveViewer = () => {
  const [entryPressure, setEntryPressure] = useState(2);
  const [lambda, setLambda] = useState(1.5);

  return (
    <Card className="h-full bg-slate-900 border-slate-800">
      <CardHeader className="py-3">
        <CardTitle className="text-sm text-white">Capillary Pressure (Brooks-Corey)</CardTitle>
      </CardHeader>
      <CardContent className="h-full flex flex-col gap-4">
        <div className="flex-1 min-h-[250px] flex items-center justify-center text-slate-500 border border-slate-800 rounded">
          Chart removed
        </div>
        
        <div className="space-y-4 bg-slate-950 p-3 rounded border border-slate-800">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-slate-400">Entry Pressure (Pd)</Label>
              <span className="text-xs font-mono text-slate-200">{entryPressure} psi</span>
            </div>
            <Slider value={[entryPressure]} min={0.5} max={10} step={0.1} onValueChange={([v]) => setEntryPressure(v)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-slate-400">Pore Size Dist. (Lambda)</Label>
              <span className="text-xs font-mono text-slate-200">{lambda}</span>
            </div>
            <Slider value={[lambda]} min={0.5} max={5} step={0.1} onValueChange={([v]) => setLambda(v)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CapillaryPressureCurveViewer;

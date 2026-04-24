
import React, { useState } from 'react';
import { Label } from '@/components/ui/label';

const CrossPlot = ({ logData }) => {
  const [xAxis, setXAxis] = useState('NPHI');
  const [yAxis, setYAxis] = useState('RHOB');

  const availableCurves = Object.keys(logData);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-grow flex items-center justify-center text-slate-500 bg-white rounded">
        Chart removed
      </div>
      <div className="flex-shrink-0 p-2 flex items-center justify-center space-x-4">
        <div>
          <Label className="text-white">X-Axis:</Label>
          <select value={xAxis} onChange={(e) => setXAxis(e.target.value)} className="bg-slate-700 text-white p-1 rounded">
            {availableCurves.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-white">Y-Axis:</Label>
          <select value={yAxis} onChange={(e) => setYAxis(e.target.value)} className="bg-slate-700 text-white p-1 rounded">
            {availableCurves.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

export default CrossPlot;

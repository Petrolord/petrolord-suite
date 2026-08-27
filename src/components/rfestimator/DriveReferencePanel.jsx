// Drive-mechanism analog reference table (Recovery Factor Estimator
// main area). Moved verbatim from the pre-Studio page.
import React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { fmtPct } from '@/components/rfestimator/rfFields';

const DriveReferencePanel = () => {
  const { inputs, drives } = useRfEstimator();

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{inputs.phase === 'gas' ? 'Gas' : 'Oil'} drive-mechanism reference</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="text-left py-1.5 font-medium">Mechanism</th>
              <th className="text-right font-medium">Low</th>
              <th className="text-right font-medium">Typical</th>
              <th className="text-right font-medium">High</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((d) => (
              <tr key={d.code} className={`border-b border-slate-800/60 ${d.code === inputs.driveCode ? 'bg-lime-500/5' : ''}`}>
                <td className="py-1.5 text-slate-200">{d.label}</td>
                <td className="text-right font-mono text-slate-400">{fmtPct(d.low)}</td>
                <td className="text-right font-mono text-emerald-400">{fmtPct(d.typical)}</td>
                <td className="text-right font-mono text-slate-400">{fmtPct(d.high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Indicative screening ranges from industry literature — confirm against reservoir-specific data and simulation.
        </p>
      </CardContent>
    </Card>
  );
};

export default DriveReferencePanel;

// RF KPI cards + warnings (Recovery Factor Estimator right rail).
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { fmtPct, fmtRes } from '@/components/rfestimator/rfFields';

const Kpi = ({ title, value, accent }) => (
  <Card className={`bg-slate-900 border-slate-800 ${accent ? 'ring-1 ring-lime-500/30' : ''}`}>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-xl font-bold mt-1 text-slate-100">{value}</div>
    </CardContent>
  </Card>
);

const RfKpiPanel = () => {
  const { inputs, inPlace, result } = useRfEstimator();
  const { phase } = inputs;

  return (
    <div className="space-y-3">
      <Kpi title="Recovery Factor" value={fmtPct(result.rf)} accent />
      <Kpi title="RF Range (analog)" value={`${fmtPct(result.rfLow)} – ${fmtPct(result.rfHigh)}`} />
      <Kpi title={phase === 'gas' ? 'OGIP' : 'OOIP'} value={fmtRes(inPlace, phase)} />
      <Kpi title="Recoverable Reserves" value={fmtRes(result.reserves, phase)} accent />

      {result.warnings?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default RfKpiPanel;

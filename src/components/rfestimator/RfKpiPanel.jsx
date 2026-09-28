// RF KPI cards + warnings (Recovery Factor Estimator right rail).
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { fmtPct, fmtRes } from '@/components/rfestimator/rfFields';

const Kpi = ({ title, value, accent }) => (
  <Card className={accent ? 'ring-1 ring-pl-primary/30' : undefined}>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-pl-muted">{title}</div>
      <div className="text-xl font-bold mt-1 font-pl-mono tabular-nums text-pl-text">{value}</div>
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
        <div className="flex items-start gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2.5 text-pl-warning-text">
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

// RF KPI cards, flags and notes (Recovery Factor Estimator right rail).
// RF-U1: the basis of every number (RF of what, from where), the range named
// as the analog range edges, a withheld value with its reason, every flag,
// the sample state and a migrated project's note.
import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { fmtPct, fmtRes, methodLabel } from '@/components/rfestimator/rfFields';

const Kpi = ({ title, value, sub, accent, testId }) => (
  <Card className={accent ? 'ring-1 ring-pl-primary/30' : undefined}>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-pl-muted">{title}</div>
      <div className="text-xl font-bold mt-1 font-pl-mono tabular-nums text-pl-text" data-testid={testId}>{value}</div>
      {sub && <div className="text-[11px] text-pl-muted mt-1">{sub}</div>}
    </CardContent>
  </Card>
);

const RfKpiPanel = () => {
  const { inputs, derived, result, u, migration, inPlaceIntake } = useRfEstimator();
  const { phase } = inputs;
  const ip = phase === 'gas' ? 'OGIP' : 'OOIP';
  const ipFrom = inputs.inPlaceMode === 'direct'
    ? (inPlaceIntake ? `taken from ${inPlaceIntake.app}` : 'entered directly')
    : 'from the volumetrics on the left';

  return (
    <div className="space-y-3">
      {derived.isSample && (
        <div className="flex items-start gap-2 rounded-lg border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text" data-testid="rf-sample-banner">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Sample data: a water-drive oil case shipped with the app. Replace the values with your own; untouched sample values are labelled in the fields and the report.</span>
        </div>
      )}
      {migration?.note && (
        <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2 text-xs text-pl-warning-text" data-testid="rf-migration-note">{migration.note}</div>
      )}
      <Kpi title="Recovery Factor" value={fmtPct(result.rf)} accent testId="rf-kpi-rf"
        sub={`${methodLabel(result.method)}, fraction of ${ip}`} />
      <Kpi title="Analog range (edges)" value={`${fmtPct(result.rfLow)} to ${fmtPct(result.rfHigh)}`} testId="rf-kpi-range"
        sub={result.analog ? `${result.analog.label}; range edges, not P90 and P10` : 'No drive mechanism named'} />
      <Kpi title={ip} value={fmtRes(derived.inPlace, phase, u.system)} testId="rf-kpi-inplace" sub={ipFrom} />
      <Kpi title="Recoverable Reserves" value={fmtRes(result.reserves, phase, u.system)} accent testId="rf-kpi-reserves"
        sub={`RF x ${ip}; technically recoverable, no economic limit applied`} />

      {result.withheld && (
        <div className="rounded-lg border border-pl-danger/40 bg-pl-danger-bg px-3 py-2 text-xs text-pl-danger-text" data-testid="rf-withheld">{result.withheld}</div>
      )}
      {(result.warnings?.length > 0 || derived.flags.length > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-pl-warning/40 bg-pl-warning-bg px-3 py-2.5 text-pl-warning-text" data-testid="rf-flags">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            {result.warnings.map((w) => <div key={w}>{w}</div>)}
            {derived.flags.map((f) => <div key={`${f.scope}-${f.key}-${f.text}`}>{f.text}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default RfKpiPanel;

// Analysis summary (right rail).
import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { fmt, Row } from './fields';

const SummaryPanel = () => {
  const { analysis, result, forecast } = useGasWell();

  if (!analysis.ok || !result) {
    return (
      <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-3 space-y-2">
        <p className="text-xs font-semibold text-pl-warning-text flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Analysis cannot run
        </p>
        <ul className="text-[11px] text-pl-warning-text space-y-1 list-disc pl-4">
          {analysis.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    );
  }

  const c = result.loading.controlling;
  return (
    <div className="space-y-2">
      <Row label="Deliverability" value={`${fmt(result.qMscfd)} Mscf/d`} hint={`at ${fmt(result.whp)} psia wellhead`} />
      <Row label="Flowing bottomhole" value={`${fmt(result.pwfPsia)} psia`} />
      <Row label="Absolute open flow" value={`${fmt(result.aofMscfd)} Mscf/d`} />
      <Row
        label="Critical rate"
        value={`${fmt(c.criticalRateMscfd)} Mscf/d`}
        hint={`${result.correlation === 'turner' ? 'Turner' : 'Coleman'}, at ${fmt(c.depthFt)} ft`}
      />
      <Row
        label="Loading margin"
        value={`${fmt(result.loading.marginPct)} %`}
        hint={result.loading.loaded ? 'below the critical rate' : 'above the critical rate'}
      />
      {forecast?.crossingPrPsia && (
        <Row
          label="Loads at"
          value={`${fmt(forecast.crossingPrPsia)} psia`}
          hint="reservoir pressure, from the forecast run"
        />
      )}

      <div className="pt-2">
        {result.warnings.length === 0 ? (
          <p className="text-[11px] text-pl-success-text flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> The well is carrying its liquid with margin.
          </p>
        ) : (
          <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-2">
            <p className="text-[11px] font-semibold text-pl-warning-text">
              {result.warnings.length} thing{result.warnings.length === 1 ? '' : 's'} to look at
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPanel;

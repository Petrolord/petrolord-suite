// DCA U2-002: the rate against cumulative fit, beside the rate-time fit as a
// cross-check. Its window is a cumulative range in the display volume unit;
// blank ends take the whole history. EUR is read from the fitted line at the
// current economic limit (and terminal decline), and compared with the
// rate-time EUR of the forecast.
import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GitCompare } from 'lucide-react';
import DcaNumberField from '@/components/declineCurve/DcaNumberField';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import { rateCumEur, crossCheckPct } from '@/utils/declineCurve/rateCumFit';
import { formatDecline, declineBasisLabel } from '@/utils/declineCurve/declineDisplay';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const whole = (v) => (finite(v) ? Math.round(v).toLocaleString() : EMPTY_VALUE);

export default function DCARateCumCrossCheck() {
  const { selectedStream, streamState, rateCum, rateCumState, setRateCumWindow, runRateCumFit, currentWell } = useDeclineCurve();
  const u = useDcaUnits();
  const stream = selectedStream;
  const volU = u.volumeLabel(stream);
  const toView = (v) => u.volumeTo(stream, v);
  // the volume a person types, back to the state unit (bbl or Mscf)
  const toEngine = (v) => (finite(v) && u.volumeTo(stream, 1) ? v / u.volumeTo(stream, 1) : v);
  const s = streamState[stream];
  const r = rateCum.results;
  const eurRc = rateCumEur(r, s.forecastConfig);
  const eurRt = s.forecastResults?.eurTotal;
  const diff = crossCheckPct(eurRc, eurRt);
  const stale = rateCumState.state === 'stale';

  return (
    <div className="space-y-2 p-3 bg-pl-sunken rounded border border-pl-border" data-testid="dca-ratecum">
      <Label className="text-xs text-pl-muted uppercase flex items-center gap-1">
        <GitCompare size={12} aria-hidden="true" /> Rate against cumulative (cross-check)
      </Label>
      <p className="text-[10px] text-pl-muted">
        The same Arps model fitted to rate against cumulative production, which time does not enter: shut-ins and curtailment do not move it. Its window is a cumulative range; blank takes the whole history.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <DcaNumberField id="dca-rc-start" label="From cumulative" unit={volU} value={rateCum.window.cumStart} toView={toView} toEngine={toEngine}
          placeholder="first row" onCommit={(v) => setRateCumWindow('cumStart', v)} testId="dca-rc-start" labelClassName="text-[10px]" />
        <DcaNumberField id="dca-rc-end" label="To cumulative" unit={volU} value={rateCum.window.cumEnd} toView={toView} toEngine={toEngine}
          placeholder="last row" onCommit={(v) => setRateCumWindow('cumEnd', v)} testId="dca-rc-end" labelClassName="text-[10px]" />
      </div>
      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={runRateCumFit} disabled={!currentWell} data-testid="dca-rc-fit">
        Fit rate against cumulative
      </Button>
      {r && (
        <div className="text-[11px] text-pl-text space-y-0.5" data-testid="dca-rc-result">
          {stale && <p className="text-pl-warning-text" data-testid="dca-rc-stale">Out of date: {rateCumState.reasons.join(', ')}. Fit again.</p>}
          <p>{r.modelType}, {r.n} points, R² {finite(r.R2) ? r.R2.toFixed(4) : EMPTY_VALUE}</p>
          <p>qi at zero cumulative {finite(r.qi) ? u.rateTo(stream, r.qi).toFixed(2) : EMPTY_VALUE} {u.rateLabel(stream)}, Di {formatDecline(r.Di, u)} {declineBasisLabel(u)}, b {finite(r.b) ? Number(r.b.toPrecision(4)) : EMPTY_VALUE}</p>
          <p data-testid="dca-rc-eur">
            EUR {eurRc == null ? 'n/a (no economic limit)' : `${whole(toView(eurRc))} ${volU}`}
            {diff != null ? `; rate-time EUR ${whole(toView(eurRt))} ${volU}, ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : (eurRc != null ? '; run the forecast for the rate-time EUR' : '')}
          </p>
        </div>
      )}
    </div>
  );
}

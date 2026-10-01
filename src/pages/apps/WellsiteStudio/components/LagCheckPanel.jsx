// Lag check and washout (upgrade U2-004) in the dock under the lag: the
// strokes counted from a carbide or tracer drop to its return, what the
// engine makes of them (strokes down the string, measured against
// calculated lag, the excess volume, the washout of the open hole and its
// equivalent diameter), and the washout in force. A check is recorded as it
// was counted; applying it is a separate, signed decision.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth, parseFieldNumber } from '../services/units';
import { runLagCheck, TRACERS, volumeToM3, volumeFromM3 } from '../services/lagCheck';

const IN = 0.0254;

export default function LagCheckPanel({ lag, washout, checks = [], onRecord, onApply, unit, volumeUnit = 'bbl', offsetMin, canApply = true }) {
  const [strokes, setStrokes] = useState('');
  const [line, setLine] = useState('');
  const [tracer, setTracer] = useState('carbide');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const inp = 'bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-xs text-pl-text';
  const total = parseFieldNumber(strokes);
  const lineV = line.trim() === '' ? 0 : parseFieldNumber(line);
  const result = useMemo(() => {
    if (!lag || !lag.available || !(total > 0) || !(lineV >= 0)) return null;
    try { return runLagCheck({ lag, totalStrokes: total, surfaceLineM3: volumeToM3(lineV, volumeUnit) }); } catch (e) { return { error: e.message }; }
  }, [lag, total, lineV, volumeUnit]);
  const fv = (m3, dp = 1) => (Number.isFinite(m3) ? `${volumeFromM3(m3, volumeUnit).toFixed(dp)} ${volumeUnit}` : 'n/a');
  const pct = (f) => (Number.isFinite(f) ? `${(f * 100).toFixed(1)} %` : 'n/a');
  const last = checks[checks.length - 1] || null;
  const record = async (apply) => {
    setError('');
    if (!result || result.error) { setError(result ? result.error : 'Enter the strokes counted from the drop to the detection.'); return; }
    try {
      const row = await onRecord(result, { tracer });
      if (apply && result.applies) await onApply(result.washoutFraction, { lagCheckId: row ? row.id : null, basis: `Lag check at ${fmtDepth(result.bitMdM, unit)}` });
      setStrokes(''); setLine('');
    } catch (e) { setError(e.message); }
  };
  const applyManual = async () => {
    setError('');
    const v = parseFieldNumber(manual);
    if (!(v >= 0)) { setError('Enter the washout as a percent of the gauge open hole volume, zero or more.'); return; }
    try { await onApply(v / 100, { basis: 'Entered by hand' }); setManual(''); } catch (e) { setError(e.message); }
  };
  return (
    <div className="p-3 space-y-2 text-xs" data-testid="ws-lagcheck">
      <div className="text-[10px] uppercase tracking-wide text-pl-muted">Lag check and washout</div>
      <div className="flex justify-between gap-2">
        <span className="text-pl-muted">Washout in force</span>
        <span className="text-pl-text" data-testid="ws-lagcheck-inforce">{washout && washout.fraction > 0 ? `${pct(washout.fraction)} of the open hole, since ${toRigLocal(Date.parse(washout.atUtc), offsetMin).hhmm}` : 'none, gauge hole'}</span>
      </div>
      {!lag || !lag.available ? (
        <div className="text-pl-muted" data-testid="ws-lagcheck-note">A lag check needs the rig geometry, the pump and a bit depth.</div>
      ) : (
        <>
          <div className="flex items-end gap-1 flex-wrap">
            <label className="text-[10px] text-pl-muted">Strokes, drop to detection<br /><input className={`${inp} w-24`} inputMode="decimal" value={strokes} onChange={(e) => setStrokes(e.target.value)} data-testid="ws-lagcheck-strokes" /></label>
            <label className="text-[10px] text-pl-muted" title="Volume between the drop point and the top of the string; leave empty when the tracer goes straight into the pipe">Surface line ({volumeUnit})<br /><input className={`${inp} w-16`} inputMode="decimal" value={line} onChange={(e) => setLine(e.target.value)} data-testid="ws-lagcheck-line" /></label>
            <label className="text-[10px] text-pl-muted">Tracer<br />
              <select className={inp} value={tracer} onChange={(e) => setTracer(e.target.value)} data-testid="ws-lagcheck-tracer">{TRACERS.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
            </label>
          </div>
          {result && !result.error && (
            <div className="space-y-0.5" data-testid="ws-lagcheck-result">
              <Row label="Bit at the drop" value={fmtDepth(result.bitMdM, unit)} testId="ws-lagcheck-bit" />
              <Row label="Strokes down the string" value={`${result.downStrokes.toFixed(0)} stk (${fv(result.stringVolumeM3 + result.surfaceLineM3)})`} testId="ws-lagcheck-down" />
              <Row label="Measured lag" value={result.measuredLagStrokes > 0 ? `${result.measuredLagStrokes.toFixed(0)} stk` : 'n/a'} testId="ws-lagcheck-measured" />
              <Row label="Calculated lag, gauge hole" value={`${result.calculatedLagStrokes.toFixed(0)} stk`} testId="ws-lagcheck-calculated" />
              {Number.isFinite(result.differenceStrokes) && <Row label="Difference" value={`${result.differenceStrokes >= 0 ? '+' : ''}${result.differenceStrokes.toFixed(0)} stk (${pct(result.differenceFraction)}), ${fv(result.excessM3)}`} testId="ws-lagcheck-diff" />}
              {result.applies && <Row label="Washout, of the gauge open hole volume" value={pct(result.washoutFraction)} testId="ws-lagcheck-washout" />}
              {result.equivalentDiameters.length > 0 && <Row label="Equivalent open hole diameter" value={result.equivalentDiameters.map((d) => `${(d.equivalentIdM / IN).toFixed(2)} in (gauge ${(d.gaugeIdM / IN).toFixed(2)} in)`).join(', ')} testId="ws-lagcheck-diameter" />}
              {result.note && <div className="text-pl-warning-text" data-testid="ws-lagcheck-engine-note">{result.note}</div>}
            </div>
          )}
          {result && result.error && <div className="text-pl-warning-text" data-testid="ws-lagcheck-error">{result.error}</div>}
          <div className="flex items-center gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => record(false)} disabled={!result || !!result.error} data-testid="ws-lagcheck-record">Record check</Button>
            <Button size="sm" onClick={() => record(true)} disabled={!canApply || !result || !!result.error || !result.applies} data-testid="ws-lagcheck-apply" title="Record the check and correct the lag for the washout it measured">Record and apply washout</Button>
          </div>
        </>
      )}
      <div className="flex items-end gap-1 flex-wrap">
        <label className="text-[10px] text-pl-muted" title="From a caliper or the driller: percent of the gauge open hole volume. Zero clears the washout.">Washout by hand (%)<br /><input className={`${inp} w-16`} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} data-testid="ws-lagcheck-manual" /></label>
        <Button size="sm" variant="outline" onClick={applyManual} disabled={!canApply || manual.trim() === ''} data-testid="ws-lagcheck-manual-apply">Apply</Button>
        {washout && washout.fraction > 0 && <Button size="sm" variant="ghost" onClick={() => onApply(0, { basis: 'Cleared' }).catch((e) => setError(e.message))} disabled={!canApply} data-testid="ws-lagcheck-clear">Clear</Button>}
      </div>
      {error && <div className="text-pl-warning-text" data-testid="ws-lagcheck-form-error">{error}</div>}
      {last && (
        <div className="text-[10px] text-pl-muted" data-testid="ws-lagcheck-last">
          Last check {toRigLocal(Date.parse(last.occurred_at), offsetMin).hhmm} at {fmtDepth(last.payload.bit_md_m, unit)}: {Number.isFinite(last.payload.measured_lag_strokes) ? `${last.payload.measured_lag_strokes.toFixed(0)} stk measured` : 'no lag measured'}, {last.payload.calculated_lag_strokes.toFixed(0)} stk calculated{Number.isFinite(last.payload.washout_fraction) ? `, washout ${pct(last.payload.washout_fraction)}` : ''}. {checks.length} check(s) on record.
        </div>
      )}
      <div className="text-[10px] text-pl-muted">The strokes to pump the tracer down the string are taken off the count. The excess volume is put in the open hole; cased hole and the riser are steel.</div>
    </div>
  );
}

function Row({ label, value, testId }) {
  return <div className="flex justify-between gap-2"><span className="text-pl-muted">{label}</span><span className="text-pl-text text-right" data-testid={testId}>{value}</span></div>;
}

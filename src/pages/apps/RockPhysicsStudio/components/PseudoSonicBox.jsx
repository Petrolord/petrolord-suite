// Estimated sonic box (U2-007): shown under the curve inventory when the
// selected well has no sonic log. It says plainly that Vp is an estimate,
// lets the user choose the transform and its constant, calibrate on a
// registry well that has a sonic (with the misfit there), and publish the
// estimate to the well as DT_EST. Presentational; state lives in
// RockWorkstation (rock.pseudoSonic, saved with the project).

import React, { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { PSEUDO_METHODS, LIVE_CHECK, misfitText } from '../services/pseudoSonic';

const INPUT = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text';

export default function PseudoSonicBox({
  cfg, note, onChange, sonicWells = null, onFindWells, onCalibrate, calibration = null, busy = false,
  onPublish = null, publishing = false, error = '',
}) {
  const active = cfg.method === 'faust' ? 'faustGamma' : 'gardnerA';
  const [text, setText] = useState(String(Number(cfg[active].toFixed(4))));
  useEffect(() => { setText(String(Number(cfg[active].toFixed(4)))); }, [cfg, active]);
  const cal = calibration ? (cfg.method === 'faust' ? calibration.result.faust : calibration.result.gardner) : null;
  return (
    <div className="mt-1 rounded border border-pl-warning bg-pl-warning-bg p-1.5 text-[11px] text-pl-warning-text space-y-1" data-testid="rp-pseudo-box">
      <div className="font-semibold">Vp is estimated: this well has no sonic log</div>
      <div data-testid="rp-pseudo-note">{note}.</div>
      <label className="flex items-center justify-between gap-1">
        <span>Method</span>
        <select data-testid="rp-pseudo-method" value={cfg.method} onChange={(e) => onChange({ method: e.target.value })} className={`${INPUT} max-w-[150px]`}>
          {PSEUDO_METHODS.map((m) => (
            <option key={m.key} value={m.key} disabled={!cfg.available.includes(m.key)}>
              {m.label}{cfg.available.includes(m.key) ? '' : ` (no ${m.needs} curve)`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-1" title={cfg.method === 'faust' ? 'Faust constant: V = constant x (Z R)^(1/6), V in ft/s, Z in ft, R in ohm m; published 1948' : 'Gardner coefficient a: rho = a V^0.25, rho in g/cc, V in ft/s; published 0.23'}>
        <span>{cfg.method === 'faust' ? 'Faust constant' : 'Gardner coefficient a'}</span>
        <input
          data-testid="rp-pseudo-constant"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v > 0) onChange({ [active]: v, calibratedOn: null });
          }}
          onBlur={() => setText(String(Number(cfg[active].toFixed(4))))}
          className={`${INPUT} w-16 text-right`}
        />
      </label>
      <div className="flex items-center gap-1">
        {sonicWells === null ? (
          <button type="button" data-testid="rp-pseudo-find" disabled={busy} onClick={onFindWells} className="px-1.5 py-0.5 rounded border border-pl-warning hover:bg-pl-surface disabled:opacity-50">
            {busy ? <Loader2 className="inline w-3 h-3 animate-spin" /> : null} Calibrate on a well with a sonic
          </button>
        ) : sonicWells.length ? (
          <select data-testid="rp-pseudo-calibrate" value="" disabled={busy} onChange={(e) => { if (e.target.value) onCalibrate(e.target.value); }} className={`${INPUT} flex-1 min-w-0`}>
            <option value="">{busy ? 'Calibrating...' : 'Calibrate on...'}</option>
            {sonicWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : (
          <span data-testid="rp-pseudo-none">No other well you can see has a sonic log to calibrate on.</span>
        )}
      </div>
      {calibration && (
        <div data-testid="rp-pseudo-calibration" className="space-y-0.5">
          {cal ? (
            <>
              <div>On {calibration.wellName}, published constant: {misfitText(cal.published)}.</div>
              <div>Fitted there ({cfg.method === 'faust' ? cal.gamma.toFixed(0) : cal.a.toFixed(4)}): {misfitText(cal.calibrated)}. This is the fit on the calibration well, the best case; the error on this well is unknown.</div>
            </>
          ) : <div>{calibration.result.errors.join(' ')}</div>}
        </div>
      )}
      {error && <div data-testid="rp-pseudo-error">{error}</div>}
      <div className="text-pl-text" data-testid="rp-pseudo-live">{LIVE_CHECK.sentence}</div>
      {onPublish && (
        <button type="button" data-testid="rp-pseudo-publish" disabled={publishing} onClick={onPublish} title="Write the estimate to this well as DT_EST (us/m), described as estimated, with the method and constants in its provenance. Overwrites only this project's previous publish." className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-pl-warning hover:bg-pl-surface disabled:opacity-50">
          {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Publish estimated sonic (DT_EST)
        </button>
      )}
    </div>
  );
}

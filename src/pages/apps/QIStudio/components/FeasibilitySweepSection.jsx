// Automatic feasibility sweeps under the Feasibility cards (QI upgrade P2.9,
// 2026-10-15): per target, the rock and fluid inputs, the sweep of porosity,
// shale volume, effective stress and thickness, the separability table and
// the suggested verdict, which the user may take or leave. Runs in the
// browser (engines qi/feasibilitySweep.js). White chart theme rule: tables
// only here.
import React, { useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';
import { SWEEP_DEFAULTS, sweepProblem, runSweep } from '../services/feasibilitySweepRun';
import { FEASIBILITY_VERDICTS } from '../services/model';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const input = 'rounded border border-pl-border bg-pl-surface px-1.5 py-0.5 text-xs text-pl-text w-24';
const VAR = { phi: 'Porosity', vsh: 'Shale volume', peffMPa: 'Effective stress (MPa)', thicknessM: 'Thickness (m)' };
const VERDICT = Object.fromEntries(FEASIBILITY_VERDICTS.map((v) => [v.key, v.label]));
const g = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);
const FIELDS = [
  ['phi', 'Porosity (fraction)'], ['vsh', 'Shale volume (fraction)'], ['ntg', 'Net-to-gross'], ['thicknessM', 'Thickness (m)'],
  ['overburdenMPa', 'Overburden stress (MPa)'], ['porePressureMPa', 'Pore pressure (MPa)'], ['tC', 'Temperature (C)'], ['salinity', 'Brine salinity (fraction)'],
  ['shaleVp', 'Shale Vp (m/s)'], ['shaleVs', 'Shale Vs (m/s)'], ['shaleRho', 'Shale density (kg/m3)'], ['freqHz', 'Wavelet peak (Hz)'], ['snr', 'Signal-to-noise'],
];

function TargetSweep({ target }) {
  const { project, setFeasibility, canWrite } = useQIStudio();
  const f = project.feasibility?.[target] || {};
  const [form, setForm] = useState(() => ({ ...SWEEP_DEFAULTS, ...(f.sweep?.inputs || {}) }));
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const problem = sweepProblem(form);
  const run = () => {
    setError(null);
    try {
      const r = runSweep(form);
      const compact = (row) => ({ variable: row.variable, value: row.value, ampA: row.ampA, ampB: row.ampB, dprime: row.dprime, misclass: row.misclass, separable: row.separable });
      setFeasibility(target, { sweep: { at: new Date().toISOString(), inputs: form, base: compact(r.sweep.base), rows: r.sweep.rows.map(compact), noiseSd: r.sweep.noiseSd, anglesDeg: r.sweep.anglesDeg, threshold: r.sweep.threshold, ranges: r.ranges, suggestion: r.suggestion } });
    } catch (e) { setError(e.message); }
  };
  const sw = f.sweep;
  return (
    <details className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid={`qi-feas-sweep-${target}`}>
      <summary className="cursor-pointer text-pl-text">{`${target}: automatic feasibility sweep`}</summary>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="flex flex-col"><span className="text-pl-muted">{label}</span>
            <input className={input} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} data-testid={`qi-feas-sweep-${k}`} />
          </label>
        ))}
        <label className="flex flex-col"><span className="text-pl-muted">Hydrocarbon</span>
          <select className={input} value={form.hc} onChange={(e) => set('hc', e.target.value)} disabled={!canWrite} data-testid="qi-feas-sweep-hc"><option value="gas">Gas</option><option value="oil">Oil</option></select>
        </label>
        {form.hc === 'gas'
          ? <label className="flex flex-col"><span className="text-pl-muted">Gas gravity</span><input className={input} value={form.gasGravity} onChange={(e) => set('gasGravity', e.target.value)} disabled={!canWrite} /></label>
          : (<><label className="flex flex-col"><span className="text-pl-muted">Oil API</span><input className={input} value={form.api} onChange={(e) => set('api', e.target.value)} disabled={!canWrite} /></label>
            <label className="flex flex-col"><span className="text-pl-muted">GOR (L/L)</span><input className={input} value={form.gor} onChange={(e) => set('gor', e.target.value)} disabled={!canWrite} /></label></>)}
        <label className="flex flex-col"><span className="text-pl-muted">Sand model</span>
          <select className={input} value={form.model} onChange={(e) => set('model', e.target.value)} disabled={!canWrite}><option value="soft">Soft sand</option><option value="stiff">Stiff sand</option></select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {[['phiRange', 'Porosities to sweep'], ['vshRange', 'Shale volumes to sweep'], ['peffRange', 'Effective stresses to sweep (MPa)'], ['thicknessRange', 'Thicknesses to sweep (m)']].map(([k, label]) => (
          <label key={k} className="flex items-center gap-2"><span className="text-pl-muted w-56">{label}</span><input className={`${input} flex-1`} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} data-testid={`qi-feas-sweep-${k}`} /></label>
        ))}
      </div>
      <p className={muted}>The sand is modelled from porosity, shale volume and effective stress (overburden minus pore pressure), saturated by Gassmann with brine or the hydrocarbon at the reservoir temperature and pressure (Batzle and Wang), thin-bedded with the shale at the net-to-gross by Backus averaging, and set in the shale at the thickness. Each case&apos;s peak amplitude near the top of the bed is read under a Ricker wavelet at normal incidence and 30 degrees; the two cases separate when they differ by d&apos; of 2 or more against the noise (the brine amplitude of a thick bed over the signal-to-noise ratio, for example the seismic QC median).</p>
      {problem && <p className="text-pl-warning-text" data-testid="qi-feas-sweep-problem">{problem}</p>}
      {error && <p className="text-pl-danger-text">{error}</p>}
      <button type="button" className={btn} onClick={run} disabled={!canWrite || !!problem} data-testid="qi-feas-sweep-run">Run the sweep</button>
      {sw && (
        <div className="space-y-2" data-testid={`qi-feas-sweep-result-${target}`}>
          <table className="text-xs">
            <thead><tr><th className={th}>Varied</th><th className={th}>Value</th><th className={th}>Brine amplitude</th><th className={th}>Hydrocarbon amplitude</th><th className={th}>d&apos; at 0 degrees</th><th className={th}>d&apos; at 30</th><th className={th}>Wrong case (percent)</th><th className={th}>Separable</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {[sw.base, ...sw.rows].map((r, i) => (
                <tr key={`${r.variable}-${r.value}-${i}`}>
                  <td className={`${td} font-sans`}>{r.variable ? VAR[r.variable] : 'Base case'}</td><td className={td}>{r.variable ? r.value : EMPTY_VALUE}</td>
                  <td className={td}>{g(r.ampA[0], 3)}</td><td className={td}>{g(r.ampB[0], 3)}</td><td className={td}>{g(r.dprime[0])}</td><td className={td}>{g(r.dprime[1])}</td>
                  <td className={td}>{g(100 * Math.min(...r.misclass), 0)}</td><td className={`${td} font-sans`}>{r.separable ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-pl-text" data-testid={`qi-feas-sweep-suggestion-${target}`}>{`Suggested verdict: ${VERDICT[sw.suggestion.verdict]}. ${sw.suggestion.text}`}</p>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => setFeasibility(target, { verdict: sw.suggestion.verdict })} data-testid={`qi-feas-sweep-use-${target}`}>Use the suggested verdict</button>
              <button type="button" className={btn} onClick={() => setFeasibility(target, { separability: [f.separability, `Sweep ${String(sw.at).slice(0, 10)}: ${sw.suggestion.text}`].filter(Boolean).join(' ') })} data-testid={`qi-feas-sweep-note-${target}`}>Add to the separability reasoning</button>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

export default function FeasibilitySweepSection() {
  const { project } = useQIStudio();
  if (!project.targets.length) return null;
  return (
    <section className={card} data-testid="qi-feas-sweeps">
      <h2 className="text-sm font-semibold text-pl-text">Automatic feasibility sweeps</h2>
      <p className={muted}>For each target, how well the seismic could tell the hydrocarbon case from brine as porosity, shale volume, effective stress and thickness change. The suggestion is yours to take or leave; the verdict above stays as you set it.</p>
      {project.targets.map((t) => <TargetSweep key={t} target={t} />)}
    </section>
  );
}

// Spectral balancing of the angle stacks (QI round 3, 2026-10-15): one
// zero-phase operator per stack, from its mean spectrum to the reference
// stack's (or flat in a band), on the seismic worker (spectral_balance). Each
// stack keeps its own band energy and its traces keep their relative
// amplitudes, so balancing goes before Match the stacks and AVO. The balanced
// stacks join the study's volumes.
import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label, Legend } from 'recharts';
import * as qiService from '@/lib/qiService';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';

const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const LABEL_STYLE = { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize };
const LINE_COLOURS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#dc2626', '#0f172a'];

const isNum = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

/** The job settings, or { error } (typed values arrive as text). */
export function balanceParams({ target, reference, lo, hi, maxGain }, stackIds) {
  if (!stackIds.length) return { error: 'Choose the stacks on the AVO form above.' };
  if (target === 'reference' && !reference) return { error: 'Choose the reference stack.' };
  if (![lo, hi, maxGain].every(isNum)) return { error: 'Give the band and the largest boost as numbers.' };
  if (!(Number(lo) >= 1 && Number(hi) > Number(lo) + 5)) return { error: 'The band needs a low frequency of 1 Hz or more and a high one at least 5 Hz above it.' };
  if (!(Number(maxGain) >= 0 && Number(maxGain) <= 40)) return { error: 'The largest boost must be 0 to 40 dB.' };
  return { params: { target, ...(target === 'reference' ? { reference_volume_id: reference } : {}), f_lo_hz: Number(lo), f_hi_hz: Number(hi), max_gain_db: Number(maxGain) } };
}

const hz = (v) => (Number.isFinite(v) ? v.toFixed(1) : EMPTY_VALUE);
const band = (b) => (Array.isArray(b) ? `${b[0].toFixed(0)} to ${b[1].toFixed(0)}` : EMPTY_VALUE);

/** The chart rows: one per frequency, one column per stack's gain. */
export function operatorRows(stacks) {
  const freqs = [...new Set(stacks.flatMap((s) => (s.operator || []).map(([f]) => f)))].sort((a, b) => a - b);
  return freqs.map((f) => Object.fromEntries([['f', f], ...stacks.map((s, k) => [`s${k}`, (s.operator || []).find(([g]) => g === f)?.[1] ?? null])]));
}

export default function SpectralBalanceSection({ chosenVolumes, stackIds }) {
  const { backend, jobs, project, setAvo, canWrite } = useQIStudio();
  const client = jobs || qiService;
  const [form, setForm] = useState({ target: 'reference', reference: '', lo: '8', hi: '60', maxGain: '20' });
  const [st, setSt] = useState(null);
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const targets = stackIds.filter((id) => form.target === 'flat' || id !== form.reference);
  const built = balanceParams(form, targets);
  const busy = st?.job && qiService.isActive(st.job);
  const rec = project.avo?.balancing || null;

  const run = async () => {
    const refVol = chosenVolumes.find((v) => v.id === form.reference);
    const vols = targets.map((id) => chosenVolumes.find((v) => v.id === id)).filter(Boolean);
    const suffix = form.target === 'reference' ? `balanced to ${refVol?.name}` : `balanced flat ${form.lo} to ${form.hi} Hz`;
    setSt({ job: { status: 'queued' } });
    const rows = [];
    try {
      for (const v of vols) rows.push({ v, row: await backend.registerBalancedVolume({ volume: v, name: `${v.name} ${suffix}`, summary: { target: form.target, ...(refVol ? { reference_volume_id: refVol.id } : {}) } }) });
      const jobId = await client.enqueueJob('spectral_balance', { stacks: vols.map((v) => v.id), volume_ids: Object.fromEntries(rows.map((r) => [r.v.id, r.row.id])), ...built.params, name: `Stacks ${suffix}` });
      stops.current.push(client.watchJob(jobId, (row, err) => {
        setSt(err ? { error: qiService.friendlyError(err) } : { job: row });
        if (row?.status === 'succeeded') setAvo({ balancing: { at: row.finished_at || new Date().toISOString(), target: form.target, reference: refVol?.name || null, f_lo_hz: row.result_refs.f_lo_hz, f_hi_hz: row.result_refs.f_hi_hz, stacks: row.result_refs.stacks } });
      }));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setSt({ error: qiService.friendlyError(e) });
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid="qi-avo-balance">
      <h3 className="text-xs font-semibold text-pl-text">Balance the spectra</h3>
      <p className={muted}>Far stacks usually carry lower frequencies than near stacks, so the same interface looks different on each and AVO compares unlike wavelets. Give the stacks chosen above one bandwidth: one zero-phase operator per stack takes its mean spectrum (about 300 traces across the survey) to the reference stack&apos;s, or to flat inside a band. Each stack keeps its own level and every trace keeps its amplitude relative to its neighbours, so do this first, then Match the stacks.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">Target
          <select className={input} value={form.target} onChange={set('target')} data-testid="qi-avo-balance-target"><option value="reference">a reference stack&apos;s spectrum</option><option value="flat">flat inside the band</option></select>
        </label>
        {form.target === 'reference' && (
          <label className="flex items-center gap-1">Reference
            <select className={input} value={form.reference} onChange={set('reference')} data-testid="qi-avo-balance-ref"><option value="">choose</option>{chosenVolumes.filter((v) => stackIds.includes(v.id)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          </label>
        )}
        <label className="flex items-center gap-1">Band (Hz)<input className={`${input} w-14`} type="number" value={form.lo} onChange={set('lo')} aria-label="Band from" /><input className={`${input} w-14`} type="number" value={form.hi} onChange={set('hi')} aria-label="Band to" /></label>
        <label className="flex items-center gap-1" title="Caps the boost where a stack has little energy, so noise is not lifted">Largest boost (dB)<input className={`${input} w-14`} type="number" value={form.maxGain} onChange={set('maxGain')} /></label>
        <button type="button" className={btn} onClick={run} disabled={!canWrite || !!built.error || busy} data-testid="qi-avo-balance-run">Balance the stacks</button>
        {st?.error && <span className="text-pl-danger-text">{st.error}</span>}
        {st?.job?.status === 'failed' && <span className="text-pl-danger-text">{st.job.error_message || 'The job failed.'}</span>}
        {busy && <span className="text-pl-muted">{st.job.status}</span>}
      </div>
      {built.error && stackIds.length > 0 && <p className="text-pl-warning-text">{built.error}</p>}
      {rec && (
        <div className="space-y-2" data-testid="qi-avo-balance-result">
          <p className="text-pl-text">{`Balanced ${rec.target === 'reference' ? `to ${rec.reference}` : 'flat'} between ${rec.f_lo_hz} and ${rec.f_hi_hz} Hz. The balanced stacks join the study's volumes; choose them on Setup and above.`}</p>
          <table className="text-xs">
            <thead><tr><th className={th}>Stack</th><th className={th}>Band centroid (Hz), before and after</th>{rec.target === 'reference' && <th className={th}>Reference centroid (Hz)</th>}<th className={th}>Half-power band (Hz), before and after</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {rec.stacks.map((s) => <tr key={s.stack_id}><td className={`${td} font-sans`}>{s.stack_name}</td><td className={td}>{`${hz(s.centroid_hz_before)} to ${hz(s.centroid_hz_after)}`}</td>{rec.target === 'reference' && <td className={td}>{hz(s.centroid_hz_reference)}</td>}<td className={td}>{`${band(s.band_half_power_before)}; ${band(s.band_half_power_after)}`}</td></tr>)}
            </tbody>
          </table>
          {rec.stacks.some((s) => s.operator?.length) && (
            <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 260, maxWidth: 560 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={operatorRows(rec.stacks)} margin={CHART_MARGINS.standard}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis type="number" dataKey="f" tick={AXIS_TICK}><Label value="Frequency (Hz)" position="insideBottom" offset={-5} style={LABEL_STYLE} /></XAxis>
                  <YAxis tick={AXIS_TICK} tickFormatter={(v) => v.toFixed(1)}><Label value="Operator gain" angle={-90} position="insideLeft" style={LABEL_STYLE} /></YAxis>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toFixed(2)} labelFormatter={(f) => `${f} Hz`} />
                  <Legend />
                  {rec.stacks.map((s, k) => <Line key={s.stack_id} type="monotone" dataKey={`s${k}`} name={s.stack_name} stroke={LINE_COLOURS[k % LINE_COLOURS.length]} dot={false} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

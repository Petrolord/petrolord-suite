// Prestack simultaneous inversion (QI programme Q8b, 2026-10-07; SOW
// section 9): AI, SI and density at once from three to six angle stacks,
// with the tie wavelet scaled to the stacks at the wells and three
// horizon-guided low-frequency models, on the seismic worker
// (prestack_inversion). The blind-well table checks each parameter; the
// products are AI, SI, density and Vp/Vs.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import { prepareWell } from '../services/inversionWells';
import { waveletChoices } from './InversionPanel';
import ExportControls from './ExportControls';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : EMPTY_VALUE);
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : EMPTY_VALUE);

/** Why the stacks cannot run, or null. */
export function simultaneousProblem(stacks) {
  const live = stacks.filter((s) => s.volumeId);
  if (live.length < 3) return 'Choose three to six angle stacks.';
  if (new Set(live.map((s) => s.volumeId)).size !== live.length) return 'Each stack must be a different volume.';
  if (live.some((s) => !(Number(s.angle) >= 0 && Number(s.angle) <= 50))) return 'Give each stack its mean angle, 0 to 50 degrees.';
  if (Math.max(...live.map((s) => Number(s.angle))) < 25) return 'The farthest stack should reach 25 degrees or more: density needs the far angles.';
  return null;
}

export default function SimultaneousPanel() {
  const { chosenVolumes, ready, project, setSimultaneous, backend, jobs, canWrite } = useQIStudio();
  const client = jobs || qiService;
  const [stacks, setStacks] = useState(Array.from({ length: 5 }, () => ({ volumeId: '', angle: '' })));
  const [wKey, setWKey] = useState('');
  const [hz, setHz] = useState([]);
  const [horizons, setHorizons] = useState([]);
  const [prep, setPrep] = useState(null);
  const [st, setSt] = useState({});
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const choices = useMemo(() => waveletChoices(ready), [ready]);
  const wavelet = choices.find((c) => c.key === wKey) || choices[0] || null;
  const live = stacks.filter((s) => s.volumeId);
  const first = chosenVolumes.find((v) => v.id === live[0]?.volumeId) || null;
  useEffect(() => {
    setHorizons([]); setHz([]);
    if (!first || !backend?.listHorizons) return undefined;
    let ok = true;
    backend.listHorizons(first.id).then((h) => { if (ok) setHorizons(h || []); }).catch(() => {});
    return () => { ok = false; };
  }, [first?.id, backend]); // eslint-disable-line react-hooks/exhaustive-deps
  const problem = simultaneousProblem(stacks) || (!wavelet ? 'No well in the study has a stored tie wavelet.' : null);
  const saved = project.simultaneous || {};
  const usable = (prep?.wells || []).filter((w) => w.ok && w.elastic?.ln_si);

  const readWells = async () => {
    setPrep({ busy: true });
    try {
      const frame = await backend.loadVolumeFrame(first);
      const wells = [];
      for (const r of ready) wells.push(await prepareWell(r, frame, backend.downloadCurve, { extras: ['elastic'] }));
      setPrep({ wells });
    } catch (e) { setPrep({ error: e.message }); }
  };
  const block = () => ({
    stacks: live.map((s) => ({ volume_id: s.volumeId, angle: Number(s.angle) })),
    wavelet: { samples: wavelet.samples, dt_ms: wavelet.dtMs },
    wells: usable.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, ln_si: w.elastic.ln_si, ln_rho: w.elastic.ln_rho })),
    horizon_ids: hz,
  });
  const watch = (mode, jobId, onDone) => stops.current.push(client.watchJob(jobId, (row, err) => {
    setSt((m) => ({ ...m, [mode]: err ? { error: qiService.friendlyError(err) } : { job: row } }));
    if (row?.status === 'succeeded') onDone(row);
  }));
  const runBlind = async () => {
    setSt((m) => ({ ...m, blind: { job: { status: 'queued' } } }));
    try {
      const jobId = await client.enqueueJob('prestack_inversion', { mode: 'blind', name: `${first.name} simultaneous, blind wells`, inversion: block() });
      watch('blind', jobId, (row) => setSimultaneous({ blind: { at: row.finished_at || new Date().toISOString(), volumeName: first.name, result: row.result_refs } }));
    } catch (e) { setSt((m) => ({ ...m, blind: { error: qiService.friendlyError(e) } })); }
  };
  const runVolume = async () => {
    setSt((m) => ({ ...m, volume: { job: { status: 'queued' } } }));
    const rows = [];
    try {
      for (const [k, label] of [['ai', 'AI'], ['si', 'SI'], ['rho', 'density'], ['vpvs', 'Vp/Vs']]) rows.push({ k, row: await backend.registerPrestackVolume({ volume: first, name: `${first.name} ${label}, simultaneous`, summary: { product: k, qi_class: 'elastic_estimate' } }) });
      const ids = Object.fromEntries(rows.map((r) => [r.k, r.row.id]));
      const jobId = await client.enqueueJob('prestack_inversion', { mode: 'volume', volume_ids: ids, name: `${first.name} simultaneous inversion`, inversion: block() });
      setSimultaneous((cur) => ({ runs: [...(cur.runs || []), { jobId, volumeIds: ids, firstVolumeId: first.id, name: `${first.name}: AI, SI, density, Vp/Vs`, at: new Date().toISOString(), status: 'queued' }] }));
      watch('volume', jobId, (row) => setSimultaneous((cur) => ({ runs: (cur.runs || []).map((r) => (r.jobId === jobId ? { ...r, status: 'ready', at: row.finished_at || r.at } : r)) })));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setSt((m) => ({ ...m, volume: { error: qiService.friendlyError(e) } }));
    }
  };
  const status = (k) => {
    const s = st[k];
    if (!s) return null;
    if (s.error) return <span className="text-pl-danger-text">{s.error}</span>;
    if (s.job?.status === 'failed') return <span className="text-pl-danger-text">{s.job.error_message || 'The job failed.'}</span>;
    if (qiService.isActive(s.job)) return <span className="text-pl-muted">{s.job.status}</span>;
    return null;
  };
  const busy = (k) => !!st[k]?.job && qiService.isActive(st[k].job);

  if (chosenVolumes.length < 3) return <section className={card}><p className={muted}>Choose at least three angle stack volumes on Setup for a simultaneous inversion.</p></section>;
  return (
    <section className={card} data-testid="qi-sim">
      <h2 className="text-sm font-semibold text-pl-text">Simultaneous inversion</h2>
      <p className={muted}>Acoustic impedance, shear impedance and density at once from three to six angle stacks (Fatti three-term), each pulled to its own low-frequency model from the wells along your horizons. Density needs the far angles: give at least one stack past 25 degrees. The wavelet is scaled to the stacks at the wells. Runs on the seismic worker.</p>
      <div className="space-y-1 text-xs">
        {stacks.map((s, k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <select className={input} value={s.volumeId} onChange={(e) => setStacks((x) => x.map((y, j) => (j === k ? { ...y, volumeId: e.target.value } : y)))} data-testid={`qi-sim-stack-${k}`} aria-label={`Stack ${k + 1}`}>
              <option value="">{k < 3 ? 'choose a stack' : 'none'}</option>
              {chosenVolumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <label className="flex items-center gap-1">mean angle<input className={`${input} w-16`} type="number" value={s.angle} onChange={(e) => setStacks((x) => x.map((y, j) => (j === k ? { ...y, angle: e.target.value } : y)))} data-testid={`qi-sim-angle-${k}`} /></label>
          </div>
        ))}
        <label className="flex items-center gap-1">Wavelet
          <select className={input} value={wavelet?.key || ''} onChange={(e) => setWKey(e.target.value)}>
            {choices.length ? choices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>) : <option value="">No stored tie wavelet</option>}
          </select>
        </label>
        {horizons.length > 0 && (
          <div className="flex flex-wrap items-center gap-3"><span className="text-pl-muted">Horizons:</span>
            {horizons.map((h) => <label key={h.id} className="flex items-center gap-1"><input type="checkbox" checked={hz.includes(h.id)} onChange={() => setHz((x) => (x.includes(h.id) ? x.filter((y) => y !== h.id) : [...x, h.id]))} />{h.name}</label>)}
          </div>
        )}
        {problem && <p className="text-pl-warning-text">{problem}</p>}
        <button type="button" className={btn} onClick={readWells} disabled={!!problem || prep?.busy} data-testid="qi-sim-read">{prep?.busy ? 'Reading the wells' : 'Read the wells'}</button>
        {prep?.error && <p className="text-pl-danger-text">{prep.error}</p>}
        {prep?.wells && (
          <table className="text-xs" data-testid="qi-sim-wells">
            <thead><tr><th className={th}>Well</th><th className={th}>Curves</th></tr></thead>
            <tbody>
              {prep.wells.map((w) => (
                <tr key={w.wellId}><td className={td}>{w.name}</td><td className={w.ok && w.elastic?.ln_si ? td : `${td} text-pl-warning-text`}>{!w.ok ? w.reason : w.elastic?.ln_si ? `${w.curves}, ${w.elastic.curves}` : w.elastic?.reason}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {prep?.wells && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} onClick={runBlind} disabled={!canWrite || usable.length < 2 || busy('blind')} data-testid="qi-sim-blind">Check at the wells (blind)</button>{status('blind')}
            <button type="button" className={btn} onClick={runVolume} disabled={!canWrite || usable.length < 1 || busy('volume')} data-testid="qi-sim-run">Invert the stacks</button>{status('volume')}
          </div>
        )}
      </div>
      {saved.blind?.result && (
        <table className="text-xs" data-testid="qi-sim-blind-table">
          <thead><tr><th className={th}>Well</th><th className={th}>AI error (percent)</th><th className={th}>SI error</th><th className={th}>Density error</th><th className={th}>Density correlation</th></tr></thead>
          <tbody className="font-mono tabular-nums">
            {saved.blind.result.blind.map((r) => <tr key={r.name}><td className={`${td} font-sans`}>{r.name}</td><td className={td}>{f1(r.blind.ai.rmsPct)}</td><td className={td}>{f1(r.blind.si.rmsPct)}</td><td className={td}>{f1(r.blind.rho.rmsPct)}</td><td className={td}>{f2(r.blind.rho.corr)}</td></tr>)}
          </tbody>
        </table>
      )}
      {(saved.runs || []).length > 0 && (
        <table className="text-xs" data-testid="qi-sim-runs">
          <thead><tr><th className={th}>Run</th><th className={th}>Status</th><th className={th}>Handover</th></tr></thead>
          <tbody>
            {saved.runs.map((r) => (
              <tr key={r.jobId}><td className={td}>{r.name}</td>
                <td className={td}>{r.status === 'ready' ? <Link className="underline" to="/dashboard/apps/geoscience/seismolord">Ready: open in Seismolord</Link> : r.status}</td>
                <td className={td}>{r.status === 'ready' && <ExportControls name={r.name} jobId={r.jobId} volumes={Object.entries(r.volumeIds).map(([k, id]) => ({ key: k, label: k.toUpperCase(), id }))} />}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

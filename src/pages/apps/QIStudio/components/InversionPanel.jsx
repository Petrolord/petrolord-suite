// Post-stack impedance inversion (QI programme Q8a, 2026-10-06): the study
// wells read into impedance in time, a wavelet from the ties (the field
// wavelet or one well's), the horizons that guide the low-frequency model,
// a method, then the blind-well check and the volume run, both on the
// seismic worker (poststack_inversion). Results and settings are kept in
// the project for the report; the blind-well issues are offered to the
// register.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import { tieRows, waveletComparison } from '../services/ties';
import { prepareWell } from '../services/inversionWells';
import { INVERSION_METHODS, INVERSION_DEFAULTS, inversionIssues, validateSensitivity, MAX_SCENARIOS } from '../services/inversionRun';
import ExportControls from './ExportControls';

const SPREAD_KEYS = [['q10', 'AI Q10'], ['q50', 'AI Q50'], ['q90', 'AI Q90'], ['spread', 'AI spread']];
const LFM_FACTORS = [0.5, 1, 1.5];

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);

/** The wavelet choices: the field wavelet (two or more stored tie wavelets) and each well's own. */
export function waveletChoices(ready) {
  const rows = tieRows(ready);
  const out = [];
  let cmp = null;
  try { cmp = waveletComparison(rows); } catch { cmp = null; }
  if (cmp) out.push({ key: 'field', label: `Field wavelet (average of ${cmp.names.length} ties)`, samples: Array.from(cmp.average), dtMs: cmp.dtMs });
  for (const r of rows) {
    const w = r.tie?.wavelet;
    if (w?.samples) out.push({ key: `well:${r.wellId}`, label: `${r.wellName} tie wavelet`, samples: w.samples.length % 2 ? w.samples : w.samples.slice(0, -1), dtMs: w.dtMs });
  }
  return out;
}

/** The sensitivity block of a job from the panel's choices, or null. */
export function sensitivityBlock({ varyWavelet, varyModel, noise, snr }, choices) {
  if (!varyWavelet && !varyModel && !noise) return null;
  return {
    wavelets: varyWavelet ? choices.map((c) => ({ label: c.label, samples: c.samples, dt_ms: c.dtMs })) : [],
    lfm_factors: varyModel ? LFM_FACTORS : [1],
    ...(noise ? { snr: Number(snr), seeds: 3 } : {}),
  };
}

function SpreadTables({ result }) {
  const sens = result.sensitivity;
  if (!sens) return null;
  return (
    <div className="space-y-2" data-testid="qi-inv-spread-result">
      <table className="text-xs" data-testid="qi-inv-spread-wells">
        <thead><tr><th className={th}>Well</th><th className={th}>Blind AI error Q10 (percent)</th><th className={th}>Q50</th><th className={th}>Q90</th></tr></thead>
        <tbody className="font-mono tabular-nums">
          {sens.rows.map((r) => <tr key={r.name}><td className={`${td} font-sans`}>{r.name}</td><td className={td}>{f(r.q10, 1)}</td><td className={td}>{f(r.q50, 1)}</td><td className={td}>{f(r.q90, 1)}</td></tr>)}
        </tbody>
      </table>
      <table className="text-xs" data-testid="qi-inv-spread-scenarios">
        <thead><tr><th className={th}>Scenario</th><th className={th}>Mean blind AI error (percent)</th></tr></thead>
        <tbody>
          {sens.byScenario.map((r) => <tr key={r.label}><td className={td}>{r.label}</td><td className={`${td} font-mono`}>{f(r.meanRmsPct, 1)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function BlindTable({ result }) {
  const rel = result.settings?.output === 'relative AI';
  return (
    <table className="text-xs" data-testid="qi-inv-blind-table">
      <thead>
        <tr>
          <th className={th}>Well</th><th className={th}>Blind correlation</th>{!rel && <th className={th}>Blind AI error (percent)</th>}
          <th className={th}>With the well: correlation</th>{!rel && <th className={th}>With the well: error (percent)</th>}
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {(result.blind || []).map((r) => (
          <tr key={r.name}>
            <td className={`${td} font-sans`}>{r.name}</td>
            <td className={td}>{f(r.blind.corr)}</td>{!rel && <td className={td}>{f(r.blind.rmsPct, 1)}</td>}
            <td className={td}>{f(r.withWell.corr)}</td>{!rel && <td className={td}>{f(r.withWell.rmsPct, 1)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function InversionPanel() {
  const { chosenVolumes, ready, project, setInversion, saveIssue, canWrite, jobs, backend, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const [volumeId, setVolumeId] = useState('');
  const volume = chosenVolumes.find((v) => v.id === volumeId) || chosenVolumes[0] || null;
  const saved = (volume && project.inversion?.[volume.id]) || {};
  const [settings, setSettings] = useState(null);
  const s = settings || { method: 'model_based', lfmHz: INVERSION_DEFAULTS.lfmHz, eps: INVERSION_DEFAULTS.eps, lambda: INVERSION_DEFAULTS.lambda, horizonIds: [], wavelet: '', ...(saved.settings || {}) };
  const [horizons, setHorizons] = useState([]);
  const [prep, setPrep] = useState(null); // {busy} | {frame, wells} | {error}
  const [job, setJob] = useState({}); // mode -> {job} | {error}
  const [outName, setOutName] = useState('');
  const [spreadOpts, setSpreadOpts] = useState({ varyWavelet: true, varyModel: true, noise: false, snr: 5 });
  const stops = useRef([]);
  useEffect(() => () => { for (const x of stops.current) x(); }, []);
  const choices = useMemo(() => waveletChoices(ready), [ready]);
  const wavelet = choices.find((c) => c.key === s.wavelet) || choices[0] || null;

  useEffect(() => {
    setSettings(null); setPrep(null); setJob({}); setHorizons([]);
    if (!volume || !backend?.listHorizons) return;
    let live = true;
    backend.listHorizons(volume.id).then((h) => { if (live) setHorizons(h || []); }).catch(() => { if (live) setHorizons([]); });
    return () => { live = false; };
  }, [volume?.id, backend]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch) => {
    const next = { ...s, ...patch };
    setSettings(next);
    if (volume) setInversion(volume.id, { settings: next });
  };
  const readWells = async () => {
    setPrep({ busy: true });
    try {
      const frame = await backend.loadVolumeFrame(volume);
      const wells = [];
      for (const r of ready) wells.push(await prepareWell(r, frame, backend.downloadCurve));
      setPrep({ frame, wells });
    } catch (e) {
      setPrep({ error: e.message });
    }
  };
  const usable = prep?.wells?.filter((w) => w.ok) || [];
  const inversionBlock = () => ({
    method: s.method,
    wavelet: { samples: wavelet.samples, dt_ms: wavelet.dtMs },
    wells: usable.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai })),
    horizon_ids: s.horizonIds,
    lfmHz: Number(s.lfmHz),
    ...(s.method === 'sparse_spike' ? { lambda: Number(s.lambda) } : { eps: Number(s.eps) }),
  });
  const watch = (mode, jobId, onDone) => {
    const stop = client.watchJob(jobId, (row, err) => {
      if (err) { setJob((j) => ({ ...j, [mode]: { error: qiService.friendlyError(err) } })); return; }
      setJob((j) => ({ ...j, [mode]: { job: row } }));
      if (row?.status === 'succeeded') onDone(row);
    });
    stops.current.push(stop);
  };
  const runBlind = async () => {
    setJob((j) => ({ ...j, blind: { job: { status: 'queued', progress: 0 } } }));
    try {
      const jobId = await client.enqueueJob('poststack_inversion', { mode: 'blind', parent_volume_id: volume.id, name: `${volume.name} blind wells`, inversion: inversionBlock() });
      watch('blind', jobId, (row) => setInversion(volume.id, { blind: { jobId, at: row.finished_at || new Date().toISOString(), volumeName: volume.name, result: row.result_refs } }));
    } catch (e) {
      setJob((j) => ({ ...j, blind: { error: qiService.friendlyError(e) } }));
    }
  };
  const runVolume = async () => {
    const name = outName.trim() || `${volume.name} AI, ${INVERSION_METHODS[s.method].label}`;
    setJob((j) => ({ ...j, volume: { job: { status: 'queued', progress: 0 } } }));
    let row = null;
    try {
      const summary = { qi_class: 'elastic_estimate', method: s.method, wells: usable.map((w) => w.name), horizon_ids: s.horizonIds };
      row = await backend.registerInversionVolume({ volume, name, summary });
      const jobId = await client.enqueueJob('poststack_inversion', { mode: 'volume', parent_volume_id: volume.id, volume_id: row.id, name, inversion: inversionBlock() });
      setInversion(volume.id, (cur) => ({ runs: [...(cur.runs || []), { jobId, volumeId: row.id, name, method: s.method, at: new Date().toISOString(), status: 'queued' }] }));
      watch('volume', jobId, (done) => setInversion(volume.id, (cur) => ({
        runs: (cur.runs || []).map((r) => (r.jobId === jobId ? { ...r, status: 'ready', at: done.finished_at || r.at, blind: done.result_refs?.blind || null } : r)),
      })));
    } catch (e) {
      if (row) { try { await backend.removeVolume(row); } catch { /* best effort */ } }
      setJob((j) => ({ ...j, volume: { error: qiService.friendlyError(e) } }));
    }
  };
  const sensBlock = sensitivityBlock(spreadOpts, choices);
  const scenarioCount = sensBlock ? Math.max(1, sensBlock.wavelets.length) * sensBlock.lfm_factors.length * (sensBlock.snr != null ? sensBlock.seeds : 1) : 0;
  const sensProblem = sensBlock ? validateSensitivity(sensBlock, s.method) : 'Choose at least one assumption to vary.';
  const runSpreadBlind = async () => {
    setJob((j) => ({ ...j, spread: { job: { status: 'queued', progress: 0 } } }));
    try {
      const jobId = await client.enqueueJob('poststack_inversion', { mode: 'blind', parent_volume_id: volume.id, name: `${volume.name} sensitivity at the wells`, inversion: { ...inversionBlock(), sensitivity: sensBlock } });
      watch('spread', jobId, (row) => setInversion(volume.id, { spread: { jobId, at: row.finished_at || new Date().toISOString(), volumeName: volume.name, result: row.result_refs } }));
    } catch (e) {
      setJob((j) => ({ ...j, spread: { error: qiService.friendlyError(e) } }));
    }
  };
  const runSpreadVolume = async () => {
    const stem = outName.trim() || `${volume.name} AI, ${INVERSION_METHODS[s.method].label}`;
    setJob((j) => ({ ...j, spreadVolume: { job: { status: 'queued', progress: 0 } } }));
    const rows = [];
    try {
      const summary = { qi_class: 'elastic_estimate', method: s.method, wells: usable.map((w) => w.name), horizon_ids: s.horizonIds, sensitivity: true };
      for (const [key, label] of SPREAD_KEYS) rows.push({ key, row: await backend.registerInversionVolume({ volume, name: `${stem}, ${label}`, summary: { ...summary, product: key } }) });
      const volumeIds = Object.fromEntries(rows.map((r) => [r.key, r.row.id]));
      const jobId = await client.enqueueJob('poststack_inversion', { mode: 'volume', parent_volume_id: volume.id, volume_ids: volumeIds, name: `${stem} (uncertainty)`, inversion: { ...inversionBlock(), sensitivity: sensBlock } });
      setInversion(volume.id, (cur) => ({ runs: [...(cur.runs || []), { jobId, volumeId: volumeIds.q50, volumeIds, name: `${stem}: Q10, Q50, Q90 and spread`, method: s.method, at: new Date().toISOString(), status: 'queued' }] }));
      watch('spreadVolume', jobId, (done) => setInversion(volume.id, (cur) => ({
        runs: (cur.runs || []).map((r) => (r.jobId === jobId ? { ...r, status: 'ready', at: done.finished_at || r.at } : r)),
      })));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setJob((j) => ({ ...j, spreadVolume: { error: qiService.friendlyError(e) } }));
    }
  };
  const issues = useMemo(() => inversionIssues(saved.blind?.result?.blind, saved.blind?.volumeName), [saved.blind]);
  const addIssues = () => {
    for (const i of issues) saveIssue({ ...i, status: 'open', owner: '' });
    addNotification(`${issues.length} inversion issue${issues.length === 1 ? '' : 's'} added to the register.`, 'success');
  };

  if (!chosenVolumes.length) return <section className={card}><p className={muted}>Choose seismic volumes on Setup to invert them.</p></section>;
  if (!ready.length) return <section className={card}><p className={muted}>Choose wells on Setup: the inversion needs wells for its low-frequency model and its blind-well check.</p></section>;
  const status = (mode) => {
    const st = job[mode];
    if (!st) return null;
    if (st.error) return <span className="text-pl-danger-text">{st.error}</span>;
    if (st.job?.status === 'failed') return <span className="text-pl-danger-text">{st.job.error_message || 'The inversion job failed.'}</span>;
    if (qiService.isActive(st.job)) return <span className="text-pl-muted">{`${st.job.status}${st.job.progress ? `, ${Math.round(st.job.progress * 100)} percent` : ''}${st.job.progress_message ? `: ${st.job.progress_message}` : ''}`}</span>;
    return null;
  };
  const busy = (mode) => !!job[mode]?.job && qiService.isActive(job[mode].job);
  const canRun = canWrite && wavelet && usable.length >= 1;

  return (
    <section className={card} data-testid="qi-inversion">
      <h2 className="text-sm font-semibold text-pl-text">Impedance inversion</h2>
      <p className={muted}>Post-stack acoustic impedance from the seismic, the tie wavelets and a low-frequency model built from the study wells along your horizons. Check it at the wells first: each well is left out of the model in turn and compared with its own log. Runs on the seismic worker over your own volumes.</p>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">Volume
          <select className={input} value={volume?.id || ''} onChange={(e) => setVolumeId(e.target.value)} data-testid="qi-inv-volume">
            {chosenVolumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Method
          <select className={input} value={s.method} onChange={(e) => change({ method: e.target.value })} data-testid="qi-inv-method">
            {Object.entries(INVERSION_METHODS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Wavelet
          <select className={input} value={wavelet?.key || ''} onChange={(e) => change({ wavelet: e.target.value })} data-testid="qi-inv-wavelet">
            {choices.length ? choices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>) : <option value="">No stored tie wavelet</option>}
          </select>
        </label>
        {s.method !== 'coloured' && (
          <label className="flex items-center gap-1">Model below (Hz)
            <input className={`${input} w-16`} type="number" min="2" max="20" step="1" value={s.lfmHz} onChange={(e) => change({ lfmHz: e.target.value })} data-testid="qi-inv-lfm" />
          </label>
        )}
        {(s.method === 'model_based' || s.method === 'blocky') && (
          <label className="flex items-center gap-1">Pull to the model
            <input className={`${input} w-20`} type="number" min="0" step="0.01" value={s.eps} onChange={(e) => change({ eps: e.target.value })} />
          </label>
        )}
        {s.method === 'sparse_spike' && (
          <label className="flex items-center gap-1">Sparsity
            <input className={`${input} w-20`} type="number" min="0" step="0.0005" value={s.lambda} onChange={(e) => change({ lambda: e.target.value })} />
          </label>
        )}
      </div>
      {!choices.length && <p className="text-xs text-pl-warning-text">No well in the study has a stored tie wavelet. Commit a tie in Seismolord (Synthetics) first.</p>}

      {s.method !== 'coloured' && (
        <div className="text-xs space-y-1" data-testid="qi-inv-horizons">
          <span className="text-pl-muted">Horizons that guide the model (top to bottom):</span>
          {horizons.length ? (
            <div className="flex flex-wrap gap-3">
              {horizons.map((h) => (
                <label key={h.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={s.horizonIds.includes(h.id)} onChange={() => change({ horizonIds: s.horizonIds.includes(h.id) ? s.horizonIds.filter((x) => x !== h.id) : [...s.horizonIds, h.id] })} />
                  {h.name}
                </label>
              ))}
            </div>
          ) : <span className="text-pl-muted"> none on this volume, so the model follows constant time.</span>}
        </div>
      )}

      <div className="space-y-2">
        <button type="button" className={btn} onClick={readWells} disabled={prep?.busy} data-testid="qi-inv-read-wells">{prep?.busy ? 'Reading the wells' : 'Read the wells'}</button>
        {prep?.error && <p className="text-xs text-pl-danger-text">{prep.error}</p>}
        {prep?.wells && (
          <table className="text-xs" data-testid="qi-inv-wells">
            <thead><tr><th className={th}>Well</th><th className={th}>Trace (inline, crossline index)</th><th className={th}>Curves</th><th className={th}>Time from</th><th className={th}>Samples</th></tr></thead>
            <tbody>
              {prep.wells.map((w) => (
                <tr key={w.wellId}>
                  <td className={td}>{w.name}</td>
                  {w.ok ? (
                    <>
                      <td className={`${td} font-mono`}>{`${w.il}, ${w.xl}`}</td>
                      <td className={td}>{w.curves}</td>
                      <td className={td}>{w.timeSource}</td>
                      <td className={`${td} font-mono`}>{w.samples}</td>
                    </>
                  ) : <td className={`${td} text-pl-warning-text`} colSpan={4}>{w.reason}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {prep?.wells && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className={btn} onClick={runBlind} disabled={!canRun || usable.length < 2 || busy('blind')} data-testid="qi-inv-blind">Check at the wells (blind)</button>
          {usable.length < 2 && <span className="text-pl-muted">The blind check needs two usable wells.</span>}
          {status('blind')}
        </div>
      )}
      {saved.blind?.result && (
        <div className="space-y-2" data-testid="qi-inv-blind-result">
          <p className={muted}>{`Blind-well check on ${saved.blind.volumeName}, ${String(saved.blind.at).slice(0, 16).replace('T', ' ')}: ${INVERSION_METHODS[saved.blind.result.settings?.method]?.label || ''}. Errors compare AI with each log after a high cut at ${INVERSION_DEFAULTS.truthHz} Hz.${Number.isFinite(saved.blind.result.settings?.wavelet_scale) ? ` Wavelet scaled to the seismic at the wells by ${saved.blind.result.settings.wavelet_scale.toPrecision(3)}.` : ''}`}</p>
          <BlindTable result={saved.blind.result} />
          {issues.length > 0 && canWrite && <button type="button" className={btn} onClick={addIssues} data-testid="qi-inv-issues">{`Add ${issues.length} inversion issue${issues.length === 1 ? '' : 's'} to the register`}</button>}
        </div>
      )}

      {prep?.wells && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input className={`${input} w-72`} placeholder={`${volume.name} AI, ${INVERSION_METHODS[s.method].label}`} value={outName} onChange={(e) => setOutName(e.target.value)} aria-label="Name of the impedance volume" />
          <button type="button" className={btn} onClick={runVolume} disabled={!canRun || busy('volume')} data-testid="qi-inv-run">Invert the volume</button>
          {status('volume')}
        </div>
      )}
      {prep?.wells && INVERSION_METHODS[s.method].absolute && (
        <div className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid="qi-inv-spread">
          <h3 className="text-xs font-semibold text-pl-text">Sensitivity and uncertainty</h3>
          <p className={muted}>The same inversion under alternative assumptions. Impedance is summarised per sample as its 10th, 50th and 90th percentiles across the scenarios (Q10, Q50, Q90), with the relative spread (Q90 - Q10) / Q50.</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" checked={spreadOpts.varyWavelet} onChange={(e) => setSpreadOpts((o) => ({ ...o, varyWavelet: e.target.checked }))} data-testid="qi-inv-vary-wavelet" />{`Each wavelet (${choices.length})`}</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={spreadOpts.varyModel} onChange={(e) => setSpreadOpts((o) => ({ ...o, varyModel: e.target.checked }))} />Model cut at half, as set, and one and a half</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={spreadOpts.noise} onChange={(e) => setSpreadOpts((o) => ({ ...o, noise: e.target.checked }))} />Noise at signal-to-noise</label>
            {spreadOpts.noise && <input className={`${input} w-16`} type="number" min="0.5" step="0.5" value={spreadOpts.snr} onChange={(e) => setSpreadOpts((o) => ({ ...o, snr: e.target.value }))} aria-label="Signal-to-noise ratio" />}
            <span className="text-pl-muted" data-testid="qi-inv-scenarios">{`${scenarioCount} scenario${scenarioCount === 1 ? '' : 's'} (at most ${MAX_SCENARIOS})`}</span>
          </div>
          {sensProblem && <p className="text-pl-warning-text">{sensProblem}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} onClick={runSpreadBlind} disabled={!canRun || !!sensProblem || usable.length < 2 || busy('spread')} data-testid="qi-inv-spread-blind">Check the spread at the wells</button>
            {status('spread')}
            <button type="button" className={btn} onClick={runSpreadVolume} disabled={!canRun || !!sensProblem || busy('spreadVolume')} data-testid="qi-inv-spread-run">Invert with uncertainty (four volumes)</button>
            {status('spreadVolume')}
          </div>
          {saved.spread?.result && <SpreadTables result={saved.spread.result} />}
        </div>
      )}
      {(saved.runs || []).length > 0 && (
        <table className="text-xs" data-testid="qi-inv-runs">
          <thead><tr><th className={th}>Impedance volume</th><th className={th}>Method</th><th className={th}>Status</th><th className={th}>When</th><th className={th}>Handover</th></tr></thead>
          <tbody>
            {saved.runs.map((r) => (
              <tr key={r.jobId}>
                <td className={td}>{r.name}</td>
                <td className={td}>{INVERSION_METHODS[r.method]?.label || r.method}</td>
                <td className={td}>{r.status === 'ready' ? <Link className="underline" to="/dashboard/apps/geoscience/seismolord">Ready: open in Seismolord</Link> : r.status}</td>
                <td className={td}>{String(r.at).slice(0, 16).replace('T', ' ')}</td>
                <td className={td}>{r.status === 'ready' && <ExportControls name={r.name} jobId={r.jobId} volumes={r.volumeIds ? Object.entries(r.volumeIds).map(([k, id]) => ({ key: k, label: k.toUpperCase(), id })) : [{ key: 'ai', label: 'AI', id: r.volumeId }]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

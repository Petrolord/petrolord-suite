// Property prediction (QI programme Q9a, 2026-10-07): porosity or facies
// from an inverted impedance volume, calibrated at the study wells (logs
// upscaled to seismic scale) and checked by leaving each well out, on the
// seismic worker (property_prediction). Calibrations and runs are kept in
// the project for the report; the check's issues are offered to the
// register.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import { prepareWell } from '../services/inversionWells';
import { INVERSION_METHODS } from '../services/inversionRun';
import { PROPERTY_KINDS, PROPERTY_DEFAULTS, MAX_FACIES, propertyIssues, faciesClass } from '../services/propertyRun';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);
const pct = (v) => (Number.isFinite(v) ? `${Math.round(100 * v)}` : EMPTY_VALUE);

/** The absolute impedance volumes the project's inversions produced (single runs, and Q50 of uncertainty runs). */
export function impedanceChoices(project, volumes) {
  const out = [];
  for (const [seismicId, rec] of Object.entries(project.inversion || {})) {
    const seismic = volumes.find((v) => v.id === seismicId);
    for (const r of rec.runs || []) {
      if (r.status !== 'ready' || !INVERSION_METHODS[r.method]?.absolute) continue;
      out.push({ id: r.volumeIds?.q50 || r.volumeId, name: r.volumeIds ? `${r.name} (Q50)` : r.name, seismic });
    }
  }
  return out.filter((c) => c.id && c.seismic);
}

function CheckTable({ result }) {
  const facies = result.settings?.kind === 'facies';
  return (
    <table className="text-xs" data-testid="qi-prop-check">
      <thead>
        <tr>
          <th className={th}>Well left out</th><th className={th}>Samples</th>
          {facies ? <th className={th}>Facies right (percent)</th> : (
            <><th className={th}>RMS error</th><th className={th}>Correlation</th><th className={th}>Inside Q10 to Q90 (percent)</th></>
          )}
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {result.rows.map((r) => (
          <tr key={r.name}>
            <td className={`${td} font-sans`}>{r.name}</td>
            {r.error ? <td className={`${td} font-sans text-pl-warning-text`} colSpan={4}>{r.error}</td> : (
              <>
                <td className={td}>{r.n}</td>
                {facies ? <td className={td}>{pct(r.accuracy)}</td> : (
                  <><td className={td}>{f(r.rms, 3)}</td><td className={td}>{f(r.corr)}</td><td className={td}>{pct(r.coverage)}</td></>
                )}
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ result }) {
  const s = result.summary;
  if (result.settings?.kind === 'facies') {
    return (
      <table className="text-xs" data-testid="qi-prop-classes">
        <thead><tr><th className={th}>Facies</th><th className={th}>Samples</th><th className={th}>Prior</th><th className={th}>Mean AI</th><th className={th}>SD</th><th className={th}>Product label</th></tr></thead>
        <tbody>
          {s.classes.map((c) => <tr key={c.name}><td className={td}>{c.name}</td><td className={`${td} font-mono`}>{c.n}</td><td className={`${td} font-mono`}>{f(c.prior)}</td><td className={`${td} font-mono`}>{f(c.mean, 0)}</td><td className={`${td} font-mono`}>{f(c.sd, 0)}</td><td className={td}>{faciesClass(c.name) === 'fluid_hypothesis' ? 'fluid hypothesis' : 'calibrated prediction'}</td></tr>)}
        </tbody>
      </table>
    );
  }
  return <p className="text-xs text-pl-text font-mono" data-testid="qi-prop-transform">{`porosity = ${f(s.a, 4)} ${s.b < 0 ? '-' : '+'} ${Math.abs(s.b).toExponential(3)} x AI   (r squared ${f(s.r2)}, ${s.n} samples, residual SD ${f(s.s, 4)})`}</p>;
}

export default function PropertiesPanel() {
  const { project, volumes, ready, setProperty, saveIssue, canWrite, jobs, backend, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const choices = impedanceChoices(project, volumes);
  const [aiId, setAiId] = useState('');
  const ai = choices.find((c) => c.id === aiId) || choices[0] || null;
  const saved = (ai && project.properties?.[ai.id]) || {};
  const [kind, setKind] = useState('porosity');
  const [density, setDensity] = useState(PROPERTY_DEFAULTS.density);
  const [priors, setPriors] = useState(PROPERTY_DEFAULTS.priors);
  const [win, setWin] = useState({ t0: '', t1: '' });
  const [prep, setPrep] = useState(null);
  const [job, setJob] = useState({});
  const stops = useRef([]);
  useEffect(() => () => { for (const x of stops.current) x(); }, []);
  useEffect(() => { setPrep(null); setJob({}); }, [ai?.id, kind]);

  const readWells = async () => {
    setPrep({ busy: true });
    try {
      const frame = await backend.loadVolumeFrame(ai.seismic);
      const wells = [];
      for (const r of ready) wells.push(await prepareWell(r, frame, backend.downloadCurve, { extras: [kind] }));
      setPrep({ wells });
    } catch (e) {
      setPrep({ error: e.message });
    }
  };
  const usable = (prep?.wells || []).filter((w) => w.ok && w[kind]?.values);
  const names = (() => {
    const all = {};
    for (const w of usable) Object.assign(all, w.facies?.names || {});
    return all;
  })();
  const block = () => ({
    kind,
    wells: usable.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, target: w[kind].values })),
    ...(win.t0 !== '' && win.t1 !== '' ? { window_ms: [Number(win.t0), Number(win.t1)] } : {}),
    ...(kind === 'facies' ? { names, density, priors } : {}),
  });
  const watch = (mode, jobId, onDone) => {
    const stop = client.watchJob(jobId, (row, err) => {
      if (err) { setJob((j) => ({ ...j, [mode]: { error: qiService.friendlyError(err) } })); return; }
      setJob((j) => ({ ...j, [mode]: { job: row } }));
      if (row?.status === 'succeeded') onDone(row);
    });
    stops.current.push(stop);
  };
  const calibrate = async () => {
    setJob((j) => ({ ...j, calibrate: { job: { status: 'queued', progress: 0 } } }));
    try {
      const jobId = await client.enqueueJob('property_prediction', { mode: 'calibrate', ai_volume_id: ai.id, name: `${ai.name} ${kind} calibration`, property: block() });
      watch('calibrate', jobId, (row) => setProperty(ai.id, { [kind]: { ...(saved[kind] || {}), calibration: { jobId, at: row.finished_at || new Date().toISOString(), volumeName: ai.name, result: row.result_refs } } }));
    } catch (e) {
      setJob((j) => ({ ...j, calibrate: { error: qiService.friendlyError(e) } }));
    }
  };
  const runVolume = async () => {
    setJob((j) => ({ ...j, volume: { job: { status: 'queued', progress: 0 } } }));
    const keys = kind === 'facies' ? [...Object.keys(names).map((c) => [`p:${c}`, `probability of ${names[c]}`]), ['best', 'most likely facies']] : [['q10', 'porosity Q10'], ['q50', 'porosity Q50'], ['q90', 'porosity Q90']];
    const rows = [];
    try {
      for (const [key, label] of keys) rows.push({ key, row: await backend.registerPropertyVolume({ aiVolumeId: ai.id, name: `${ai.name}, ${label}`, summary: { kind, product: key } }) });
      const volumeIds = Object.fromEntries(rows.map((r) => [r.key, r.row.id]));
      const jobId = await client.enqueueJob('property_prediction', { mode: 'volume', ai_volume_id: ai.id, volume_ids: volumeIds, name: `${ai.name} ${kind}`, property: block() });
      setProperty(ai.id, (cur) => ({ [kind]: { ...(cur[kind] || {}), runs: [...(cur[kind]?.runs || []), { jobId, volumeIds, name: `${ai.name}: ${PROPERTY_KINDS[kind].label.toLowerCase()}`, at: new Date().toISOString(), status: 'queued' }] } }));
      watch('volume', jobId, (done) => setProperty(ai.id, (cur) => ({
        [kind]: { ...(cur[kind] || {}), runs: (cur[kind]?.runs || []).map((r) => (r.jobId === jobId ? { ...r, status: 'ready', at: done.finished_at || r.at } : r)) },
      })));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setJob((j) => ({ ...j, volume: { error: qiService.friendlyError(e) } }));
    }
  };
  const status = (mode) => {
    const st = job[mode];
    if (!st) return null;
    if (st.error) return <span className="text-pl-danger-text">{st.error}</span>;
    if (st.job?.status === 'failed') return <span className="text-pl-danger-text">{st.job.error_message || 'The job failed.'}</span>;
    if (qiService.isActive(st.job)) return <span className="text-pl-muted">{`${st.job.status}${st.job.progress ? `, ${Math.round(st.job.progress * 100)} percent` : ''}`}</span>;
    return null;
  };
  const busy = (mode) => !!job[mode]?.job && qiService.isActive(job[mode].job);
  const cal = saved[kind]?.calibration;
  const issues = cal ? propertyIssues(cal.result, cal.volumeName) : [];
  const addIssues = () => {
    for (const i of issues) saveIssue({ ...i, status: 'open', owner: '' });
    addNotification(`${issues.length} property issue${issues.length === 1 ? '' : 's'} added to the register.`, 'success');
  };
  const tooManyFacies = kind === 'facies' && Object.keys(names).length > MAX_FACIES;
  const canRun = canWrite && usable.length >= 2 && !tooManyFacies && (kind !== 'facies' || Object.keys(names).length >= 2);

  if (!choices.length) return <section className={card}><p className={muted}>Invert a volume on the Inversion tab first: porosity and facies are predicted from a finished impedance volume (not a relative one).</p></section>;
  return (
    <section className={card} data-testid="qi-properties">
      <h2 className="text-sm font-semibold text-pl-text">Property prediction</h2>
      <p className={muted}>Porosity or facies from an impedance volume. The wells&apos; logs are taken to seismic scale, the transform or the facies model is fitted to them, and each well is then left out and predicted from the inverted impedance at its trace. Runs on the seismic worker.</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">Impedance
          <select className={input} value={ai?.id || ''} onChange={(e) => setAiId(e.target.value)} data-testid="qi-prop-ai">
            {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Predict
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="qi-prop-kind">
            {Object.entries(PROPERTY_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {kind === 'facies' && (
          <>
            <label className="flex items-center gap-1">Density
              <select className={input} value={density} onChange={(e) => setDensity(e.target.value)}><option value="gaussian">Gaussian</option><option value="kde">Kernel (KDE)</option></select>
            </label>
            <label className="flex items-center gap-1">Priors
              <select className={input} value={priors} onChange={(e) => setPriors(e.target.value)}><option value="wells">The wells&apos; proportions</option><option value="equal">Equal</option></select>
            </label>
          </>
        )}
        <label className="flex items-center gap-1">Window (ms)
          <input className={`${input} w-20`} type="number" placeholder="start" value={win.t0} onChange={(e) => setWin((w) => ({ ...w, t0: e.target.value }))} aria-label="Window start (ms)" />
          <input className={`${input} w-20`} type="number" placeholder="end" value={win.t1} onChange={(e) => setWin((w) => ({ ...w, t1: e.target.value }))} aria-label="Window end (ms)" />
        </label>
      </div>
      <button type="button" className={btn} onClick={readWells} disabled={prep?.busy || !ready.length} data-testid="qi-prop-read">{prep?.busy ? 'Reading the wells' : 'Read the wells'}</button>
      {prep?.error && <p className="text-xs text-pl-danger-text">{prep.error}</p>}
      {prep?.wells && (
        <table className="text-xs" data-testid="qi-prop-wells">
          <thead><tr><th className={th}>Well</th><th className={th}>Impedance from</th><th className={th}>{kind === 'facies' ? 'Facies curve' : 'Porosity curve'}</th></tr></thead>
          <tbody>
            {prep.wells.map((w) => (
              <tr key={w.wellId}>
                <td className={td}>{w.name}</td>
                {!w.ok ? <td className={`${td} text-pl-warning-text`} colSpan={2}>{w.reason}</td> : (
                  <><td className={td}>{w.curves}</td><td className={w[kind]?.values ? td : `${td} text-pl-warning-text`}>{w[kind]?.curve || w[kind]?.reason}</td></>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kind === 'facies' && prep?.wells && <p className={muted}>{Object.keys(names).length ? `Facies: ${Object.entries(names).map(([c, n]) => `${c} ${n}`).join(', ')}. Names that speak of a fluid are labelled fluid hypotheses.` : 'No facies names found on the wells.'}</p>}
      {tooManyFacies && <p className="text-xs text-pl-warning-text">{`At most ${MAX_FACIES} facies; merge some in Rock Physics Studio first.`}</p>}
      {prep?.wells && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className={btn} onClick={calibrate} disabled={!canRun || busy('calibrate')} data-testid="qi-prop-calibrate">Calibrate and check at the wells</button>
          {usable.length < 2 && <span className="text-pl-muted">Needs two wells with impedance and the property.</span>}
          {status('calibrate')}
          <button type="button" className={btn} onClick={runVolume} disabled={!canRun || busy('volume')} data-testid="qi-prop-run">Predict the volume</button>
          {status('volume')}
        </div>
      )}
      {cal && (
        <div className="space-y-2" data-testid="qi-prop-result">
          <p className={muted}>{`Calibrated on ${cal.volumeName}, ${String(cal.at).slice(0, 16).replace('T', ' ')}.`}</p>
          <Summary result={cal.result} />
          <CheckTable result={cal.result} />
          {issues.length > 0 && canWrite && <button type="button" className={btn} onClick={addIssues} data-testid="qi-prop-issues">{`Add ${issues.length} property issue${issues.length === 1 ? '' : 's'} to the register`}</button>}
        </div>
      )}
      {(saved[kind]?.runs || []).length > 0 && (
        <table className="text-xs" data-testid="qi-prop-runs">
          <thead><tr><th className={th}>Volumes</th><th className={th}>Status</th><th className={th}>When</th></tr></thead>
          <tbody>
            {saved[kind].runs.map((r) => (
              <tr key={r.jobId}><td className={td}>{r.name}</td><td className={td}>{r.status === 'ready' ? <Link className="underline" to="/dashboard/apps/geoscience/seismolord">Ready: open in Seismolord</Link> : r.status}</td><td className={td}>{String(r.at).slice(0, 16).replace('T', ' ')}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

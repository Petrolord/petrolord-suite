// AVO (QI programme Q7, Milestone C, 2026-10-07; SOW section 8): intercept,
// gradient, the Smith-Gidlow fluid factor and a chi projection from two to
// four angle stacks, each with its mean angle, on the seismic worker
// (avo_volumes). The runs are kept in the project for the report.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import PilotArea, { EMPTY_PILOT, pilotParam, pilotName, pilotFormProblem } from './PilotArea';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Label, Legend, ReferenceLine } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import ExportControls from './ExportControls';
import { prepareWell } from '../services/inversionWells';
import { wellPoints, compareAtWells, avoWellIssues } from '../services/avoWells';
import { wellScale, shueyTermsFor } from '../engine/avoCalibration';
import { amplitudePreservation } from '../engine/qcAdditions';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const LABEL_STYLE = { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize };
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : EMPTY_VALUE);
export const AVO_LABELS = { A: 'Intercept (A)', B: 'Gradient (B)', FF: 'Fluid factor', chi: 'Chi projection' };
// QI upgrade P2.10: the extra products of the calibration block
export const AVO_EXTRA_LABELS = { C: 'Curvature (C)', class: 'AVO class' };
const ALL_LABELS = { ...AVO_LABELS, ...AVO_EXTRA_LABELS };

/** The calibration block of an AVO job from the panel's choices and the wells comparison, or {} (QI upgrade P2.10). */
export function avoCalibrationBlock({ cal, wells }) {
  const out = { ...(cal.terms !== '2' ? { terms: cal.terms === 'auto' ? 'auto' : 3 } : {}) };
  if (cal.mode === 'none' || !wells) return out;
  if (cal.mode === 'one') return Number.isFinite(wells.scale) && wells.scale !== 0 ? { ...out, scale: wells.scale } : out;
  const pts = new Map((wells.points || []).map((q) => [q.name, q]));
  // each well by its lattice position: the worker places it with the traces
  const field = (wells.wells || []).filter((w) => !w.error && pts.has(w.name)).map((w) => ({ name: w.name, il: pts.get(w.name).il, xl: pts.get(w.name).xl, scale: wellScale({ modelled: w.modelled, observed: w.observed }) })).filter((w) => Number.isFinite(w.scale) && w.scale !== 0);
  if (!field.length) return out;
  return { ...out, scale_field: { wells: field, ...(cal.fieldMethod === 'kriging' ? { method: 'kriging', variogram: { model: 'spherical', range: Number(cal.range) } } : {}) } };
}

/** Why the stacks cannot run, or null. */
export function avoProblem(stacks) {
  const live = stacks.filter((s) => s.volumeId);
  if (live.length < 2) return 'Choose at least two angle stacks.';
  if (new Set(live.map((s) => s.volumeId)).size !== live.length) return 'Each stack must be a different volume.';
  if (live.some((s) => String(s.angle).trim() === '' || !(Number(s.angle) >= 0 && Number(s.angle) <= 50))) return 'Give each stack its mean angle, 0 to 50 degrees.';
  const a = live.map((s) => Number(s.angle));
  if (Math.max(...a) - Math.min(...a) < 5) return 'The stacks need at least 5 degrees between the nearest and the farthest.';
  return null;
}

export default function AvoPanel() {
  const { chosenVolumes, ready, project, setAvo, backend, jobs, canWrite, saveIssue, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const [stacks, setStacks] = useState([{ volumeId: '', angle: '' }, { volumeId: '', angle: '' }, { volumeId: '', angle: '' }]);
  const [products, setProducts] = useState({ A: true, B: true, FF: true, chi: false });
  const [vsVp, setVsVp] = useState(0.5);
  const [chi, setChi] = useState(20);
  const [st, setSt] = useState(null);
  const [pilot, setPilot] = useState(EMPTY_PILOT);
  const [cal, setCal] = useState({ terms: '2', mode: 'none', fieldMethod: 'idw', range: '2000', C: false, class: false });
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const calProblem = (cal.mode !== 'none' || cal.class) && !project.avo?.wells ? 'Compare an AVO run at the wells first: the calibration uses its scales.'
    : cal.class && cal.mode === 'none' ? 'An AVO class volume needs a calibration to reflectivity.'
    : cal.mode === 'field' && !project.avo.wells.points ? 'Compare at the wells again: this comparison predates the scale field and has no well positions.'
    : cal.C && cal.terms !== '2' && shueyTermsFor(stacks.filter((x) => x.volumeId && String(x.angle).trim() !== '').map((x) => Number(x.angle))) < 3 && cal.terms === 'auto' ? 'These stacks support two terms only, so the curvature cannot be written.'
      : cal.fieldMethod === 'kriging' && cal.mode === 'field' && !(Number(cal.range) > 0) ? 'Give the kriging range in metres.' : null;
  const problem = avoProblem(stacks) || (!Object.values(products).some(Boolean) && !cal.C && !cal.class ? 'Choose at least one product.' : null) || calProblem;
  const runs = project.avo?.runs || [];
  // stack matching (Q5): every stack onto a reference, one operator each
  const [matchRef, setMatchRef] = useState('');
  const [matchSt, setMatchSt] = useState(null);
  const matchStacks = async () => {
    const refVol = chosenVolumes.find((v) => v.id === matchRef);
    const targets = stacks.filter((x) => x.volumeId && x.volumeId !== matchRef).map((x) => chosenVolumes.find((v) => v.id === x.volumeId)).filter(Boolean);
    setMatchSt({ job: { status: 'queued' } });
    const rows = [];
    try {
      for (const t of targets) rows.push({ t, row: await backend.registerMatchedVolume({ volume: t, name: `${t.name} matched to ${refVol.name}`, summary: { reference_volume_id: refVol.id } }) });
      const jobId = await client.enqueueJob('match_stacks', { reference_volume_id: refVol.id, stacks: targets.map((t) => t.id), volume_ids: Object.fromEntries(rows.map((r) => [r.t.id, r.row.id])), name: `Stacks matched to ${refVol.name}` });
      stops.current.push(client.watchJob(jobId, (row, err) => {
        setMatchSt(err ? { error: qiService.friendlyError(err) } : { job: row });
        if (row?.status === 'succeeded') setAvo({ matching: { at: row.finished_at || new Date().toISOString(), reference: refVol.name, stacks: row.result_refs.stacks } });
      }));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setMatchSt({ error: qiService.friendlyError(e) });
    }
  };

  const run = async () => {
    const live = stacks.filter((s) => s.volumeId);
    const first = chosenVolumes.find((v) => v.id === live[0].volumeId);
    const keys = [...Object.keys(products).filter((k) => products[k]), ...(cal.C ? ['C'] : []), ...(cal.class ? ['class'] : [])];
    const pp = pilotParam(pilot);
    const calBlock = avoCalibrationBlock({ cal, wells: project.avo?.wells || null });
    setSt({ job: { status: 'queued' } });
    const rows = [];
    try {
      for (const k of keys) rows.push({ k, row: await backend.registerAvoVolume({ volume: first, name: pilotName(`${first.name} ${ALL_LABELS[k]}`, pilot), summary: { product: k, qi_class: k === 'class' ? 'interpretation' : 'elastic_estimate' } }) });
      const ids = Object.fromEntries(rows.map((r) => [r.k, r.row.id]));
      const jobId = await client.enqueueJob('avo_volumes', { stacks: live.map((s) => ({ volume_id: s.volumeId, angle: Number(s.angle) })), products: ids, vs_vp: Number(vsVp), chi_deg: Number(chi), name: pilotName(`${first.name} AVO`, pilot), ...calBlock, ...(pp ? { pilot: pp } : {}) });
      const rec = { jobId, volumeIds: ids, name: pilotName(`${first.name} AVO`, pilot), ...(pp ? { pilot: pp } : {}), stacks: live.map((s) => ({ volumeId: s.volumeId, name: chosenVolumes.find((v) => v.id === s.volumeId)?.name || s.volumeId, angle: Number(s.angle) })), vsVp: Number(vsVp), chiDeg: Number(chi), ...(calBlock.terms ? { terms: calBlock.terms } : {}), ...(calBlock.scale_field ? { calibration: 'scale field' } : calBlock.scale != null ? { calibration: 'one scale' } : {}), at: new Date().toISOString(), status: 'queued' };
      setAvo((cur) => ({ runs: [...(cur.runs || []), rec] }));
      stops.current.push(client.watchJob(jobId, (row, err) => {
        setSt(err ? { error: qiService.friendlyError(err) } : { job: row });
        if (row?.status === 'succeeded') setAvo((cur) => ({ runs: (cur.runs || []).map((r) => (r.jobId === jobId ? { ...r, status: 'ready', at: row.finished_at || r.at } : r)) }));
      }));
    } catch (e) {
      for (const r of rows) { try { await backend.removeVolume(r.row); } catch { /* best effort */ } }
      setSt({ error: qiService.friendlyError(e) });
    }
  };

  // AVO at the wells: the Rock Physics model at each zone top against the volumes at the well
  const runAB = runs.filter((r) => r.status === 'ready' && r.volumeIds?.A && r.volumeIds?.B).slice(-1)[0] || null;
  const [wellSt, setWellSt] = useState(null);
  const compareWells = async () => {
    setWellSt({ busy: true });
    try {
      const firstVol = chosenVolumes.find((v) => v.id === runAB.stacks[0]?.volumeId) || chosenVolumes[0];
      const frame = await backend.loadVolumeFrame(firstVol);
      const prepared = [];
      for (const r of ready) {
        const g = await backend.loadRockPhysicsGather(r.well);
        if (!g?.ok) { prepared.push({ name: r.well.name, ok: false, error: g?.reason || 'No Rock Physics gather published for this well.' }); continue; }
        const ins = g.gather.cases.find((c) => c.key === 'in-situ'); const sub = g.gather.cases.find((c) => c.key === 'substituted');
        const w = await prepareWell(r, frame, backend.downloadCurve, { topsMd: [g.gather.zone?.top_md_m] });
        prepared.push({ name: r.well.name, ok: w.ok, error: w.ok ? null : w.reason, il: w.il, xl: w.xl, topTwt: w.topsTwt?.[0] ?? null, modelled: { A: ins?.intercept, B: ins?.gradient }, substituted: sub ? { A: sub.intercept, B: sub.gradient } : null, zone: g.gather.zone?.name || '' });
      }
      const points = wellPoints(prepared);
      if (!points.length) { setWellSt({ error: 'No well has both a published gather and a usable trace and zone-top time.', prepared }); return; }
      const jobId = await client.enqueueJob('sample_volumes', { volume_ids: [runAB.volumeIds.A, runAB.volumeIds.B], points, window_ms: 8, name: `${runAB.name} at the wells` });
      stops.current.push(client.watchJob(jobId, (row, err) => {
        if (err) { setWellSt({ error: qiService.friendlyError(err) }); return; }
        if (row?.status === 'failed') { setWellSt({ error: row.error_message || 'Sampling failed.' }); return; }
        if (row?.status !== 'succeeded') return;
        const byName = new Map((row.result_refs.points || []).map((q) => [q.name, q]));
        const rows = prepared.map((p) => {
          const q = byName.get(p.name);
          return { ...p, observed: q?.values ? { A: q.values[0], B: q.values[1] } : null, error: p.error || q?.error || null };
        });
        const cmp = compareAtWells(rows); // every well, so one with no gather says why
        setAvo({ wells: { runJobId: runAB.jobId, runName: runAB.name, at: row.finished_at || new Date().toISOString(), points, scale: cmp.scale, n: cmp.n, agree: cmp.agree, wells: cmp.wells.map(({ name, zone, modelled, substituted, observed, scaled, residual, modelledClass, observedClass, agree, error }) => ({ name, zone, modelled, substituted, observed, scaled, residual, modelledClass, observedClass, agree, error })) } });
        setWellSt(null);
      }));
    } catch (e) {
      setWellSt({ error: qiService.friendlyError(e) });
    }
  };
  const wells = project.avo?.wells || null;
  const wellIssues = wells ? avoWellIssues(wells, wells.runName) : [];
  // QI upgrade P2.11: amplitude preservation, each stack at the wells against the model at its angle
  const [presSt, setPresSt] = useState(null);
  const checkPreservation = async () => {
    setPresSt({ busy: true });
    try {
      const stacks = (runAB?.stacks || []).filter((x) => x.volumeId);
      const jobId = await client.enqueueJob('sample_volumes', { volume_ids: stacks.map((x) => x.volumeId), points: wells.points, window_ms: 8, name: `${runAB.name} stacks at the wells` });
      stops.current.push(client.watchJob(jobId, (row, err) => {
        if (err) { setPresSt({ error: qiService.friendlyError(err) }); return; }
        if (row?.status === 'failed') { setPresSt({ error: row.error_message || 'Sampling failed.' }); return; }
        if (row?.status !== 'succeeded') return;
        const byName = new Map((row.result_refs.points || []).map((q) => [q.name, q]));
        const angles = stacks.map((x) => Number(x.angle));
        const input = wells.wells.filter((w) => !w.error && w.modelled && Number.isFinite(w.modelled.A) && byName.get(w.name)?.values).map((w) => ({
          name: w.name, angles, observed: byName.get(w.name).values, modelled: angles.map((a) => w.modelled.A + w.modelled.B * Math.sin((a * Math.PI) / 180) ** 2),
        }));
        const r = amplitudePreservation(input);
        setAvo({ preservation: { at: row.finished_at || new Date().toISOString(), runName: runAB.name, angles, k: r.k, flagged: r.flagged, consistent: r.consistent, rows: r.rows } });
        setPresSt(null);
      }));
    } catch (e) { setPresSt({ error: qiService.friendlyError(e) }); }
  };
  const pres = project.avo?.preservation || null;
  const presIssue = pres?.flagged ? [{ key: `avo-preservation:${pres.runName}`, area: 'AVO', severity: 'medium', title: 'Stack amplitudes change with angle against the model at the wells', detail: `The ratio of seismic to modelled amplitude changes as exp(${Number(pres.k).toFixed(2)} sin^2 theta) at the median well${pres.consistent ? ', with the same sign at every well' : ''}.`, remedy: 'Ask whether the processing preserved relative amplitudes with offset (gain, NMO stretch, mutes); correct with one operator per stack before reading AVO gradients.' }] : [];
  const chart = wells ? {
    modelled: wells.wells.filter((w) => w.modelled && Number.isFinite(w.modelled.A)).map((w) => ({ A: w.modelled.A, B: w.modelled.B, name: `${w.name} model, in situ` })),
    substituted: wells.wells.filter((w) => w.substituted && Number.isFinite(w.substituted.A)).map((w) => ({ A: w.substituted.A, B: w.substituted.B, name: `${w.name} model, substituted` })),
    observed: wells.wells.filter((w) => w.scaled).map((w) => ({ A: w.scaled.A, B: w.scaled.B, name: `${w.name} seismic` })),
  } : null;

  if (!chosenVolumes.length) return <section className={card}><p className={muted}>Choose the angle stack volumes on Setup (convert them from the Prestack tab, or import partial stacks into Seismolord).</p></section>;
  return (
    <section className={card} data-testid="qi-avo">
      <h2 className="text-sm font-semibold text-pl-text">AVO</h2>
      <p className={muted}>Intercept and gradient from a two-term Shuey fit over the angle stacks at every sample, the Smith-Gidlow fluid factor from them (Gardner density and your Vs/Vp; near zero on the mudrock line, negative for gas), and a chi projection. The stacks must share one lattice and be balanced against each other. Runs on the seismic worker; the products open in Seismolord.</p>
      <div className="space-y-1 text-xs">
        {stacks.map((s, k) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <select className={input} value={s.volumeId} onChange={(e) => setStacks((x) => x.map((y, j) => (j === k ? { ...y, volumeId: e.target.value } : y)))} data-testid={`qi-avo-stack-${k}`} aria-label={`Stack ${k + 1}`}>
              <option value="">{k < 2 ? 'choose a stack' : 'none'}</option>
              {chosenVolumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <label className="flex items-center gap-1">mean angle<input className={`${input} w-16`} type="number" value={s.angle} onChange={(e) => setStacks((x) => x.map((y, j) => (j === k ? { ...y, angle: e.target.value } : y)))} data-testid={`qi-avo-angle-${k}`} /></label>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(AVO_LABELS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={products[k]} onChange={() => setProducts((p) => ({ ...p, [k]: !p[k] }))} />{label}</label>
          ))}
          <label className="flex items-center gap-1">Vs/Vp<input className={`${input} w-16`} type="number" step="0.01" value={vsVp} onChange={(e) => setVsVp(e.target.value)} /></label>
          {products.chi && <label className="flex items-center gap-1">chi (degrees)<input className={`${input} w-16`} type="number" value={chi} onChange={(e) => setChi(e.target.value)} /></label>}
        </div>
        <details className="rounded border border-pl-border p-2" data-testid="qi-avo-calibration">
          <summary className="cursor-pointer text-pl-text">Terms, calibration to reflectivity and class volumes</summary>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <label className="flex items-center gap-1">Shuey terms
              <select className={input} value={cal.terms} onChange={(e) => setCal((c) => ({ ...c, terms: e.target.value }))} data-testid="qi-avo-terms"><option value="2">two</option><option value="auto">three where the angles allow</option><option value="3">three</option></select>
            </label>
            {cal.terms !== '2' && <span className="text-pl-muted" data-testid="qi-avo-terms-note">{`These stacks support ${shueyTermsFor(stacks.filter((x) => x.volumeId && String(x.angle).trim() !== '').map((x) => Number(x.angle)))} terms (three need three stacks reaching 35 degrees).`}</span>}
            <label className="flex items-center gap-1">To reflectivity
              <select className={input} value={cal.mode} onChange={(e) => setCal((c) => ({ ...c, mode: e.target.value }))} data-testid="qi-avo-cal-mode"><option value="none">as the stacks are</option><option value="one">one scale from the wells</option><option value="field">a scale field from the wells</option></select>
            </label>
            {cal.mode === 'field' && (
              <label className="flex items-center gap-1">spread by
                <select className={input} value={cal.fieldMethod} onChange={(e) => setCal((c) => ({ ...c, fieldMethod: e.target.value }))}><option value="idw">inverse distance</option><option value="kriging">kriging</option></select>
                {cal.fieldMethod === 'kriging' && <input className={`${input} w-20`} type="number" value={cal.range} onChange={(e) => setCal((c) => ({ ...c, range: e.target.value }))} aria-label="Variogram range (m)" />}
              </label>
            )}
            <label className="flex items-center gap-1"><input type="checkbox" checked={cal.C} onChange={() => setCal((c) => ({ ...c, C: !c.C }))} disabled={cal.terms === '2'} data-testid="qi-avo-product-C" />Curvature (C)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={cal.class} onChange={() => setCal((c) => ({ ...c, class: !c.class }))} disabled={cal.mode === 'none'} data-testid="qi-avo-product-class" />AVO class volume</label>
          </div>
          <p className={muted}>The scale comes from Compare at the wells below: the factor that takes the seismic intercept and gradient to the modelled ones, one for the survey, or one per well spread over the map so a drifting amplitude scale is followed trace by trace (at each well it is that well&apos;s scale). Calibrated A, B, fluid factor and chi read in reflectivity; the class volume holds 1 to 4 (classes I to IV, the classifier Rock Physics Studio uses) and is an interpretation.</p>
          {cal.mode !== 'none' && !project.avo?.wells && <p className="text-pl-warning-text" data-testid="qi-avo-cal-needs-wells">Compare an AVO run at the wells first: the calibration uses its scales.</p>}
        </details>
        {problem && <p className="text-pl-warning-text">{problem}</p>}
        <div className="flex items-center gap-2">
          <PilotArea value={pilot} onChange={setPilot} volume={chosenVolumes.find((v) => v.id === stacks.find((x) => x.volumeId)?.volumeId) || null} disabled={!canWrite} testId="qi-avo-pilot" />
          <button type="button" className={btn} onClick={run} disabled={!canWrite || !!problem || !!pilotFormProblem(pilot) || (st?.job && qiService.isActive(st.job))} data-testid="qi-avo-run">{pilot.on ? 'Compute the AVO volumes in the pilot area' : 'Compute the AVO volumes'}</button>
          {st?.error && <span className="text-pl-danger-text">{st.error}</span>}
          {st?.job?.status === 'failed' && <span className="text-pl-danger-text">{st.job.error_message || 'The AVO job failed.'}</span>}
          {st?.job && qiService.isActive(st.job) && <span className="text-pl-muted">{st.job.status}</span>}
        </div>
      </div>
      <div className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid="qi-avo-match">
        <h3 className="text-xs font-semibold text-pl-text">Match the stacks</h3>
        <p className={muted}>Before AVO, bring every stack chosen above onto a reference stack in time, phase and amplitude: one operator per stack, measured on about 300 traces across the survey, so the stacks compare like with like and their relative amplitudes stay as they are. The matched stacks join the study&apos;s volumes; choose them on Setup.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">Reference
            <select className={input} value={matchRef} onChange={(e) => setMatchRef(e.target.value)} data-testid="qi-avo-match-ref"><option value="">choose</option>{chosenVolumes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          </label>
          <button type="button" className={btn} onClick={matchStacks} disabled={!canWrite || !matchRef || stacks.filter((x) => x.volumeId && x.volumeId !== matchRef).length < 1 || (matchSt?.job && qiService.isActive(matchSt.job))} data-testid="qi-avo-match-run">Match to the reference</button>
          {matchSt?.error && <span className="text-pl-danger-text">{matchSt.error}</span>}
          {matchSt?.job && qiService.isActive(matchSt.job) && <span className="text-pl-muted">{matchSt.job.status}</span>}
        </div>
        {project.avo?.matching && (
          <table className="text-xs" data-testid="qi-avo-match-table">
            <thead><tr><th className={th}>Stack</th><th className={th}>Shift (ms)</th><th className={th}>Phase (degrees)</th><th className={th}>Scale</th><th className={th}>Correlation, before and after</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {project.avo.matching.stacks.map((m) => <tr key={m.stack_id}><td className={`${td} font-sans`}>{m.stack_name}</td><td className={td}>{Number(m.shift_ms).toFixed(1)}</td><td className={td}>{Number(m.phase_deg).toFixed(0)}</td><td className={td}>{Number(m.scale).toFixed(3)}</td><td className={td}>{`${Number(m.corr_before).toFixed(2)} to ${Number(m.corr_after).toFixed(2)}`}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
      {runAB && (
        <div className="rounded border border-pl-border p-3 space-y-2" data-testid="qi-avo-wells">
          <h3 className="text-xs font-semibold text-pl-text">At the wells</h3>
          <p className={muted}>The intercept and gradient Rock Physics Studio modelled at each well&apos;s zone top (its published gather, in situ and fluid substituted) against the AVO volumes at the well&apos;s trace and zone-top time (the event within 8 ms). One scale ties the volumes to reflectivity over every well.</p>
          <button type="button" className={btn} onClick={compareWells} disabled={wellSt?.busy || !ready.length} data-testid="qi-avo-wells-run">{wellSt?.busy ? 'Comparing' : `Compare ${runAB.name} at the wells`}</button>
          {wellSt?.error && <p className="text-xs text-pl-danger-text">{wellSt.error}</p>}
          {wells && (
            <>
              <p className="text-xs text-pl-text" data-testid="qi-avo-wells-summary">{`Scale ${Number.isFinite(wells.scale) ? wells.scale.toPrecision(3) : EMPTY_VALUE} from ${wells.n} well${wells.n === 1 ? '' : 's'}; the AVO class agrees at ${wells.agree} of them.`}</p>
              <table className="text-xs" data-testid="qi-avo-wells-table">
                <thead><tr><th className={th}>Well</th><th className={th}>Model A, B (in situ)</th><th className={th}>Seismic A, B (scaled)</th><th className={th}>Class, model / seismic</th><th className={th}>Misfit</th></tr></thead>
                <tbody className="font-mono tabular-nums">
                  {wells.wells.map((w) => (
                    <tr key={w.name}>
                      <td className={`${td} font-sans`}>{w.name}</td>
                      {w.error ? <td className={`${td} font-sans text-pl-warning-text`} colSpan={4}>{w.error}</td> : (
                        <>
                          <td className={td}>{`${f3(w.modelled.A)}, ${f3(w.modelled.B)}`}</td>
                          <td className={td}>{`${f3(w.scaled.A)}, ${f3(w.scaled.B)}`}</td>
                          <td className={`${td} font-sans`}>{`${w.modelledClass || EMPTY_VALUE} / ${w.observedClass || EMPTY_VALUE}`}</td>
                          <td className={td}>{f3(w.residual)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 300, maxWidth: 560 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={CHART_MARGINS.standard}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis type="number" dataKey="A" tick={AXIS_TICK} tickFormatter={(v) => v.toFixed(2)}><Label value="Intercept A" position="insideBottom" offset={-5} style={LABEL_STYLE} /></XAxis>
                    <YAxis type="number" dataKey="B" tick={AXIS_TICK} tickFormatter={(v) => v.toFixed(2)}><Label value="Gradient B" angle={-90} position="insideLeft" style={LABEL_STYLE} /></YAxis>
                    <ReferenceLine x={0} stroke={CHART_COLORS.axisText} /><ReferenceLine y={0} stroke={CHART_COLORS.axisText} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toFixed(3)} labelFormatter={() => ''} />
                    <Legend />
                    <Scatter name="Model, in situ" data={chart.modelled} fill="#2563eb" isAnimationActive={false} />
                    <Scatter name="Model, substituted" data={chart.substituted} fill="#d97706" isAnimationActive={false} />
                    <Scatter name="Seismic, scaled" data={chart.observed} fill="#0f172a" shape="diamond" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
              {wellIssues.length > 0 && canWrite && <button type="button" className={btn} onClick={() => { for (const i of wellIssues) saveIssue({ ...i, status: 'open', owner: '' }); addNotification(`${wellIssues.length} AVO issue${wellIssues.length === 1 ? '' : 's'} added to the register.`, 'success'); }} data-testid="qi-avo-wells-issues">{`Add ${wellIssues.length} AVO issue${wellIssues.length === 1 ? '' : 's'} to the register`}</button>}
              {wells.points?.length > 0 && (runAB?.stacks || []).length >= 2 && (
                <div className="space-y-1" data-testid="qi-avo-preservation">
                  <button type="button" className={btn} onClick={checkPreservation} disabled={presSt?.busy || !canWrite} data-testid="qi-avo-preservation-run">{presSt?.busy ? 'Checking' : 'Check amplitude preservation at the wells'}</button>
                  {presSt?.error && <p className="text-xs text-pl-danger-text">{presSt.error}</p>}
                  {pres && (
                    <>
                      <p className="text-xs text-pl-text" data-testid="qi-avo-preservation-result">{`Seismic over modelled amplitude, fitted as exp(c + k sin^2 theta) per well: k = ${pres.rows.map((x) => `${x.name} ${Number.isFinite(x.k) ? x.k.toFixed(2) : EMPTY_VALUE}`).join(', ')}. ${pres.flagged ? 'The amplitudes change with angle against the model: the stacks may not preserve relative amplitudes.' : 'No gain that changes with angle beyond 0.5 in k.'}`}</p>
                      {presIssue.length > 0 && canWrite && <button type="button" className={btn} onClick={() => { for (const i of presIssue) saveIssue({ ...i, status: 'open', owner: '' }); addNotification('Amplitude preservation issue added to the register.', 'success'); }} data-testid="qi-avo-preservation-issue">Add the issue to the register</button>}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {runs.length > 0 && (
        <table className="text-xs" data-testid="qi-avo-runs">
          <thead><tr><th className={th}>Run</th><th className={th}>Stacks (mean angle)</th><th className={th}>Status</th><th className={th}>Handover</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.jobId}>
                <td className={td}>{r.name}</td>
                <td className={td}>{r.stacks.map((s) => `${s.name} (${s.angle})`).join(', ')}</td>
                <td className={td}>{r.status === 'ready' ? <Link className="underline" to="/dashboard/apps/geoscience/seismolord">Ready: open in Seismolord</Link> : r.status}</td>
                <td className={td}>{r.status === 'ready' && <ExportControls name={r.name} jobId={r.jobId} volumes={Object.entries(r.volumeIds).map(([k, id]) => ({ key: k, label: k, id }))} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

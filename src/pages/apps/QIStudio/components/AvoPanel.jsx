// AVO (QI programme Q7, Milestone C, 2026-10-07; SOW section 8): intercept,
// gradient, the Smith-Gidlow fluid factor and a chi projection from two to
// four angle stacks, each with its mean angle, on the seismic worker
// (avo_volumes). The runs are kept in the project for the report.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Label, Legend, ReferenceLine } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import ExportControls from './ExportControls';
import { prepareWell } from '../services/inversionWells';
import { wellPoints, compareAtWells, avoWellIssues } from '../services/avoWells';

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

/** Why the stacks cannot run, or null. */
export function avoProblem(stacks) {
  const live = stacks.filter((s) => s.volumeId);
  if (live.length < 2) return 'Choose at least two angle stacks.';
  if (new Set(live.map((s) => s.volumeId)).size !== live.length) return 'Each stack must be a different volume.';
  if (live.some((s) => !(Number(s.angle) >= 0 && Number(s.angle) <= 50))) return 'Give each stack its mean angle, 0 to 50 degrees.';
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
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const problem = avoProblem(stacks) || (!Object.values(products).some(Boolean) ? 'Choose at least one product.' : null);
  const runs = project.avo?.runs || [];

  const run = async () => {
    const live = stacks.filter((s) => s.volumeId);
    const first = chosenVolumes.find((v) => v.id === live[0].volumeId);
    const keys = Object.keys(products).filter((k) => products[k]);
    setSt({ job: { status: 'queued' } });
    const rows = [];
    try {
      for (const k of keys) rows.push({ k, row: await backend.registerAvoVolume({ volume: first, name: `${first.name} ${AVO_LABELS[k]}`, summary: { product: k, qi_class: 'elastic_estimate' } }) });
      const ids = Object.fromEntries(rows.map((r) => [r.k, r.row.id]));
      const jobId = await client.enqueueJob('avo_volumes', { stacks: live.map((s) => ({ volume_id: s.volumeId, angle: Number(s.angle) })), products: ids, vs_vp: Number(vsVp), chi_deg: Number(chi), name: `${first.name} AVO` });
      const rec = { jobId, volumeIds: ids, name: `${first.name} AVO`, stacks: live.map((s) => ({ volumeId: s.volumeId, name: chosenVolumes.find((v) => v.id === s.volumeId)?.name || s.volumeId, angle: Number(s.angle) })), vsVp: Number(vsVp), chiDeg: Number(chi), at: new Date().toISOString(), status: 'queued' };
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
        setAvo({ wells: { runJobId: runAB.jobId, runName: runAB.name, at: row.finished_at || new Date().toISOString(), scale: cmp.scale, n: cmp.n, agree: cmp.agree, wells: cmp.wells.map(({ name, zone, modelled, substituted, observed, scaled, residual, modelledClass, observedClass, agree, error }) => ({ name, zone, modelled, substituted, observed, scaled, residual, modelledClass, observedClass, agree, error })) } });
        setWellSt(null);
      }));
    } catch (e) {
      setWellSt({ error: qiService.friendlyError(e) });
    }
  };
  const wells = project.avo?.wells || null;
  const wellIssues = wells ? avoWellIssues(wells, wells.runName) : [];
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
        {problem && <p className="text-pl-warning-text">{problem}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={run} disabled={!canWrite || !!problem || (st?.job && qiService.isActive(st.job))} data-testid="qi-avo-run">Compute the AVO volumes</button>
          {st?.error && <span className="text-pl-danger-text">{st.error}</span>}
          {st?.job?.status === 'failed' && <span className="text-pl-danger-text">{st.job.error_message || 'The AVO job failed.'}</span>}
          {st?.job && qiService.isActive(st.job) && <span className="text-pl-muted">{st.job.status}</span>}
        </div>
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

// AVO (QI programme Q7, Milestone C, 2026-10-07; SOW section 8): intercept,
// gradient, the Smith-Gidlow fluid factor and a chi projection from two to
// four angle stacks, each with its mean angle, on the seismic worker
// (avo_volumes). The runs are kept in the project for the report.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import ExportControls from './ExportControls';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
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
  const { chosenVolumes, project, setAvo, backend, jobs, canWrite } = useQIStudio();
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
      const rec = { jobId, volumeIds: ids, name: `${first.name} AVO`, stacks: live.map((s) => ({ name: chosenVolumes.find((v) => v.id === s.volumeId)?.name || s.volumeId, angle: Number(s.angle) })), vsVp: Number(vsVp), chiDeg: Number(chi), at: new Date().toISOString(), status: 'queued' };
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

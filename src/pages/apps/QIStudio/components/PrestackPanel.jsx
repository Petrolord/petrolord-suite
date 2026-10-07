// Prestack data (QI programme Q3, Milestone C, 2026-10-07; SOW sections 2
// and 3): an uploaded prestack SEG-Y built into the worker's gather store
// (ingest_gathers), angle partial stacks from the store with an RMS
// velocity table (angle_stacks), and each stack converted into a
// Seismolord volume by the existing server import. The stacks and the
// usable angle are kept in the project for the report.
import React, { useEffect, useRef, useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const GiB = 1024 ** 3;
const DEFAULT_RANGES = [{ name: 'near', from: 0, to: 15 }, { name: 'mid', from: 15, to: 30 }, { name: 'far', from: 30, to: 45 }];

/** "time_ms vrms" rows to a table; a reason when a row does not read. */
export function parseVelocityTable(text) {
  const t = []; const v = [];
  const rows = String(text || '').split(/\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const [k, l] of rows.entries()) {
    const [a, b] = l.split(/[\s,;]+/).map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: `Row ${k + 1} needs a time in ms and an RMS velocity in m/s.` };
    t.push(a); v.push(b);
  }
  if (!t.length) return { error: 'Give at least one row: time in ms and RMS velocity in m/s.' };
  for (let i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) return { error: 'The times must increase down the table.' };
  return { t_ms: t, vrms: v };
}

function useJob() {
  const { jobs } = useQIStudio();
  const client = jobs || qiService;
  const [state, setState] = useState({});
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const run = async (key, kind, params, onDone) => {
    setState((m) => ({ ...m, [key]: { job: { status: 'queued' } } }));
    try {
      const id = await client.enqueueJob(kind, params);
      stops.current.push(client.watchJob(id, (row, err) => {
        setState((m) => ({ ...m, [key]: err ? { error: qiService.friendlyError(err) } : { job: row } }));
        if (row?.status === 'succeeded' && onDone) onDone(row);
      }));
    } catch (e) {
      setState((m) => ({ ...m, [key]: { error: qiService.friendlyError(e) } }));
    }
  };
  const status = (key) => {
    const st = state[key];
    if (!st) return null;
    if (st.error) return <span className="text-pl-danger-text">{st.error}</span>;
    if (st.job?.status === 'failed') return <span className="text-pl-danger-text">{st.job.error_message || 'The job failed.'}</span>;
    if (qiService.isActive(st.job)) return <span className="text-pl-muted">{`${st.job.status}${st.job.progress ? `, ${Math.round(st.job.progress * 100)} percent` : ''}${st.job.progress_message ? `: ${st.job.progress_message}` : ''}`}</span>;
    if (st.job?.status === 'succeeded') return <span className="text-pl-success-text">Done</span>;
    return null;
  };
  const busy = (key) => !!state[key]?.job && qiService.isActive(state[key].job);
  return { run, status, busy, state };
}

export default function PrestackPanel() {
  const { backend, project, setPrestack, setPrestackQc, saveIssue, canWrite, addNotification } = useQIStudio();
  const [datasets, setDatasets] = useState(null);
  const [form, setForm] = useState({ offsetByte: 37, binWidth: 50 });
  const [velText, setVelText] = useState('0 1800\n2000 2600');
  const [ranges, setRanges] = useState(DEFAULT_RANGES);
  const [minFold, setMinFold] = useState(1);
  const [trim, setTrim] = useState({ centre: '', window: 100, maxShift: 8 });
  const job = useJob();
  const list = backend?.listDatasets || qiService.listDatasets;
  const refresh = async () => { try { setDatasets(await list()); } catch (e) { setDatasets([]); addNotification(qiService.friendlyError(e), 'error'); } };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const raws = (datasets || []).filter((d) => d.kind === 'segy_upload' && d.status === 'uploaded' && !d.meta?.partial_stack);
  const stores = (datasets || []).filter((d) => d.kind === 'gathers_offset' && d.status === 'uploaded');
  const stacks = (datasets || []).filter((d) => d.kind === 'segy_upload' && d.status === 'uploaded' && d.meta?.partial_stack);
  const vel = parseVelocityTable(velText);
  const rangeProblem = ranges.some((r) => !(r.to > r.from && r.from >= 0 && r.to <= 60) || !r.name.trim()) ? 'Each range needs a name and from below to, within 0 to 60 degrees.' : null;

  const build = (d) => job.run(`g:${d.id}`, 'ingest_gathers', { dataset_id: d.id, mapping: { offsetByte: Number(form.offsetByte) }, bin_width_m: Number(form.binWidth), name: `${d.name} gathers` }, () => refresh());
  const stack = (d) => job.run(`s:${d.id}`, 'angle_stacks', { dataset_id: d.id, velocity: { t_ms: vel.t_ms, vrms: vel.vrms }, ranges: ranges.map((r) => ({ name: r.name.trim(), from: Number(r.from), to: Number(r.to) })), min_fold: Number(minFold) }, (row) => {
    setPrestack(d.id, { name: d.name, at: row.finished_at || new Date().toISOString(), result: row.result_refs, velocity: { t_ms: vel.t_ms, vrms: vel.vrms } });
    refresh();
  });
  const qc = (d) => job.run(`q:${d.id}`, 'prestack_qc', { dataset_id: d.id, ...(vel.error ? {} : { velocity: { t_ms: vel.t_ms, vrms: vel.vrms } }), name: `${d.name} QC` }, (row) => setPrestackQc(d.id, { name: d.name, at: row.finished_at || new Date().toISOString(), result: row.result_refs }));
  const runTrim = (d) => job.run(`t:${d.id}`, 'trim_gathers', { dataset_id: d.id, centre_ms: Number(trim.centre), window_ms: Number(trim.window), max_shift_ms: Number(trim.maxShift), name: `${d.name} trimmed` }, () => refresh());
  const addQcIssues = (rec) => {
    for (const i of rec.result.issues || []) saveIssue({ ...i, status: 'open', owner: '' });
    addNotification(`${(rec.result.issues || []).length} prestack QC issue${(rec.result.issues || []).length === 1 ? '' : 's'} added to the register.`, 'success');
  };
  const convert = async (d) => {
    try {
      await backend.convertStack(d);
      addNotification(`${d.name}: converting into a Seismolord volume on the worker.`, 'success');
    } catch (e) {
      addNotification(qiService.friendlyError(e), 'error');
    }
  };

  return (
    <section className={card} data-testid="qi-prestack">
      <h2 className="text-sm font-semibold text-pl-text">Prestack</h2>
      <p className={muted}>Prestack gathers live on the seismic worker. Upload the CDP gather SEG-Y with Seismolord&apos;s import (it goes to the worker store), build the gather store here, then make angle stacks with an RMS velocity table and convert each into a Seismolord volume. Gathers are taken as NMO-corrected; the file must be sorted by inline, then crossline.</p>
      {datasets === null && <p className={muted}>Reading your worker files</p>}

      <div className="space-y-1" data-testid="qi-pre-raw">
        <h3 className="text-xs font-semibold text-pl-text">Uploaded SEG-Y files</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">Offset byte<input className={`${input} w-14`} type="number" value={form.offsetByte} onChange={(e) => setForm((f) => ({ ...f, offsetByte: e.target.value }))} /></label>
          <label className="flex items-center gap-1">Offset bin (m)<input className={`${input} w-16`} type="number" value={form.binWidth} onChange={(e) => setForm((f) => ({ ...f, binWidth: e.target.value }))} data-testid="qi-pre-bin" /></label>
        </div>
        {raws.length ? (
          <table className="text-xs"><tbody>
            {raws.map((d) => (
              <tr key={d.id}><td className={td}>{d.name}</td><td className={`${td} font-mono`}>{`${(Number(d.bytes) / GiB).toFixed(2)} GiB`}</td>
                <td className={td}><button type="button" className={btn} onClick={() => build(d)} disabled={!canWrite || job.busy(`g:${d.id}`)} data-testid={`qi-pre-build-${d.id}`}>Build gathers</button> {job.status(`g:${d.id}`)}</td></tr>
            ))}
          </tbody></table>
        ) : <p className={muted}>No uploaded SEG-Y in your worker store.</p>}
      </div>

      <div className="space-y-1" data-testid="qi-pre-stores">
        <h3 className="text-xs font-semibold text-pl-text">Gather stores</h3>
        <div className="flex flex-wrap items-start gap-4 text-xs">
          <label className="flex flex-col gap-1">RMS velocity (time ms, velocity m/s per row)
            <textarea className={`${input} w-56 h-20 font-mono`} value={velText} onChange={(e) => setVelText(e.target.value)} data-testid="qi-pre-vel" />
            {vel.error && <span className="text-pl-warning-text">{vel.error}</span>}
          </label>
          <div className="space-y-1">
            <span className="text-pl-muted">Angle ranges (degrees)</span>
            {ranges.map((r, k) => (
              <div key={k} className="flex items-center gap-1">
                <input className={`${input} w-16`} value={r.name} onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} aria-label={`Range ${k + 1} name`} />
                <input className={`${input} w-14`} type="number" value={r.from} onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === k ? { ...x, from: e.target.value } : x)))} aria-label={`Range ${k + 1} from`} />
                <input className={`${input} w-14`} type="number" value={r.to} onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === k ? { ...x, to: e.target.value } : x)))} aria-label={`Range ${k + 1} to`} />
              </div>
            ))}
            {rangeProblem && <span className="text-pl-warning-text">{rangeProblem}</span>}
          </div>
          <label className="flex items-center gap-1">Least fold for the usable angle<input className={`${input} w-14`} type="number" min="1" value={minFold} onChange={(e) => setMinFold(e.target.value)} /></label>
          <div className="flex flex-col gap-1">
            <span className="text-pl-muted">Trim statics</span>
            <label className="flex items-center gap-1">event (ms)<input className={`${input} w-16`} type="number" value={trim.centre} onChange={(e) => setTrim((t) => ({ ...t, centre: e.target.value }))} data-testid="qi-pre-trim-centre" /></label>
            <label className="flex items-center gap-1" title="The correlation reaches this far either side of the event">half-window (ms)<input className={`${input} w-16`} type="number" value={trim.window} onChange={(e) => setTrim((t) => ({ ...t, window: e.target.value }))} /></label>
            <label className="flex items-center gap-1">largest shift (ms)<input className={`${input} w-14`} type="number" value={trim.maxShift} onChange={(e) => setTrim((t) => ({ ...t, maxShift: e.target.value }))} /></label>
          </div>
        </div>
        {stores.length ? (
          <table className="text-xs"><tbody>
            {stores.map((d) => (
              <tr key={d.id}>
                <td className={td}>{d.name}</td>
                <td className={td}>{`${d.meta?.traces ?? EMPTY_VALUE} traces, ${d.meta?.bins ?? EMPTY_VALUE} offset bins of ${d.meta?.bin_width_m ?? EMPTY_VALUE} m${d.meta?.conditioning?.trim ? `; trimmed at ${d.meta.conditioning.trim.centre_ms} ms (gather correlation ${Number(d.meta.conditioning.corrBefore).toFixed(2)} to ${Number(d.meta.conditioning.corrAfter).toFixed(2)})` : ''}`}</td>
                <td className={td}><button type="button" className={btn} onClick={() => runTrim(d)} disabled={!canWrite || !(Number(trim.centre) > 0) || job.busy(`t:${d.id}`)} data-testid={`qi-pre-trim-${d.id}`}>Trim statics</button> {job.status(`t:${d.id}`)}</td>
                <td className={td}><button type="button" className={btn} onClick={() => qc(d)} disabled={!canWrite || job.busy(`q:${d.id}`)} data-testid={`qi-pre-qc-${d.id}`}>QC the gathers</button> {job.status(`q:${d.id}`)}</td>
                <td className={td}><button type="button" className={btn} onClick={() => stack(d)} disabled={!canWrite || !!vel.error || !!rangeProblem || job.busy(`s:${d.id}`)} data-testid={`qi-pre-stack-${d.id}`}>Make angle stacks</button> {job.status(`s:${d.id}`)}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className={muted}>No gather store yet.</p>}
        {Object.entries(project.prestackQc || {}).map(([id, rec]) => (
          <div key={`qc-${id}`} className="space-y-1" data-testid={`qi-pre-qc-result-${id}`}>
            <p className="text-xs text-pl-text">{`${rec.name}: ${rec.result.cdps} CDPs sampled (every ${rec.result.stride}); median fold ${rec.result.fold.median}, far covered offset ${Math.round(rec.result.fold.farMedianM)} m${rec.result.fold.lowShare > 0 ? `, ${(100 * rec.result.fold.lowShare).toFixed(0)} percent of CDPs under half the median fold` : ''}.`}</p>
            <table className="text-xs">
              <thead><tr><th className={th}>Event time (ms)</th><th className={th}>Residual moveout, median (ms)</th><th className={th}>90th percentile</th><th className={th}>Over 4 ms (percent)</th><th className={th}>Stretch mute (m)</th></tr></thead>
              <tbody className="font-mono tabular-nums">
                {rec.result.times.map((t) => <tr key={t.t_ms}><td className={td}>{t.t_ms}</td><td className={td}>{Number(t.rmoMedian).toFixed(1)}</td><td className={td}>{Number(t.rmoQ90).toFixed(1)}</td><td className={td}>{(100 * t.rmoShareOver4).toFixed(0)}</td><td className={td}>{t.stretchMuteM ? Math.round(t.stretchMuteM) : EMPTY_VALUE}</td></tr>)}
              </tbody>
            </table>
            {(rec.result.issues || []).length > 0 && canWrite && <button type="button" className={btn} onClick={() => addQcIssues(rec)} data-testid={`qi-pre-qc-issues-${id}`}>{`Add ${rec.result.issues.length} prestack QC issue${rec.result.issues.length === 1 ? '' : 's'} to the register`}</button>}
          </div>
        ))}
        {Object.entries(project.prestack || {}).map(([id, rec]) => (
          <p key={id} className="text-xs text-pl-text" data-testid={`qi-pre-result-${id}`}>{`${rec.name}: ${rec.result.stacks.map((s) => `${s.name} ${s.from} to ${s.to} degrees (${s.traces} traces)`).join('; ')}. Usable angle across the CDPs: Q10 ${Number(rec.result.usable_angle.q10).toFixed(1)}, Q50 ${Number(rec.result.usable_angle.q50).toFixed(1)}, Q90 ${Number(rec.result.usable_angle.q90).toFixed(1)} degrees.`}</p>
        ))}
      </div>

      <div className="space-y-1" data-testid="qi-pre-stacks">
        <h3 className="text-xs font-semibold text-pl-text">Angle stacks</h3>
        {stacks.length ? (
          <table className="text-xs">
            <thead><tr><th className={th}>Stack</th><th className={th}>Angles</th><th className={th} /></tr></thead>
            <tbody>
              {stacks.map((d) => (
                <tr key={d.id}><td className={td}>{d.name}</td><td className={td}>{`${d.meta.partial_stack.from} to ${d.meta.partial_stack.to} degrees`}</td>
                  <td className={td}><button type="button" className={btn} onClick={() => convert(d)} disabled={!canWrite} data-testid={`qi-pre-convert-${d.id}`}>Convert to a Seismolord volume</button></td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className={muted}>No angle stack yet.</p>}
      </div>
    </section>
  );
}

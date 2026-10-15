// Prestack conditioning (QI round 3, 2026-10-15; the remainder of the QI
// programme's Q5): Radon demultiple and f-x noise attenuation on a worker
// gather store, each written as a new store beside the input (with, on
// request, what was removed as a third store), so the Gathers tab shows
// input, output and removed part side by side before anything is stacked.
// The runs, their settings and what they removed are kept with the study and
// printed in the report.
import React, { useEffect, useRef, useState } from 'react';
import * as qiService from '@/lib/qiService';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';

const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';

export const RADON_DEFAULTS = { cut: '30', qMin: '-60', qMax: '300', highRes: '3', avo: true, window: '300', fMax: '70' };
export const FX_DEFAULTS = { length: '3', window: '200', fLo: '3', fHi: '' };
const EMPTY_AREA = { on: false, il0: '', il1: '', xl0: '', xl1: '' };

const isNum = (v) => String(v).trim() !== '' && Number.isFinite(Number(v));

/** The job settings for an operation, or { error } with the reason (typed values arrive as text). */
export function conditioningParams(op, radon, fx, area) {
  const out = {};
  if (op === 'radon') {
    for (const [k, label] of [['cut', 'the cut'], ['qMin', 'the smallest moveout'], ['qMax', 'the largest moveout'], ['highRes', 'the high-resolution iterations'], ['window', 'the time window'], ['fMax', 'the highest frequency']]) if (!isNum(radon[k])) return { error: `Give ${label}.` };
    const cut = Number(radon.cut); const qMin = Number(radon.qMin); const qMax = Number(radon.qMax);
    if (!(cut > 0)) return { error: 'The cut must be above zero: after NMO the primaries sit at zero residual moveout.' };
    if (!(qMin < cut && cut < qMax)) return { error: 'The cut must lie between the smallest and largest moveout.' };
    const hr = Number(radon.highRes); if (!(Number.isInteger(hr) && hr >= 0 && hr <= 5)) return { error: 'High resolution takes 0 to 5 iterations.' };
    Object.assign(out, { cut_ms: cut, q_min_ms: qMin, q_max_ms: qMax, high_res: hr, avo_terms: !!radon.avo, window_ms: Number(radon.window), f_max_hz: Number(radon.fMax) });
  } else {
    for (const [k, label] of [['length', 'the filter length'], ['window', 'the time window'], ['fLo', 'the lowest frequency']]) if (!isNum(fx[k])) return { error: `Give ${label}.` };
    const L = Number(fx.length); if (!(Number.isInteger(L) && L >= 1 && L <= 8)) return { error: 'The filter length must be 1 to 8 traces.' };
    if (String(fx.fHi).trim() !== '' && !isNum(fx.fHi)) return { error: 'The highest frequency must be a number, or blank.' };
    Object.assign(out, { filter_length: L, window_ms: Number(fx.window), f_lo_hz: Number(fx.fLo), ...(String(fx.fHi).trim() !== '' ? { f_hi_hz: Number(fx.fHi) } : {}) });
  }
  if (area.on) {
    if (![area.il0, area.il1, area.xl0, area.xl1].every(isNum)) return { error: 'Give the area\'s inline and crossline ranges.' };
    if (!(Number(area.il1) >= Number(area.il0) && Number(area.xl1) >= Number(area.xl0))) return { error: 'Each range of the area runs from a number to a larger one.' };
    out.area = { il: [Number(area.il0), Number(area.il1)], xl: [Number(area.xl0), Number(area.xl1)] };
  }
  return { params: out };
}

const pct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(0)}` : EMPTY_VALUE);
const opName = (kind) => (kind === 'radon_demultiple' ? 'Radon demultiple' : 'f-x noise attenuation');

/** One line describing a run's settings. */
export function settingsText(kind, s = {}) {
  if (kind === 'radon_demultiple') return `cut ${s.cut_ms} ms at the far offset, moveout ${s.q_min_ms} to ${s.q_max_ms} ms, ${s.high_res ? `high resolution (${s.high_res} iterations)` : 'least squares'}${s.avo_terms ? ', AVO terms' : ''}, ${s.window_ms ? `${s.window_ms} ms windows` : 'whole trace'}, up to ${s.f_max_hz} Hz`;
  return `filter ${s.filter_length} traces, ${s.window_ms ? `${s.window_ms} ms windows` : 'whole trace'}, from ${s.f_lo_hz} Hz${s.f_hi_hz ? ` to ${s.f_hi_hz} Hz` : ''}`;
}

export default function ConditioningSection({ stores, onDone }) {
  const { jobs, project, setConditioning, canWrite } = useQIStudio();
  const client = jobs || qiService;
  const [storeId, setStoreId] = useState('');
  const [op, setOp] = useState('radon');
  const [radon, setRadon] = useState(RADON_DEFAULTS);
  const [fx, setFx] = useState(FX_DEFAULTS);
  const [area, setArea] = useState(EMPTY_AREA);
  const [keep, setKeep] = useState(true);
  const [st, setSt] = useState(null);
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  useEffect(() => { if (!storeId && stores.length) setStoreId(stores[0].id); }, [stores.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const store = stores.find((d) => d.id === storeId) || null;
  const built = conditioningParams(op, radon, fx, area);
  const runs = project.conditioning?.runs || [];
  const busy = st?.job && qiService.isActive(st.job);

  const run = async () => {
    const kind = op === 'radon' ? 'radon_demultiple' : 'fx_denoise';
    const name = `${store.name} ${op === 'radon' ? 'demultipled' : 'f-x denoised'}${area.on ? ' (area)' : ''}`;
    setSt({ job: { status: 'queued' } });
    try {
      const jobId = await client.enqueueJob(kind, { dataset_id: store.id, ...built.params, keep_removed: keep, name });
      stops.current.push(client.watchJob(jobId, (row, err) => {
        setSt(err ? { error: qiService.friendlyError(err) } : { job: row });
        if (row?.status === 'succeeded') {
          const r = row.result_refs || {};
          setConditioning((cur) => ({ runs: [...(cur.runs || []).filter((x) => x.jobId !== jobId), { jobId, kind, at: row.finished_at || new Date().toISOString(), sourceId: store.id, sourceName: store.name, name, datasetId: r.dataset_id, removedId: r.removed_dataset_id || null, settings: r.settings || built.params, area: r.area || null, cdps: r.cdps, failed: r.failed_cdps || 0, removedShare: r.removed_share, bands: r.bands || [], secondsPerCdp: r.seconds_per_cdp, warnings: row.warnings || r.warnings || [] }] }));
          onDone?.();
        }
      }));
    } catch (e) {
      setSt({ error: qiService.friendlyError(e) });
    }
  };

  const setR = (k) => (e) => setRadon((r) => ({ ...r, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setF = (k) => (e) => setFx((r) => ({ ...r, [k]: e.target.value }));
  const setA = (k) => (e) => setArea((a) => ({ ...a, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid="qi-pre-cond">
      <h3 className="text-xs font-semibold text-pl-text">Conditioning: multiples and noise</h3>
      <p className={muted}>Remove multiples with a parabolic Radon transform, or attenuate random noise with f-x deconvolution, on NMO-corrected gathers. The result is a new gather store beside the input, so you can compare them on the Gathers tab before you make angle stacks; the input is kept. Check the AVO at the wells after conditioning: the operations keep the primaries&apos; amplitudes on known-truth tests, and the report states what was run.</p>
      {!stores.length ? <p className={muted}>Build a gather store first.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">Gathers
              <select className={input} value={storeId} onChange={(e) => setStoreId(e.target.value)} data-testid="qi-pre-cond-store">{stores.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </label>
            <label className="flex items-center gap-1"><input type="radio" name="qi-cond-op" checked={op === 'radon'} onChange={() => setOp('radon')} data-testid="qi-pre-cond-radon" />Radon demultiple</label>
            <label className="flex items-center gap-1"><input type="radio" name="qi-cond-op" checked={op === 'fx'} onChange={() => setOp('fx')} data-testid="qi-pre-cond-fx" />f-x noise attenuation</label>
          </div>
          {op === 'radon' ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1" title="Residual moveout at the far offset; events with more than this are taken as multiples">Cut (ms)<input className={`${input} w-16`} type="number" value={radon.cut} onChange={setR('cut')} data-testid="qi-pre-cond-cut" /></label>
                <label className="flex items-center gap-1">Moveout from (ms)<input className={`${input} w-16`} type="number" value={radon.qMin} onChange={setR('qMin')} /></label>
                <label className="flex items-center gap-1">to (ms)<input className={`${input} w-16`} type="number" value={radon.qMax} onChange={setR('qMax')} /></label>
                <label className="flex items-center gap-1" title="Sparse reweighting along the moveout axis; 0 is plain least squares">High resolution (iterations)<input className={`${input} w-12`} type="number" min="0" max="5" value={radon.highRes} onChange={setR('highRes')} data-testid="qi-pre-cond-hr" /></label>
                <label className="flex items-center gap-1" title="Each moveout carries an intercept and a gradient, so a primary whose amplitude changes with offset stays at zero moveout"><input type="checkbox" checked={radon.avo} onChange={setR('avo')} data-testid="qi-pre-cond-avo" />AVO terms</label>
                <label className="flex items-center gap-1">Window (ms)<input className={`${input} w-16`} type="number" value={radon.window} onChange={setR('window')} /></label>
                <label className="flex items-center gap-1">Up to (Hz)<input className={`${input} w-14`} type="number" value={radon.fMax} onChange={setR('fMax')} /></label>
              </div>
              <p className={muted}>Set the cut between the primaries&apos; residual moveout (a few ms after a good NMO) and the multiples&apos; (under-corrected by the primary velocity, usually 50 ms or more at the far offset); Prestack QC and the Gathers tab show both. A multiple that starts on a primary is the hard case: on the test gathers its primary&apos;s intercept came back within 6 percent and its gradient within 14 percent, from errors of 40 percent or more before. Radon costs about a second per gather, so try an area first.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1" title="Traces the prediction filter spans">Filter length (traces)<input className={`${input} w-12`} type="number" min="1" max="8" value={fx.length} onChange={setF('length')} data-testid="qi-pre-cond-fxlen" /></label>
                <label className="flex items-center gap-1">Window (ms)<input className={`${input} w-16`} type="number" value={fx.window} onChange={setF('window')} /></label>
                <label className="flex items-center gap-1">From (Hz)<input className={`${input} w-14`} type="number" value={fx.fLo} onChange={setF('fLo')} /></label>
                <label className="flex items-center gap-1">to (Hz, blank for most of the band)<input className={`${input} w-14`} type="number" value={fx.fHi} onChange={setF('fHi')} /></label>
              </div>
              <p className={muted}>f-x deconvolution keeps what is predictable from trace to trace and drops random noise. The prediction weakens a noisy event a little: on the test gathers intercepts came back 2 to 7 percent low at signal-to-noise of 6 to 0 dB, and within 1 percent on clean data. Use it where the noise hides the events; AVO fits over many traces already average random noise.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" checked={area.on} onChange={setA('on')} data-testid="qi-pre-cond-area" />Only an area</label>
            {area.on && (
              <>
                <label className="flex items-center gap-1">Inlines<input className={`${input} w-16`} type="number" value={area.il0} onChange={setA('il0')} aria-label="Area inline from" /><input className={`${input} w-16`} type="number" value={area.il1} onChange={setA('il1')} aria-label="Area inline to" /></label>
                <label className="flex items-center gap-1">Crosslines<input className={`${input} w-16`} type="number" value={area.xl0} onChange={setA('xl0')} aria-label="Area crossline from" /><input className={`${input} w-16`} type="number" value={area.xl1} onChange={setA('xl1')} aria-label="Area crossline to" /></label>
              </>
            )}
            <label className="flex items-center gap-1" title="Writes the removed multiples or noise as a third store to view on the Gathers tab"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="qi-pre-cond-keep" />Keep what was removed, for QC</label>
          </div>
          {built.error && <p className="text-pl-warning-text" data-testid="qi-pre-cond-problem">{built.error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" className={btn} onClick={run} disabled={!canWrite || !store || !!built.error || busy} data-testid="qi-pre-cond-run">{op === 'radon' ? 'Remove the multiples' : 'Attenuate the noise'}</button>
            {st?.error && <span className="text-pl-danger-text">{st.error}</span>}
            {st?.job?.status === 'failed' && <span className="text-pl-danger-text">{st.job.error_message || 'The job failed.'}</span>}
            {busy && <span className="text-pl-muted">{`${st.job.status}${st.job.progress ? `, ${Math.round(st.job.progress * 100)} percent` : ''}${st.job.progress_message ? `: ${st.job.progress_message}` : ''}`}</span>}
          </div>
        </>
      )}
      {runs.length > 0 && (
        <div className="space-y-2" data-testid="qi-pre-cond-runs">
          {runs.slice().reverse().map((r) => (
            <div key={r.jobId} className="space-y-1" data-testid={`qi-pre-cond-run-${r.jobId}`}>
              <p className="text-pl-text">{`${opName(r.kind)} of ${r.sourceName}: ${r.cdps} CDP${r.cdps === 1 ? '' : 's'}${r.area ? ` in inlines ${r.area.il[0]} to ${r.area.il[1]}, crosslines ${r.area.xl[0]} to ${r.area.xl[1]}` : ''}, ${pct(r.removedShare)} percent of the energy removed${Number.isFinite(r.secondsPerCdp) ? `, ${r.secondsPerCdp.toFixed(2)} s per gather` : ''}. ${settingsText(r.kind, r.settings)}. Output "${r.name}"${r.removedId ? ', with what was removed beside it' : ''}; compare them on the Gathers tab.`}</p>
              {r.failed > 0 && <p className="text-pl-warning-text">{`${r.failed} gather${r.failed === 1 ? '' : 's'} could not be conditioned and kept their input.`}</p>}
              {(r.warnings || []).map((w, i) => <p key={i} className="text-pl-warning-text">{typeof w === 'string' ? w : w.message}</p>)}
              {r.bands?.length > 0 && (
                <table className="text-xs">
                  <thead><tr><th className={th}>Time (ms)</th><th className={th}>Energy removed (percent)</th><th className={th}>Removed (dB)</th></tr></thead>
                  <tbody className="font-mono tabular-nums">
                    {r.bands.map((b) => <tr key={b.from_ms}><td className={td}>{`${b.from_ms} to ${b.to_ms}`}</td><td className={td}>{pct(b.removed_share)}</td><td className={td}>{Number.isFinite(b.removed_db) ? b.removed_db.toFixed(1) : EMPTY_VALUE}</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

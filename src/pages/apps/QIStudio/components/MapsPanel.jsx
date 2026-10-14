// Maps from volumes (QI upgrade P1.5, 2026-10-15): zone averages and
// probabilities between two horizons, or a horizon and a window below it, as
// map products: property maps (zone mean of a Q50), confidence maps (zone
// mean of the Q10 to Q90 spread), facies probability maps and zone
// statistics of any study volume. The seismic worker computes them
// (zone_maps); each map is then gridded onto the survey's world grid and
// saved as an attribute surface of the stack, which Seismolord's Surfaces
// list and Mapping & Surface Studio show and export (XYZ, CPS-3, ZMAP+, Irap).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import {
  mapInputs, productChoices, zoneMapProblem, zoneMapParams, zoneMapLabel, zoneText, FAMILY_LABEL,
} from '../services/zoneMapsRun';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const g4 = (v) => (Number.isFinite(v) ? Number(v).toPrecision(4) : EMPTY_VALUE);
export const MAPPING_PATH = '/dashboard/apps/geoscience/mapping-surface-studio';

export default function MapsPanel() {
  const { project, volumes, chosenVolumes, backend, jobs, canWrite, setMaps, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const inputs = useMemo(() => mapInputs(project, volumes), [project, volumes]);
  const [key, setKey] = useState('');
  const sel = inputs.find((x) => x.key === key) || inputs[0] || null;
  const choices = useMemo(() => productChoices(sel), [sel]);
  const [picked, setPicked] = useState(null);
  const on = picked || choices.filter((c) => c.defaultOn).map((c) => c.key);
  const [cutoffs, setCutoffs] = useState({});
  const [above, setAbove] = useState({});
  const [zone, setZone] = useState({ mode: 'base', topId: '', baseId: '', windowMs: '40' });
  const [horizons, setHorizons] = useState([]);
  const [job, setJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);
  const seismic = chosenVolumes.find((v) => v.id === sel?.seismicId) || volumes.find((v) => v.id === sel?.seismicId) || null;
  useEffect(() => {
    setHorizons([]);
    if (!seismic || !backend?.listHorizons) return undefined;
    let live = true;
    backend.listHorizons(seismic.id).then((h) => { if (live) setHorizons(h || []); }).catch(() => {});
    return () => { live = false; };
  }, [seismic?.id, backend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPicked(null); }, [sel?.key]);
  const z = { ...zone, topId: zone.topId || horizons[0]?.id || '', baseId: zone.baseId || horizons[1]?.id || '' };
  const problem = zoneMapProblem({ input: sel, picked: on, zone: z, cutoffs });
  const runs = project.maps?.runs || [];

  const run = async () => {
    const params = zoneMapParams({ input: sel, picked: on, zone: z, cutoffs, above });
    const words = zoneText(z, horizons);
    setJob({ job: { status: 'queued' } });
    try {
      const jobId = await client.enqueueJob('zone_maps', params);
      const stop = client.watchJob(jobId, (row, err) => {
        if (err) { setJob({ error: qiService.friendlyError(err) }); return; }
        setJob({ job: row });
        if (row?.status === 'succeeded') {
          const res = row.result_refs || {};
          setMaps((cur) => ({
            runs: [...(cur.runs || []), {
              jobId, at: row.finished_at || new Date().toISOString(), name: params.name, zone: words, input: { key: sel.key, name: sel.name, family: sel.family, unit: sel.unit, kind: sel.kind || null, seismicId: sel.seismicId },
              products: (res.products || []).map((p) => ({ ...p, ...zoneMapLabel(sel, p, words) })),
            }],
          }));
        }
      });
      stops.current.push(stop);
    } catch (e) { setJob({ error: qiService.friendlyError(e) }); }
  };

  const saveRun = async (r) => {
    const vol = chosenVolumes.find((v) => v.id === r.input.seismicId) || volumes.find((v) => v.id === r.input.seismicId);
    if (!vol) { addNotification('The stack these maps were made on is no longer in the study.', 'error'); return; }
    setSaving(true);
    try {
      const saved = [];
      for (const p of r.products) {
        if (p.surfaceId || !p.live) { saved.push(p); continue; }
        const values = await backend.downloadZoneMap(p.path);
        const row = await backend.saveZoneMap({
          seismic: vol, values, name: p.name, unit: p.unit,
          provenance: { zone: r.zone, input: r.input.name, product: p.key, statistic: p.kind === 'spread' ? (p.relative ? 'relative spread' : 'Q90 minus Q10') : p.stat, ...(p.stat === 'frac' ? { cutoff: p.cutoff, above: p.above !== false } : {}), job_id: r.jobId, qi_class: p.qiClass },
        });
        saved.push({ ...p, surfaceId: row.id });
      }
      await backend.removeZoneMapFiles?.(r.products.filter((p) => p.path).map((p) => p.path)).catch?.(() => {});
      setMaps((cur) => ({ runs: (cur.runs || []).map((x) => (x.jobId === r.jobId ? { ...x, products: saved, savedAt: new Date().toISOString() } : x)) }));
      addNotification(`${saved.filter((p) => p.surfaceId).length} map${saved.length === 1 ? '' : 's'} saved to the surface registry.`, 'success');
    } catch (e) {
      addNotification(e.message || 'The maps could not be saved.', 'error');
    } finally { setSaving(false); }
  };

  const status = () => {
    if (!job) return null;
    if (job.error) return <span className="text-pl-danger-text">{job.error}</span>;
    if (job.job?.status === 'failed') return <span className="text-pl-danger-text">{job.job.error_message || 'The zone map job failed.'}</span>;
    if (qiService.isActive(job.job)) return <span className="text-pl-muted">{`${job.job.status}${job.job.progress ? `, ${Math.round(job.job.progress * 100)} percent` : ''}`}</span>;
    return null;
  };
  const busy = !!job?.job && qiService.isActive(job.job);

  if (!inputs.length) return <section className={card} data-testid="qi-maps"><p className={muted}>Choose seismic volumes on Setup, or finish an inversion or property run, to make maps from volumes.</p></section>;
  const groups = ['seismic', 'value', 'triple', 'probability'].map((f) => [f, inputs.filter((x) => x.family === f)]).filter(([, l]) => l.length);
  return (
    <section className={card} data-testid="qi-maps">
      <h2 className="text-sm font-semibold text-pl-text">Maps from volumes</h2>
      <p className={muted}>A map from a volume over a zone: between two horizons, or a horizon and a window below it. Property maps take the zone mean of a Q50; confidence maps the zone mean of the spread from Q10 to Q90 (narrower is more confident); probability maps the zone mean of a facies probability, which is the expected share of the zone in that facies. The seismic worker computes them; save them to the surface registry to see and export them in Seismolord and Mapping &amp; Surface Studio.</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">Volume
          <select className={input} value={sel?.key || ''} onChange={(e) => setKey(e.target.value)} data-testid="qi-maps-input">
            {groups.map(([f, list]) => (
              <optgroup key={f} label={FAMILY_LABEL[f]}>
                {list.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1 text-xs" data-testid="qi-maps-products">
        {choices.map((c) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={on.includes(c.key)} onChange={() => setPicked(on.includes(c.key) ? on.filter((k) => k !== c.key) : [...on, c.key])} disabled={!canWrite} data-testid={`qi-maps-p-${c.key}`} />
              {c.label}
            </label>
            {c.needsCutoff && on.includes(c.key) && (
              <>
                <select className={input} value={above[c.key] === false ? 'below' : 'above'} onChange={(e) => setAbove((a) => ({ ...a, [c.key]: e.target.value !== 'below' }))} aria-label="Above or below the cutoff"><option value="above">above</option><option value="below">below</option></select>
                <input className={`${input} w-20`} type="number" step="any" value={cutoffs[c.key] ?? c.cutoff ?? ''} onChange={(e) => setCutoffs((x) => ({ ...x, [c.key]: e.target.value }))} aria-label="Cutoff" data-testid={`qi-maps-cutoff-${c.key}`} />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="qi-maps-zone">
        <label className="flex items-center gap-1">Top
          <select className={input} value={z.topId} onChange={(e) => setZone((x) => ({ ...x, topId: e.target.value }))} data-testid="qi-maps-top">
            {horizons.length ? horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>) : <option value="">No horizons on this stack</option>}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="radio" name="qi-maps-mode" checked={zone.mode === 'base'} onChange={() => setZone((x) => ({ ...x, mode: 'base' }))} />to the horizon
          <select className={input} value={z.baseId} onChange={(e) => setZone((x) => ({ ...x, baseId: e.target.value }))} disabled={zone.mode !== 'base'} data-testid="qi-maps-base">
            {horizons.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="radio" name="qi-maps-mode" checked={zone.mode === 'window'} onChange={() => setZone((x) => ({ ...x, mode: 'window' }))} data-testid="qi-maps-mode-window" />or a window below it of
          <input className={`${input} w-16`} type="number" min="1" max="2000" value={zone.windowMs} onChange={(e) => setZone((x) => ({ ...x, windowMs: e.target.value }))} disabled={zone.mode !== 'window'} aria-label="Window below the top (ms)" data-testid="qi-maps-window" /> ms
        </label>
      </div>
      {problem && <p className="text-xs text-pl-warning-text" data-testid="qi-maps-problem">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className={btn} onClick={run} disabled={!canWrite || !!problem || busy} data-testid="qi-maps-run">Make the maps</button>
        {status()}
      </div>
      {runs.length > 0 && (
        <div className="space-y-3" data-testid="qi-maps-runs">
          {[...runs].reverse().map((r) => (
            <div key={r.jobId} className="rounded border border-pl-border p-3 space-y-2">
              <p className="text-xs text-pl-text">{`${r.input.name}, ${r.zone}, ${String(r.at).slice(0, 16).replace('T', ' ')}`}</p>
              <table className="text-xs">
                <thead><tr><th className={th}>Map</th><th className={th}>Unit</th><th className={th}>Traces</th><th className={th}>Min</th><th className={th}>Mean</th><th className={th}>Max</th><th className={th}>Registry</th></tr></thead>
                <tbody>
                  {r.products.map((p) => (
                    <tr key={p.key}>
                      <td className={td}>{p.name}</td><td className={td}>{p.unit}</td>
                      <td className={`${td} font-mono`}>{p.live ?? EMPTY_VALUE}</td>
                      <td className={`${td} font-mono`}>{g4(p.min)}</td><td className={`${td} font-mono`}>{g4(p.mean)}</td><td className={`${td} font-mono`}>{g4(p.max)}</td>
                      <td className={td}>{p.surfaceId ? 'saved' : p.live ? 'not saved' : 'no values'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.products.some((p) => !p.surfaceId && p.live) && canWrite && <button type="button" className={btn} onClick={() => saveRun(r)} disabled={saving} data-testid={`qi-maps-save-${r.jobId}`}>{saving ? 'Saving' : 'Save the maps to the surface registry'}</button>}
                {r.products.some((p) => p.surfaceId) && <Link className="underline" to={MAPPING_PATH}>Open in Mapping &amp; Surface Studio</Link>}
                {r.products.some((p) => p.surfaceId) && <span className="text-pl-muted">Seismolord lists them under the stack&apos;s Surfaces; both apps export them.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Tops to Horizons (plan: docs/scope/Seismolord-TOPS-TO-HORIZONS-PLAN.md).
//
// From a field's well tops to a named, well-tied horizon framework in one
// place, every automatic decision explained and nothing saved until the
// interpreter accepts it:
//   1 Wells     tie every well that has a sonic, one polarity and phase for
//               the field, every top matched to its seismic event
//   2 Review    tops x wells: the chosen event, how far it sits from the
//               prediction, its score, a trace thumbnail; change any event,
//               leave any top out; thin beds shown riding on a neighbour
//   3 Faults    use existing faults, or pick faults automatically over an
//               area of interest and accept the ones to keep
//   4 Track     the accepted tops tracked (no crossing, fault barriers at
//               each horizon's level, blocks no well reaches carried across
//               by a fault jump), with coverage, tuned and jumped cells,
//               leave-one-well-out error and misties; Accept saves them
//   5 Prognosis where a planned well will meet each horizon
// The heavy work runs in workers/framework.worker.js (runJob).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban, CheckCheck, Layers, Loader2, Play, Target, Waypoints,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { listUnits } from '@/lib/stratRegistry';
import { orderedUnits } from '@/lib/stratigraphy/column';
import { listLogs, downloadCurve, effectiveCheckshots } from '../../../services/wellsService';
import { saveHorizon } from '../../../services/horizonsService';
import {
  pipelineWells, loadTieLogs, fieldTopOrder, saveFramework,
} from '../../../services/topsToHorizons';
import {
  applyChoices, defaultAoi, LOWO_MAX_TRACES,
} from '../../../services/topsToHorizonsPipeline';
import { findEvents } from '../../../engine/topsToEvents';
import { predictTops } from '../../../engine/framework';
import AutoFaultPicker from '../AutoFaultPicker';
import { makeTvdssToTwt, buildWellLatticePath } from '../../../engine/wellSection';

const KIND_LABEL = {
  peak: 'Peak', trough: 'Trough', zero_pos: 'Zero − to +', zero_neg: 'Zero + to −',
};
const STEPS = [
  { key: 'wells', label: '1 Wells' },
  { key: 'review', label: '2 Review' },
  { key: 'faults', label: '3 Faults' },
  { key: 'track', label: '4 Track' },
  { key: 'prognosis', label: '5 Prognosis' },
];
const selectCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-1 text-xs';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '·' : v.toFixed(d));
const scoreColour = (s) => (s >= 0.6 ? 'text-emerald-300' : s >= 0.3 ? 'text-amber-300' : 'text-rose-300');

/** A trace thumbnail: amplitude across, time down, the prediction dashed
 *  and the chosen event solid. */
function Thumb({ thumb, predSample, chosenSample }) {
  if (!thumb) return null;
  const w = 64;
  const h = 56;
  const n = thumb.values.length;
  let max = 1e-12;
  for (const v of thumb.values) max = Math.max(max, Math.abs(v));
  const pts = thumb.values.map((v, i) => `${(w / 2 + (v / max) * (w / 2 - 2)).toFixed(1)},${((i / (n - 1)) * h).toFixed(1)}`).join(' ');
  const y = (s) => ((s - thumb.s0) / (n - 1)) * h;
  return (
    <svg width={w} height={h} className="bg-slate-950 rounded" aria-hidden="true">
      <line x1={w / 2} x2={w / 2} y1={0} y2={h} stroke="#334155" strokeWidth="0.5" />
      <polyline points={pts} fill="none" stroke="#94a3b8" strokeWidth="1" />
      {predSample != null && <line x1={0} x2={w} y1={y(predSample)} y2={y(predSample)} stroke="#f59e0b" strokeDasharray="3 2" strokeWidth="1" />}
      {chosenSample != null && <line x1={0} x2={w} y1={y(chosenSample)} y2={y(chosenSample)} stroke="#22d3ee" strokeWidth="1.5" />}
    </svg>
  );
}

export default function TopsToHorizonsDialog({
  open, onOpenChange, volume, manifest, geom, affine, wells = [], velocity = null, boundaries = null,
  horizons = [], faults = [], runJob, onHorizonsSaved, onFaultsSaved, faultInputs = [],
}) {
  const { toast } = useToast();
  const dtUs = manifest?.geometry?.dt_us;
  const dtMs = dtUs ? dtUs / 1000 : null;
  const [step, setStep] = useState('wells');
  const [autoTie, setAutoTie] = useState(true);
  const [match, setMatch] = useState(null);
  const [exclude, setExclude] = useState(new Set());
  const [events, setEvents] = useState({});
  const [cellOpen, setCellOpen] = useState(null);           // {top, well}
  const [useFaultIds, setUseFaultIds] = useState(new Set());
  const [aoi, setAoi] = useState(null);
  const [jump, setJump] = useState(true);
  const [lowo, setLowo] = useState(true);
  const [track, setTrack] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(null);                   // null|'match'|'faults'|'track'|'save'
  const [error, setError] = useState(null);
  const [savedCount, setSavedCount] = useState(null);
  const [progWell, setProgWell] = useState('');
  const jobRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep('wells');
    setError(null);
    setUseFaultIds(new Set(faults.map((f) => f.id)));
    setLowo(Boolean(geom) && geom.nIl * geom.nXl <= LOWO_MAX_TRACES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => jobRef.current?.cancel(), []);

  const wellInfo = useMemo(() => wells.map((w) => {
    const eff = effectiveCheckshots(w);
    let source = 'none';
    if (eff.rows.length >= 2) source = eff.derived ? 'tie' : 'checkshots';
    else if (velocity) source = 'model';
    return {
      id: w.id, name: w.name, tops: (w.tops || []).length, source,
    };
  }), [wells, velocity]);

  const run = async (kind, config) => {
    setBusy(kind);
    setError(null);
    setProgress(null);
    const job = runJob(kind, config, (stage, done, total) => setProgress({ stage, done, total }));
    jobRef.current = job;
    try {
      return await job.promise;
    } finally {
      if (jobRef.current === job) jobRef.current = null;
      setBusy(null);
      setProgress(null);
    }
  };

  const tieAndMatch = async () => {
    try {
      setBusy('match');
      const logs = autoTie ? await loadTieLogs(wells, { listLogs, downloadCurve }) : new Map();
      let order = null;
      try {
        order = fieldTopOrder(wells, orderedUnits(await listUnits()));
      } catch {
        order = fieldTopOrder(wells);
      }
      const r = await run('match', {
        geom, dtUs, affine, wells: pipelineWells(wells, logs), velocity, boundaries, order, autoTie,
      });
      setMatch(r);
      setExclude(new Set());
      setEvents({});
      setTrack(null);
      setSavedCount(null);
      setAoi(defaultAoi(r.wells, geom));
      setStep('review');
    } catch (e) {
      if (!/cancel/i.test(e.message)) setError(e.message);
      setBusy(null);
    }
  };

  const trackFramework = async () => {
    try {
      const edited = applyChoices(match.match, { exclude: [...exclude], events });
      const barrierFaults = faults.filter((f) => useFaultIds.has(f.id)).map((f) => ({ name: f.name, sticks: f.sticks }));
      const r = await run('track', {
        geom, dtUs, match: edited, wells: match.wells, faults: barrierFaults, jump, lowo,
      });
      setTrack(r);
      setSavedCount(null);
    } catch (e) {
      if (!/cancel/i.test(e.message)) setError(e.message);
    }
  };

  const accept = async () => {
    setBusy('save');
    try {
      const saved = await saveFramework({
        volume,
        dtUs,
        horizons: track.horizons,
        convention: match.convention,
        takenNames: new Set(horizons.map((h) => h.name)),
        saveHorizon,
      });
      await onHorizonsSaved?.(saved);
      setSavedCount(saved.length);
      toast({ title: 'Horizons saved', description: `${saved.length} horizons named after their tops.` });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const prognosis = useMemo(() => {
    if (!progWell || !track || !affine || !geom) return null;
    const w = wells.find((x) => x.id === progWell);
    if (!w) return null;
    // the well's own relation, else the volume model, else the nearest well's checkshots
    let timeConv = makeTvdssToTwt({
      checkshots: effectiveCheckshots(w).rows, velocity, boundaries, dtUs, maxTwtMs: geom.ns * dtMs,
    });
    let basis = timeConv?.source || null;
    if (!timeConv) {
      const near = wells.filter((x) => x.id !== w.id && effectiveCheckshots(x).rows.length >= 2)
        .sort((a, b) => Math.hypot(a.surfaceX - w.surfaceX, a.surfaceY - w.surfaceY)
          - Math.hypot(b.surfaceX - w.surfaceX, b.surfaceY - w.surfaceY))[0];
      if (near) {
        timeConv = makeTvdssToTwt({ checkshots: effectiveCheckshots(near).rows, dtUs, maxTwtMs: geom.ns * dtMs });
        basis = `checkshots of ${near.name}`;
      }
    }
    if (!timeConv) return { error: 'No time-depth relation: add checkshots or a velocity model.' };
    const lat = buildWellLatticePath({ ...w, tops: [] }, {
      affine, timeConv, geom, dtUs,
    });
    if (!lat) return { error: 'The well path does not cross the survey.' };
    const rms = track.horizons.map((h) => h.lowo?.rmsMs).filter((v) => v != null);
    const sigmaMs = rms.length ? Math.max(...rms) : track.mistieStats?.rmsMs ?? null;
    const rows = predictTops(lat.points, new Map(track.horizons.map((h) => [h.name, h.picks])), geom, { dtMs, sigmaMs });
    return { rows, basis, sigmaMs };
  }, [progWell, track, wells, affine, geom, velocity, boundaries, dtUs, dtMs]);

  const tops = match?.match?.tops || [];
  const wellNames = match?.wells?.map((w) => w.name) || [];
  const tunedAt = (top, wName) => match?.match?.wells.find((w) => w.name === wName)?.tuned.some((g) => g.includes(top)) || false;

  const progressText = progress ? `${progress.stage.replace(/^track:/, 'tracking ').replace(/^lowo:/, 'checking ')} ${progress.done} / ${progress.total}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="sl-tops-to-horizons">
        <DialogHeader>
          <DialogTitle className="flex items-center text-white">
            <Waypoints className="w-5 h-5 mr-2 text-cyan-400" />
            Tops to Horizons
          </DialogTitle>
        </DialogHeader>
        {!volume || !geom ? (
          <p className="text-sm text-slate-400">Open a converted volume in the viewer first.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1">
              {STEPS.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={step === s.key ? 'default' : 'outline'}
                  onClick={() => setStep(s.key)}
                  disabled={s.key !== 'wells' && !match}
                  data-testid={`t2h-step-${s.key}`}
                >
                  {s.label}
                </Button>
              ))}
              {busy && (
                <span className="ml-auto flex items-center text-xs text-slate-300">
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {progressText || 'Working'}
                  <Button size="sm" variant="ghost" className="ml-2" onClick={() => jobRef.current?.cancel()}>
                    <Ban className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </span>
              )}
            </div>
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}

            {step === 'wells' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  Every visible well with tops takes part. Wells with a sonic log are tied automatically;
                  the others use their checkshots, or the volume&apos;s velocity model with a wider uncertainty.
                </p>
                <table className="w-full text-xs text-slate-300">
                  <thead><tr className="text-slate-500 text-left"><th>Well</th><th>Tops</th><th>Time from</th><th>Tie</th></tr></thead>
                  <tbody>
                    {wellInfo.map((w) => {
                      const tie = match?.ties.find((t) => t.name === w.name);
                      const skip = match?.skipped.find((s) => s.name === w.name);
                      return (
                        <tr key={w.id} className="border-t border-slate-800">
                          <td className="py-1">{w.name}</td>
                          <td>{w.tops}</td>
                          <td>{w.source === 'none' ? <span className="text-rose-300">nothing</span> : w.source}</td>
                          <td>
                            {skip && <span className="text-rose-300">{skip.reason}</span>}
                            {tie && (
                              <span className={tie.quality === 'good' ? 'text-emerald-300' : tie.quality === 'fair' ? 'text-amber-300' : 'text-rose-300'}>
                                {`${tie.quality}: shift ${fmt(tie.shiftMs)} ms, phase ${fmt(tie.phaseDeg, 0)}°, r ${fmt(tie.corr, 2)}`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!wells.length && <p className="text-sm text-amber-300">No wells are visible. Show wells with tops in the explorer first.</p>}
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-300 flex items-center gap-1">
                    <input type="checkbox" checked={autoTie} onChange={(e) => setAutoTie(e.target.checked)} />
                    Tie wells automatically
                  </label>
                  <Button size="sm" onClick={tieAndMatch} disabled={!!busy || !wells.length} data-testid="t2h-match">
                    <Play className="w-4 h-4 mr-1" />
                    Tie and match tops
                  </Button>
                </div>
                {match && (
                  <p className="text-xs text-slate-400" data-testid="t2h-convention">
                    {`Field convention: ${match.convention.polarity} polarity, ${fmt(match.convention.phaseDeg, 0)}° phase`
                      + `${match.convention.voters ? ` from ${match.convention.voters} tied wells` : ' (assumed; no well was tied)'}`}
                    {match.convention.outliers?.length ? `. Disagreeing: ${match.convention.outliers.map((o) => `${o.name} (${o.reason})`).join(', ')}` : ''}
                    {`. Tuning thickness about ${fmt(match.match.tuningMs)} ms at ${fmt(match.match.peakHz, 0)} Hz.`}
                  </p>
                )}
              </div>
            )}

            {step === 'review' && match && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Each cell is the event chosen for that top at that well: its kind, how far it sits from the
                  predicted time, and its score. Amber dashes are the prediction, cyan the choice. Click a cell to choose another event.
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs text-slate-300" data-testid="t2h-board">
                    <thead>
                      <tr className="text-slate-500 text-left">
                        <th className="pr-2">Top</th>
                        <th className="pr-2">Use</th>
                        {wellNames.map((n) => <th key={n} className="px-1">{n}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {tops.map((t) => (
                        <tr key={t.name} className="border-t border-slate-800 align-top">
                          <td className="pr-2 py-1">
                            <div className="text-slate-100">{t.name}</div>
                            <div className="text-slate-500">
                              {t.role === 'conformable' ? `thin: rides on ${t.representative}` : KIND_LABEL[t.kind] || 'no event'}
                            </div>
                          </td>
                          <td className="pr-2">
                            <input
                              type="checkbox"
                              aria-label={`Use ${t.name}`}
                              checked={!exclude.has(t.name)}
                              onChange={(e) => setExclude((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.delete(t.name); else n.add(t.name);
                                return n;
                              })}
                            />
                          </td>
                          {wellNames.map((wn) => {
                            const at = t.atWells[wn];
                            const w = match.wells.find((x) => x.name === wn);
                            const topRow = w?.tops.find((q) => q.name === t.name);
                            if (!topRow) return <td key={wn} className="px-1 text-slate-600">absent</td>;
                            if (t.role === 'conformable') {
                              return <td key={wn} className="px-1 text-slate-500">{`${fmt(t.offsetsMs?.[wn])} ms below`}</td>;
                            }
                            const over = events[t.name]?.[wn];
                            const chosen = over ?? at?.choice?.sample ?? null;
                            const isOpen = cellOpen?.top === t.name && cellOpen?.well === wn;
                            return (
                              <td key={wn} className="px-1">
                                <button
                                  type="button"
                                  className="text-left hover:bg-slate-800 rounded p-0.5"
                                  onClick={() => setCellOpen(isOpen ? null : { top: t.name, well: wn })}
                                >
                                  <Thumb thumb={w.thumbs[t.name]} predSample={topRow.predSample} chosenSample={chosen} />
                                  {at?.choice || over != null ? (
                                    <div className={over != null ? 'text-cyan-300' : scoreColour(at.choice.score)}>
                                      {over != null ? 'your choice' : `${fmt((at.choice.sample - topRow.predSample) * dtMs)} ms · ${fmt(at.choice.score, 2)}`}
                                    </div>
                                  ) : <div className="text-rose-300">unmatched</div>}
                                  {tunedAt(t.name, wn) && <div className="text-amber-300">tuned here</div>}
                                </button>
                                {isOpen && (
                                  <div className="mt-1 space-y-0.5">
                                    {findEvents(Float32Array.from(w.thumbs[t.name].values), 1, w.thumbs[t.name].values.length - 2)
                                      .map((ev) => ({ ...ev, sample: ev.sample + w.thumbs[t.name].s0 }))
                                      .sort((a, b) => Math.abs(a.sample - topRow.predSample) - Math.abs(b.sample - topRow.predSample))
                                      .slice(0, 6)
                                      .map((ev) => (
                                        <button
                                          key={`${ev.kind}${ev.sample}`}
                                          type="button"
                                          className="block text-left text-slate-300 hover:text-white"
                                          onClick={() => {
                                            setEvents((s) => ({ ...s, [t.name]: { ...(s[t.name] || {}), [wn]: ev.sample } }));
                                            setCellOpen(null);
                                          }}
                                        >
                                          {`${KIND_LABEL[ev.kind]} ${fmt((ev.sample - topRow.predSample) * dtMs)} ms`}
                                        </button>
                                      ))}
                                    {over != null && (
                                      <button
                                        type="button"
                                        className="block text-left text-slate-400 hover:text-white"
                                        onClick={() => setEvents((s) => {
                                          const n = { ...s, [t.name]: { ...(s[t.name] || {}) } };
                                          delete n[t.name][wn];
                                          return n;
                                        })}
                                      >
                                        Back to the automatic choice
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setStep('faults')}>Next: faults</Button>
                </div>
              </div>
            )}

            {step === 'faults' && match && (
              <div className="space-y-3">
                <div>
                  <Label className="text-slate-300">Faults used as barriers</Label>
                  {!faults.length && <p className="text-xs text-slate-500">This volume has no faults yet.</p>}
                  <div className="flex flex-wrap gap-3 mt-1">
                    {faults.map((f) => (
                      <label key={f.id} className="text-xs text-slate-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={useFaultIds.has(f.id)}
                          onChange={(e) => setUseFaultIds((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(f.id); else n.delete(f.id);
                            return n;
                          })}
                        />
                        {f.name}
                        {f.params?.source === 'auto' && <span className="text-slate-500">(auto)</span>}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-800 pt-3">
                  <AutoFaultPicker
                    geom={geom}
                    dtMs={dtMs}
                    volume={volume}
                    faults={faults}
                    inputs={faultInputs}
                    initialAoi={aoi}
                    run={run}
                    busy={busy}
                    onError={setError}
                    onSaved={(rows) => {
                      onFaultsSaved?.(rows);
                      setUseFaultIds((s) => new Set([...s, ...rows.map((r) => r.id)]));
                      toast({ title: 'Faults saved', description: `${rows.length} automatic ${rows.length === 1 ? 'fault' : 'faults'}, used as barriers.` });
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setStep('track')}>Next: track</Button>
                </div>
              </div>
            )}

            {step === 'track' && match && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={jump} onChange={(e) => setJump(e.target.checked)} />
                    Carry horizons across faults into blocks no well reaches
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={lowo} onChange={(e) => setLowo(e.target.checked)} />
                    Leave-one-well-out check (tracks each horizon once per well)
                  </label>
                  <Button size="sm" onClick={trackFramework} disabled={!!busy} data-testid="t2h-track">
                    <Layers className="w-4 h-4 mr-1" />
                    Track the framework
                  </Button>
                </div>
                {track && (
                  <>
                    <table className="w-full text-xs text-slate-300" data-testid="t2h-results">
                      <thead>
                        <tr className="text-slate-500 text-left">
                          <th>Horizon</th><th>Made as</th><th>Traces</th><th>Tuned</th><th>Across faults</th><th>Leave-one-out error</th><th>Misties (RMS)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {track.horizons.map((h) => {
                          let n = 0;
                          for (const v of h.picks) if (Math.abs(v) < 1e29) n += 1;
                          const mis = track.misties.filter((r) => r.top === h.name && r.mistieMs != null);
                          const rms = mis.length ? Math.sqrt(mis.reduce((a, r) => a + r.mistieMs ** 2, 0) / mis.length) : null;
                          return (
                            <tr key={h.name} className="border-t border-slate-800">
                              <td className="py-1 text-slate-100">{h.name}</td>
                              <td>{h.role === 'conformable' ? `on ${h.representative} + isochron` : `${KIND_LABEL[h.kind]}, ${h.seeds.length} wells`}</td>
                              <td>{`${n} (${fmt((100 * n) / (geom.nIl * geom.nXl), 0)} %)`}</td>
                              <td>{h.stats.tuned ?? '·'}</td>
                              <td>{h.stats.jumped ? `${h.stats.jumped} (throw ${h.jumps.filter((j) => !j.skipped).map((j) => fmt(j.throwSamples * dtMs)).join(', ')} ms)` : '·'}</td>
                              <td>{h.lowo ? `${fmt(h.lowo.rmsMs)} ms over ${h.lowo.reached}/${h.lowo.n} wells` : '·'}</td>
                              <td>{rms == null ? '·' : `${fmt(rms)} ms`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-slate-500">
                      Confidence maps ride with each horizon: tuned cells and cells carried across a fault score lower, so the Map window shows where to look.
                    </p>
                    <div className="flex items-center gap-3">
                      <Button size="sm" onClick={accept} disabled={!!busy || savedCount != null} data-testid="t2h-accept">
                        <CheckCheck className="w-4 h-4 mr-1" />
                        {savedCount != null ? `Saved ${savedCount} horizons` : `Accept and save ${track.horizons.length} horizons`}
                      </Button>
                      {savedCount != null && (
                        <Button size="sm" variant="outline" onClick={() => setStep('prognosis')}>
                          <Target className="w-4 h-4 mr-1" />
                          Prognosis for a well
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 'prognosis' && (
              <div className="space-y-2">
                {!track ? <p className="text-sm text-slate-400">Track the framework first.</p> : (
                  <>
                    <p className="text-xs text-slate-400">
                      Where a well (planned or drilled) meets each horizon, with a band from the framework&apos;s own
                      leave-one-well-out error.
                    </p>
                    <select className={selectCls} value={progWell} onChange={(e) => setProgWell(e.target.value)} aria-label="Well">
                      <option value="">Choose a well</option>
                      {wells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    {prognosis?.error && <p className="text-sm text-amber-300">{prognosis.error}</p>}
                    {prognosis?.rows && (
                      <table className="w-full text-xs text-slate-300" data-testid="t2h-prognosis">
                        <thead><tr className="text-slate-500 text-left"><th>Horizon</th><th>MD (m)</th><th>TVDSS (m)</th><th>Band (m)</th></tr></thead>
                        <tbody>
                          {prognosis.rows.map((r) => (
                            <tr key={r.name} className="border-t border-slate-800">
                              <td className="py-1">{r.name}</td>
                              <td>{fmt(r.md)}</td>
                              <td>{fmt(r.tvdss)}</td>
                              <td>{r.bandM == null ? '·' : `± ${fmt(r.bandM)}`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {prognosis?.basis && <p className="text-xs text-slate-500">{`Time from: ${prognosis.basis}.`}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// prestack_qc: QC of a gather store before AVO and inversion (QI programme
// Q4b, 2026-10-07; SOW section 3), by the engines' qi/prestackQc.js. CDPs are
// sampled on a regular stride (about 1,500 of them); at each event time the
// residual moveout at the far offset (gathers that should be flat), the fold
// and the far covered offset, and, given an RMS velocity, the offset beyond
// which NMO stretch passes the limit. The result carries the statistics,
// the sampled maps and the issues a QI study records. Read only.
//
// params: { dataset_id (gathers_offset), times_ms? (1 to 4; default three
//   across the trace), velocity? {t_ms, vrms}, max_stretch? (0.3), min_fold? (1) }
import { JobFailure } from '../runJob.js';
import { residualMoveout, foldSummary, stretchMuteOffset } from '../../../../packages/engines/engines/qi/prestackQc.js';
import { velocityOnGrid } from '../../../../packages/engines/engines/qi/prestack.js';
import { readGather, gatherBlockKey, foldBlockKey } from '../../../../packages/engines/engines/qi/gatherStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_CDPS = 1500;
const fin = Number.isFinite;

export function validatePrestackQcParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  if (p.times_ms != null && !(Array.isArray(p.times_ms) && p.times_ms.length >= 1 && p.times_ms.length <= 4 && p.times_ms.every((t) => t > 0))) return 'Give one to four event times in ms.';
  if (p.velocity != null && !(Array.isArray(p.velocity.t_ms) && Array.isArray(p.velocity.vrms) && p.velocity.t_ms.length === p.velocity.vrms.length && p.velocity.t_ms.length)) return 'The velocity needs a table of times and RMS velocities.';
  if (p.max_stretch != null && !(p.max_stretch > 0 && p.max_stretch < 1)) return 'The stretch limit must be between 0 and 1.';
  return null;
}

/**
 * Whether a CDP's residual-moveout reading rests on a real event. The near
 * offsets build the reference, so they correlate with it even in noise; past
 * them, a real event (AVO change included) stays similar across the nearer
 * half of the spread, and noise does not. A window with no reflector (the
 * Benin sands of the Ekene kit at 570 ms) otherwise reads its noise as tens
 * of milliseconds of moveout and asks for the gathers to be flattened.
 */
export function coherentEvent(m, { nearCount = 3, minCorr = 0.5, share = 0.6 } = {}) {
  const c = (m?.corr || []).slice(nearCount, nearCount + Math.ceil(((m?.corr || []).length - nearCount) / 2));
  const live = c.filter(fin);
  if (live.length < 2) return false;
  return live.filter((v) => Math.abs(v) >= minCorr).length >= share * live.length;
}

/** Median far-offset residuals (ms) that flag moveout, and that make it high. */
export const RMO_MEDIAN_FLAG = 3;
export const RMO_MEDIAN_HIGH = 6;

/** Below this share of coherent CDPs a time has no event to measure. */
export const MIN_COHERENT_SHARE = 0.2;

const q = (sorted, f) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : NaN);

/** Issues from the QC result. */
export function prestackQcIssues(r, name) {
  const out = [];
  const add = (key, severity, title, detail, remedy) => out.push({ key: `prestack-qc:${name}:${key}`, area: 'Prestack QC', severity, title, detail, remedy });
  for (const t of r.times) {
    // systematic moveout shows in the median; the 90th percentile alone is
    // the noisiest CDPs (on the flat Ekene gathers it read 6.6 and 8.5 ms with
    // medians of 2.3 and 0.8), so it raises a low note to look, not a flatten
    if (fin(t.rmoMedian) && t.rmoMedian > RMO_MEDIAN_FLAG && fin(t.rmoQ90) && t.rmoQ90 > 4) {
      add(`rmo:${t.t_ms}`, t.rmoMedian > RMO_MEDIAN_HIGH ? 'high' : 'medium', `Residual moveout at ${t.t_ms} ms`, `The median far-offset residual is ${t.rmoMedian.toFixed(1)} ms (90th percentile ${t.rmoQ90.toFixed(1)}); ${(100 * t.rmoShareOver4).toFixed(0)} percent of the sampled CDPs exceed 4 ms.`, 'Flatten the gathers (trim statics or a velocity update) before AVO or inversion.');
    } else if (fin(t.rmoQ90) && t.rmoQ90 > 8) {
      add(`rmo-scatter:${t.t_ms}`, 'low', `Residual moveout scatter at ${t.t_ms} ms`, `The median far-offset residual is ${fin(t.rmoMedian) ? t.rmoMedian.toFixed(1) : 'n/a'} ms, but 10 percent of the sampled CDPs read more than ${t.rmoQ90.toFixed(1)} ms.`, 'Look at the residual map: scattered CDPs are usually noise or local statics; a cluster calls for trim statics there.');
    }
    if (fin(t.stretchMuteM) && fin(r.fold.farMedianM) && t.stretchMuteM < r.fold.farMedianM) {
      add(`stretch:${t.t_ms}`, 'low', `NMO stretch at ${t.t_ms} ms`, `Beyond ${Math.round(t.stretchMuteM)} m the stretch passes ${(100 * r.maxStretch).toFixed(0)} percent, inside the ${Math.round(r.fold.farMedianM)} m of covered offset.`, 'Mute the stretched far offsets before angle stacks, or keep the far angle range to where the stretch holds.');
    }
  }
  if (r.fold.lowShare > 0.1) add('fold', 'medium', 'Low fold in part of the survey', `${(100 * r.fold.lowShare).toFixed(0)} percent of the sampled CDPs have under half the median fold (${r.fold.median}).`, 'Treat amplitudes there with care; the angle stacks are noisier where the fold drops.');
  return out;
}

export async function prestackQc(ctx, deps) {
  const p = ctx.params || {};
  const problem = validatePrestackQcParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const { data: ds, error } = await admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (error) throw new Error(`Could not read the gathers record: ${error.message}`);
  if (!ds || ds.user_id !== uid) throw new JobFailure('not_found', 'The gathers were not found in your account.');
  if (ds.kind !== 'gathers_offset' || ds.status !== 'uploaded') throw new JobFailure('validate_failed', 'Choose a gather store (offset gathers).');
  const prefix = ds.object_key.replace(/\/manifest\.json$/, '');
  const getObject = deps.getObject || (async (key) => {
    const r = await fetchImpl(await sign('GET', ds.bucket, key));
    if (!r.ok) throw new Error(`Could not read ${key} (${r.status}).`);
    return r.arrayBuffer();
  });
  const m = JSON.parse(new TextDecoder().decode(await getObject(ds.object_key)));
  const g = m.geometry; const ns = g.ns; const dtMs = g.dt_us / 1000;
  const cb = m.blocks.size; const centres = m.bins.centres; const nBins = centres.length;
  const present = new Set((m.blocks_present || []).map(([a, b]) => `${a}-${b}`));
  const traceMs = (ns - 1) * dtMs;
  const times = (p.times_ms || [0.3, 0.55, 0.8].map((f) => Math.round(f * traceMs))).filter((t) => t < traceMs);
  const maxStretch = p.max_stretch ?? 0.3;
  const minFold = p.min_fold ?? 1;
  const vel = p.velocity ? velocityOnGrid(p.velocity.t_ms, p.velocity.vrms, ns, dtMs) : null;
  const stride = Math.max(1, Math.round(Math.sqrt((g.il.count * g.xl.count) / TARGET_CDPS)));

  const rmo = times.map(() => []); const coherent = times.map(() => 0); const foldTotals = []; const farOffsets = []; const sampled = [];
  const cache = new Map();
  const block = async (bi, bj) => {
    const k = `${bi}-${bj}`;
    if (!present.has(k)) return null;
    if (!cache.has(k)) {
      if (cache.size > 64) cache.clear();
      cache.set(k, { data: new Float32Array(await getObject(`${prefix}/${gatherBlockKey(bi, bj)}`)), fold: new Uint16Array(await getObject(`${prefix}/${foldBlockKey(bi, bj)}`)) });
    }
    return cache.get(k);
  };
  for (let il = Math.floor(stride / 2); il < g.il.count; il += stride) {
    if (ctx.cancelled) return null;
    for (let xl = Math.floor(stride / 2); xl < g.xl.count; xl += stride) {
      const blk = await block(Math.floor(il / cb), Math.floor(xl / cb));
      if (!blk) continue;
      const gather = readGather(blk.data, blk.fold, { cb, nBins, ns }, il % cb, xl % cb);
      if (!gather.fold.some((f) => f > 0)) continue;
      const fs = foldSummary(gather.fold, centres, minFold);
      foldTotals.push(fs.total); farOffsets.push(fs.farOffset);
      const traces = gather.traces.map((t, b) => (gather.fold[b] ? t : new Float32Array(ns).fill(NaN)));
      times.forEach((t, k) => {
        const m = residualMoveout({ traces, offsets: centres, dtMs, centreMs: t });
        if (coherentEvent(m)) { coherent[k] += 1; rmo[k].push(m.rmoFarMs); } else rmo[k].push(NaN);
      });
      sampled.push([il, xl]);
    }
    ctx.progress(0.95 * (il / g.il.count), 'Measuring the gathers');
  }
  if (!sampled.length) throw new JobFailure('validate_failed', 'No live gather was found to measure.');
  const sortedFold = foldTotals.slice().sort((a, b) => a - b);
  const medFold = q(sortedFold, 0.5);
  const farSorted = farOffsets.filter(fin).sort((a, b) => a - b);
  const result = {
    dataset_id: ds.id, name: ds.name, stride, cdps: sampled.length, maxStretch,
    fold: { median: medFold, lowShare: foldTotals.filter((f) => f < 0.5 * medFold).length / foldTotals.length, farMedianM: q(farSorted, 0.5) },
    times: times.map((t, k) => {
      const coherentShare = coherent[k] / sampled.length;
      const noEvent = coherentShare < MIN_COHERENT_SHARE;
      const abs = noEvent ? [] : rmo[k].filter(fin).map(Math.abs).sort((a, b) => a - b);
      const i = Math.round(t / dtMs);
      return {
        t_ms: t, coherentShare, noEvent,
        rmoMedian: q(abs, 0.5), rmoQ90: q(abs, 0.9), rmoShareOver4: abs.length ? abs.filter((v) => v > 4).length / abs.length : NaN,
        stretchMuteM: vel ? stretchMuteOffset(t / 1000, vel.vrms[Math.min(ns - 1, i)], maxStretch) : null,
      };
    }),
    maps: { sampled, rmo: rmo.map((r) => r.map((v) => (fin(v) ? Number(v.toFixed(2)) : null))), fold: foldTotals },
  };
  result.issues = prestackQcIssues(result, ds.name);
  ctx.progress(1, 'Done');
  return result;
}

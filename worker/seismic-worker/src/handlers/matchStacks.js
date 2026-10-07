// match_stacks: partial stacks brought onto a reference stack (QI programme
// Q5, 2026-10-07; SOW section 7), by the engines' qi/conditioning.js. On
// about 300 traces sampled across the lattice each stack is matched to the
// reference (time shift and constant phase together, then amplitude); the
// medians of the shift and scale and the circular mean of the phase make one
// operator per stack, applied to every trace and published as a derived
// volume on that stack. One operator for the whole survey keeps the
// relative amplitudes AVO reads; a per-trace match would remove them.
//
// params: { reference_volume_id, stacks: [volume_id] (1 to 5), volume_ids: { [stack id]: output id }, sample_traces? (300) }
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { matchStacks, shiftTrace, rotatePhase } from '../../../../packages/engines/engines/qi/conditioning.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { sameLattice } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import { buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE } from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NULL_LIM = 1e29;
const UPLOADS_IN_FLIGHT = 4;
const fin = Number.isFinite;
export const MATCH_ATTRIBUTE = 'qi_matched_stack';

export function validateMatchParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.reference_volume_id))) return 'reference_volume_id is required.';
  if (!Array.isArray(p.stacks) || p.stacks.length < 1 || p.stacks.length > 5 || p.stacks.some((s) => !UUID.test(String(s)))) return 'Give one to five stacks to match.';
  if (p.stacks.includes(p.reference_volume_id)) return 'The reference is not matched to itself.';
  if (!p.stacks.every((s) => UUID.test(String(p.volume_ids?.[s])))) return 'Each stack needs its output volume.';
  return null;
}

const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

/** The survey operator from per-trace matches: median shift and scale, circular mean of the phase. */
export function surveyOperator(matches) {
  const good = matches.filter((m) => fin(m.shiftMs) && fin(m.scale) && m.corrAfter > 0.3);
  let sc = 0; let ss = 0;
  for (const m of good) { sc += Math.cos((m.phaseDeg * Math.PI) / 180); ss += Math.sin((m.phaseDeg * Math.PI) / 180); }
  return {
    shiftMs: median(good.map((m) => m.shiftMs)),
    phaseDeg: good.length ? (Math.atan2(ss, sc) * 180) / Math.PI : NaN,
    scale: median(good.map((m) => m.scale)),
    corrBefore: median(good.map((m) => m.corrBefore)),
    corrAfter: median(good.map((m) => m.corrAfter)),
    traces: good.length,
  };
}

export async function matchStacksJob(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateMatchParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,kind,parent_volume_id,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const ref = await rowOf(p.reference_volume_id);
  if (!ref || ref.user_id !== uid || ref.status !== 'ready') throw new JobFailure('not_found', 'The reference stack was not found in your account, or it is not complete.');
  const stacks = [];
  for (const id of p.stacks) {
    const row = await rowOf(id);
    if (!row || row.user_id !== uid || row.status !== 'ready') throw new JobFailure('not_found', 'A stack was not found in your account, or it is not complete.');
    const out = await rowOf(p.volume_ids[id]);
    if (!out || out.user_id !== uid || out.kind !== 'attribute' || out.parent_volume_id !== id || out.status !== 'ingesting') throw new JobFailure('validate_failed', 'An output volume is not a new volume registered on its stack.');
    stacks.push({ row, out });
  }
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read a manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const vols = [ref, ...stacks.map((s) => s.row)];
  const mans = [];
  for (const v of vols) { const m = await readManifest(`${v.storage_path}/manifest.json`); try { assertFloat32Parent(m); } catch (e) { throw new JobFailure('validate_failed', e.message); } mans.push(m); }
  if (!mans.every((m) => sameLattice(m, mans[0]))) throw new JobFailure('validate_failed', 'The stacks are not on one lattice.');
  const need = derivedStorageBytes(mans[0]) * stacks.length;
  const q = await seismicQuota(admin, uid);
  if (q.used + need > q.quota) throw new JobFailure('over_quota', overQuotaMessage('The matched stacks', need, q));
  const geom = geomFromManifest(mans[0]);
  const { nIl, nXl, ns, brickSize: b } = geom;
  const dtMs = mans[0].geometry.dt_us / 1000;
  const fetchers = vols.map((v, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(mans[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), mans[k]);
    return async (i, j, kk) => new Float32Array(await f(brickKey(v.storage_path, i, j, kk)));
  });
  const readTrace = async (k, il, xl) => {
    const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, kk) => fetchers[k](Math.floor(il / b), Math.floor(xl / b), kk)));
    const base = ((il % b) * b + (xl % b)) * b;
    return Float64Array.from({ length: ns }, (_, s) => { const v = bricks[Math.floor(s / b)][base + (s % b)]; return Math.abs(v) <= NULL_LIM ? v : NaN; });
  };
  // measure on sampled traces
  const target = p.sample_traces ?? 300;
  const stride = Math.max(1, Math.round(Math.sqrt((nIl * nXl) / target)));
  const matches = stacks.map(() => []);
  for (let il = Math.floor(stride / 2); il < nIl; il += stride) {
    for (let xl = Math.floor(stride / 2); xl < nXl; xl += stride) {
      if (ctx.cancelled) return null;
      const r = await readTrace(0, il, xl);
      if (!r.some(fin)) continue;
      for (let k = 0; k < stacks.length; k++) {
        const t = await readTrace(k + 1, il, xl);
        if (!t.some(fin)) continue;
        matches[k].push(matchStacks(r, t, dtMs));
      }
    }
  }
  const ops = matches.map(surveyOperator);
  ops.forEach((o, k) => { if (!(o.traces > 0)) throw new JobFailure('compute_failed', `${stacks[k].row.name} could not be matched: no sampled trace correlates with the reference.`); });
  ctx.progress(0.1, 'Applying the operators');
  // apply each stack's operator to all its traces
  const uploaded = [];
  const results = [];
  try {
    for (let k = 0; k < stacks.length; k++) {
      const { row, out } = stacks[k]; const op = ops[k];
      const dir = volumeDir(uid, out.id);
      const inflight = new Set(); let uploadError = null;
      const onBrick = async ({ i, j, k: kk, data }) => {
        if (uploadError) throw uploadError;
        const path = `${dir}/${brickRelPath(i, j, kk)}`;
        const task = deps.storage.upload(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { contentType: 'application/octet-stream', upsert: false })
          .then(() => { uploaded.push(path); }).catch((e) => { uploadError = uploadError || e; }).finally(() => inflight.delete(task));
        inflight.add(task);
        if (inflight.size >= UPLOADS_IN_FLIGHT) await Promise.race(inflight);
      };
      const compute = (trace, outT) => {
        const t = Float64Array.from(trace, (v) => (Math.abs(v) <= NULL_LIM ? v : 0));
        const m = rotatePhase(shiftTrace(t, op.shiftMs, dtMs).map((v) => (fin(v) ? v : 0)), op.phaseDeg);
        for (let s = 0; s < ns; s++) outT[s] = Math.abs(trace[s]) <= NULL_LIM && fin(m[s]) ? op.scale * m[s] : NULL_VALUE;
      };
      const result = await runVolumeJob({ geom, compute, fetchBrick: fetchers[k + 1], onBrick, shouldCancel: () => ctx.cancelled, onProgress: (done, total) => ctx.progress(0.1 + 0.85 * ((k + (total ? done / total : 0)) / stacks.length), `Matching ${row.name}`) });
      await Promise.all(inflight);
      if (uploadError) throw new JobFailure('upload_failed', `Uploading the matched bricks failed: ${uploadError.message}`);
      const params = { qi_class: 'elastic_estimate', reference_volume_id: ref.id, reference_name: ref.name, shift_ms: op.shiftMs, phase_deg: op.phaseDeg, scale: op.scale, corr_before: op.corrBefore, corr_after: op.corrAfter, sampled_traces: op.traces };
      const man = buildDerivedManifest({ volumeId: out.id, name: out.name, parentManifest: mans[k + 1], attribute: { name: MATCH_ATTRIBUTE, params }, job: result });
      await deps.storage.upload(manifestPath(uid, out.id), new TextEncoder().encode(JSON.stringify(man, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes').update({ status: 'ready', survey_meta: derivedSurveyMeta(man, row.id), updated_at: new Date().toISOString() }).eq('id', out.id).eq('user_id', uid);
      if (error) throw new Error(`Matched but registration failed: ${error.message}`);
      results.push({ stack_id: row.id, stack_name: row.name, volume_id: out.id, ...params });
    }
  } catch (e) {
    try { for (let i = 0; i < uploaded.length; i += 500) await admin.storage.from('seismic').remove(uploaded.slice(i, i + 500)); for (const s of stacks) await admin.from('seismic_volumes').delete().eq('id', s.out.id).eq('user_id', uid); } catch { /* best effort */ }
    if (ctx.cancelled) return null;
    throw e;
  }
  ctx.progress(1, 'Done');
  return { reference_volume_id: ref.id, stacks: results };
}

// sample_volumes: values of a few volumes at given traces and times (QI
// programme Q7b, 2026-10-07): the observed side of a calibration at the
// wells (AVO intercept and gradient at a zone top, impedance at a log). For
// each point the first volume is searched within +/- window_ms for its
// largest absolute value (the event), and every volume is read at that same
// sample, so the values belong to one reflection. Read only.
//
// params: { volume_ids: [] (1 to 8, one lattice), points: [{name, il, xl, t_ms}] (1 to 200), window_ms? (8),
//   traces? (true: the whole trace of every volume at each point instead, up to 20 points; t_ms not needed) }
// il and xl are 0-based grid indices.
import { JobFailure } from '../runJob.js';
import { assertFloat32Parent } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { sameLattice } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NULL_LIM = 1e29;

export function validateSampleParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  const v = p.volume_ids;
  if (!Array.isArray(v) || v.length < 1 || v.length > 8 || v.some((x) => !UUID.test(String(x)))) return 'Give one to eight volumes.';
  const pts = p.points;
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > (p.traces ? 20 : 200)) return p.traces ? 'Give one to 20 points for whole traces.' : 'Give one to 200 points.';
  for (const q of pts) if (!Number.isInteger(q?.il) || !Number.isInteger(q?.xl) || (!p.traces && !(q.t_ms >= 0))) return p.traces ? 'Each point needs an inline and crossline index.' : 'Each point needs an inline and crossline index and a time.';
  if (p.window_ms != null && !(p.window_ms >= 0 && p.window_ms <= 100)) return 'The window must be 0 to 100 ms.';
  return null;
}

export async function sampleVolumes(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateSampleParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const win = p.window_ms ?? 8;
  const vols = [];
  for (const id of p.volume_ids) {
    const { data: row, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    if (!row || row.user_id !== uid) throw new JobFailure('not_found', 'A volume was not found in your account.');
    if (row.status !== 'ready') throw new JobFailure('validate_failed', `${row.name} is ${row.status}.`);
    vols.push(row);
  }
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read a manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const mans = [];
  for (const v of vols) {
    const m = await readManifest(`${v.storage_path}/manifest.json`);
    try { assertFloat32Parent(m); } catch (e) { throw new JobFailure('validate_failed', e.message); }
    mans.push(m);
  }
  if (!mans.every((m) => sameLattice(m, mans[0]))) throw new JobFailure('validate_failed', 'The volumes are not on one lattice.');
  const geom = geomFromManifest(mans[0]);
  const { nIl, nXl, ns, brickSize: b } = geom;
  const dtMs = mans[0].geometry.dt_us / 1000;
  const readers = vols.map((v, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(mans[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), mans[k]);
    return async (il, xl) => {
      const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, kk) => f(brickKey(v.storage_path, Math.floor(il / b), Math.floor(xl / b), kk)).then((buf) => new Float32Array(buf))));
      const base = ((il % b) * b + (xl % b)) * b;
      return Float32Array.from({ length: ns }, (_, s) => bricks[Math.floor(s / b)][base + (s % b)]);
    };
  });
  const out = [];
  for (const q of p.points) {
    if (ctx.cancelled) return null;
    if (q.il < 0 || q.il >= nIl || q.xl < 0 || q.xl >= nXl) { out.push({ name: q.name || null, error: 'outside the survey' }); continue; }
    const traces = await Promise.all(readers.map((r) => r(q.il, q.xl)));
    if (p.traces) {
      out.push({ name: q.name || null, traces: traces.map((t) => Array.from(t, (v) => (Math.abs(v) <= NULL_LIM ? Number(v.toPrecision(7)) : null))) });
      continue;
    }
    const s0 = Math.round(q.t_ms / dtMs);
    const h = Math.round(win / dtMs);
    let best = -1; let bv = -1;
    for (let s = Math.max(0, s0 - h); s <= Math.min(ns - 1, s0 + h); s++) {
      const v = traces[0][s];
      if (Math.abs(v) <= NULL_LIM && Math.abs(v) > bv) { bv = Math.abs(v); best = s; }
    }
    if (best < 0) { out.push({ name: q.name || null, error: 'no live sample in the window' }); continue; }
    out.push({ name: q.name || null, t_ms: best * dtMs, values: traces.map((t) => (Math.abs(t[best]) <= NULL_LIM ? t[best] : null)) });
  }
  return { volume_ids: vols.map((v) => v.id), window_ms: win, dt_ms: dtMs, ns, points: out };
}

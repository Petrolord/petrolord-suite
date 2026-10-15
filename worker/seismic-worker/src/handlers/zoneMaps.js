// zone_maps: map products from volumes (QI upgrade P1.5, 2026-10-15). For
// every trace, statistics of one to eight volumes on one lattice between two
// horizons, or a horizon and a window below it (engines qi/zoneMaps.js): the
// zone mean, RMS, minimum, maximum and the share beyond a cutoff (on a facies
// probability volume, the expected share of the zone in that facies and the
// share where it is the more likely), the zone mean of an uncertainty spread
// (Q90 - Q10, and relative to Q50: confidence maps), and the zone thickness.
// Each product is written as a float32 lattice grid under the user's folder
// in the seismic bucket (qi-zone-maps/{job}/{key}.f32); the browser grids it
// onto the survey's world grid and saves it as an attribute surface in the
// shared surface registry (Seismolord and Mapping & Surface Studio show and
// export it), then removes the lattice file.
//
// params: { volume_ids: [] (1 to 8, one lattice), top_horizon_id,
//   base_horizon_id? | window_ms?, products: [{ key, kind: 'stat', input: i,
//   stat: mean|rms|min|max|frac, cutoff?, above? } | { key, kind: 'spread',
//   q10: i, q50: i, q90: i, relative? } | { key, kind: 'thickness' } | { key,
//   kind: 'avo_class', a: i, b: i, scale? }] (1 to
//   16), name? } where i indexes volume_ids.
// Horizons are the user's own picks on any of their volumes on the same
// lattice (picks are sample indices on that lattice). Read only, apart from
// the map files, which count against the user's seismic quota.
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { assertFloat32Parent } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { sameLattice } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { zoneRange, zoneProducts, ZONE_STATS } from '../../../../packages/engines/engines/qi/zoneMaps.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9_:-]{1,40}$/i;
const NULL_F32 = Math.fround(1e30);
export const ZONE_MAP_DIR = 'qi-zone-maps';
const STAT_KEYS = new Set(ZONE_STATS.map((s) => s.key));

/** Why the job cannot run, or null. */
export function validateZoneMapParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  const v = p.volume_ids;
  if (!Array.isArray(v) || v.length < 1 || v.length > 8 || v.some((x) => !UUID.test(String(x)))) return 'Give one to eight volumes.';
  if (!UUID.test(String(p.top_horizon_id))) return 'Choose the top horizon.';
  if (p.base_horizon_id != null) {
    if (!UUID.test(String(p.base_horizon_id))) return 'The base horizon must be a horizon id.';
    if (p.base_horizon_id === p.top_horizon_id) return 'Choose a base horizon other than the top.';
  } else if (!(p.window_ms > 0 && p.window_ms <= 2000)) return 'Give a base horizon, or a window below the top of 1 to 2000 ms.';
  const pr = p.products;
  if (!Array.isArray(pr) || pr.length < 1 || pr.length > 16) return 'Ask for one to 16 map products.';
  const keys = new Set();
  const idx = (i) => Number.isInteger(i) && i >= 0 && i < v.length;
  for (const x of pr) {
    if (!x || !KEY.test(String(x.key))) return 'Each product needs a short key (letters, digits, _ : -).';
    if (keys.has(x.key)) return `Two products share the key ${x.key}.`;
    keys.add(x.key);
    if (x.kind === 'stat') {
      if (!idx(x.input)) return `Product ${x.key}: choose one of the volumes.`;
      if (!STAT_KEYS.has(x.stat)) return `Product ${x.key}: unknown statistic ${x.stat}.`;
      if (x.stat === 'frac' && !Number.isFinite(x.cutoff)) return `Product ${x.key}: the share beyond a cutoff needs the cutoff.`;
    } else if (x.kind === 'spread') {
      if (![x.q10, x.q50, x.q90].every(idx)) return `Product ${x.key}: the spread needs the Q10, Q50 and Q90 volumes.`;
    } else if (x.kind === 'avo_class') {
      // QI upgrade P2.10: the class of the zone means of A and B (divided by the scale to reflectivity)
      if (!idx(x.a) || !idx(x.b) || x.a === x.b) return `Product ${x.key}: the class map needs the intercept and gradient volumes.`;
      if (x.scale != null && !(Number.isFinite(x.scale) && x.scale !== 0)) return `Product ${x.key}: the scale must be a number other than zero.`;
    } else if (x.kind !== 'thickness') return `Product ${x.key}: unknown kind ${x.kind}.`;
  }
  return null;
}

export async function zoneMaps(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateZoneMapParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const jobId = ctx.job.id || 'job';
  const { admin } = deps;
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read a manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,storage_path,parent_volume_id').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const vols = []; const mans = [];
  for (const id of p.volume_ids) {
    const row = await rowOf(id);
    if (!row || row.user_id !== uid) throw new JobFailure('not_found', 'A volume was not found in your account. Zone maps run on your own volumes.');
    if (row.status !== 'ready') throw new JobFailure('validate_failed', `${row.name} is ${row.status}; it must be complete.`);
    const m = await readManifest(`${row.storage_path}/manifest.json`);
    try { assertFloat32Parent(m); } catch (e) { throw new JobFailure('validate_failed', e.message); }
    vols.push(row); mans.push(m);
  }
  if (!mans.every((m) => sameLattice(m, mans[0]))) throw new JobFailure('validate_failed', 'The volumes are not on one lattice.');
  const geom = geomFromManifest(mans[0]);
  const { nIl, nXl, ns, brickSize: b } = geom;
  const dtMs = mans[0].geometry.dt_us / 1000;

  // horizons: the user's own, picked on a volume of this lattice
  const readHorizon = async (id) => {
    const { data: h, error } = await admin.from('seismic_horizons').select('id,user_id,volume_id,name,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read horizon ${id}: ${error.message}`);
    if (!h || h.user_id !== uid) throw new JobFailure('not_found', 'A chosen horizon was not found in your account.');
    if (!p.volume_ids.includes(h.volume_id) && !vols.some((v) => v.parent_volume_id === h.volume_id)) {
      const hv = await rowOf(h.volume_id);
      if (!hv || hv.user_id !== uid) throw new JobFailure('not_found', `The volume horizon ${h.name} was picked on is not in your account.`);
      if (!sameLattice(await readManifest(`${hv.storage_path}/manifest.json`), mans[0])) throw new JobFailure('validate_failed', `Horizon ${h.name} was picked on a volume with another lattice.`);
    }
    const buf = deps.readBlob ? await deps.readBlob(h.storage_path) : await (async () => {
      const { data, error: e } = await admin.storage.from('seismic').download(h.storage_path);
      if (e) throw new Error(`Could not read horizon ${h.name}: ${e.message}`);
      return data.arrayBuffer();
    })();
    const g = new Float32Array(buf);
    if (g.length !== nIl * nXl) throw new JobFailure('validate_failed', `Horizon ${h.name} is not on this lattice.`);
    return { row: h, grid: g };
  };
  const top = await readHorizon(p.top_horizon_id);
  const base = p.base_horizon_id ? await readHorizon(p.base_horizon_id) : null;
  const windowSamples = base ? null : p.window_ms / dtMs;

  const need = p.products.length * nIl * nXl * 4;
  const q = await seismicQuota(admin, uid);
  if (q.used + need > q.quota) throw new JobFailure('over_quota', overQuotaMessage('The zone maps', need, q));

  const fetchers = vols.map((v, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(mans[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), mans[k]);
    return async (i, j, kk) => new Float32Array(await f(brickKey(v.storage_path, i, j, kk)));
  });
  const maps = p.products.map(() => new Float32Array(nIl * nXl).fill(NULL_F32));
  const pick = (g, c) => { const v = g[c]; return Math.abs(v) <= 1e29 && Number.isFinite(v) ? v : null; };
  // a pilot volume holds only its bricks: visit only those columns
  const pb = mans[0].pilot?.bricks || null;
  const [gi, gj] = geom.grid;
  const i0 = pb ? pb.i0 : 0; const i1 = pb ? pb.i1 : gi - 1;
  const j0 = pb ? pb.j0 : 0; const j1 = pb ? pb.j1 : gj - 1;
  const total = (i1 - i0 + 1) * (j1 - j0 + 1);
  let done = 0; let live = 0;
  const traces = {};
  const tr = Array.from({ length: vols.length }, () => new Float32Array(ns));
  for (let bi = i0; bi <= i1; bi++) {
    for (let bj = j0; bj <= j1; bj++) {
      if (ctx.cancelled) return null;
      // the k range the column's zones need
      let k0 = Infinity; let k1 = -Infinity;
      const ranges = new Map();
      for (let li = 0; li < b; li++) for (let lj = 0; lj < b; lj++) {
        const il = bi * b + li; const xl = bj * b + lj;
        if (il >= nIl || xl >= nXl) continue;
        const c = il * nXl + xl;
        const t = pick(top.grid, c);
        const bs = base ? pick(base.grid, c) : null;
        const r = t == null || (base && bs == null) ? null : zoneRange(t, base ? bs : null, ns, { windowSamples });
        if (!r) continue;
        ranges.set(c, { r, t, bs });
        k0 = Math.min(k0, Math.floor(r[0] / b)); k1 = Math.max(k1, Math.floor(r[1] / b));
      }
      done += 1;
      if (!ranges.size) continue;
      const bricks = await Promise.all(fetchers.map((f) => Promise.all(Array.from({ length: k1 - k0 + 1 }, (_, n) => f(bi, bj, k0 + n)))));
      for (const [c, { r, t, bs }] of ranges) {
        const il = Math.floor(c / nXl); const xl = c % nXl;
        const off = ((il % b) * b + (xl % b)) * b;
        for (let m = 0; m < vols.length; m++) {
          const out = tr[m];
          for (let s = r[0]; s <= r[1]; s++) out[s] = bricks[m][Math.floor(s / b) - k0][off + (s % b)];
          traces[m] = out;
        }
        // a lattice hole (no trace in any volume over the zone) gets no map value,
        // so the thickness is not mapped where there is no seismic (F3 benchmark F-7)
        let seen = false;
        for (let m = 0; m < vols.length && !seen; m++) for (let s = r[0]; s <= r[1]; s++) { const v = tr[m][s]; if (Number.isFinite(v) && Math.abs(v) < 1e29) { seen = true; break; } }
        if (!seen) continue;
        const vals = zoneProducts({ traces, products: p.products, range: r, top: t, base: base ? bs : null, dtMs });
        let any = false;
        vals.forEach((v, o) => { if (Number.isFinite(v)) { maps[o][c] = v; any = true; } });
        if (any) live += 1;
      }
      if (done % 16 === 0) ctx.progress(0.02 + 0.9 * (done / total), 'Zone maps');
    }
  }
  if (ctx.cancelled) return null;
  const products = [];
  for (let o = 0; o < p.products.length; o++) {
    const m = maps[o];
    let n = 0; let mn = Infinity; let mx = -Infinity; let sum = 0;
    for (const v of m) if (v !== NULL_F32) { n += 1; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; }
    const path = `${uid}/${ZONE_MAP_DIR}/${jobId}/${p.products[o].key.replace(/:/g, '_')}.f32`;
    await deps.storage.upload(path, new Uint8Array(m.buffer), { contentType: 'application/octet-stream', upsert: true });
    products.push({ ...p.products[o], path, live: n, min: n ? mn : null, max: n ? mx : null, mean: n ? sum / n : null });
  }
  ctx.progress(1, 'Done');
  return {
    volume_ids: vols.map((v) => v.id), volume_names: vols.map((v) => v.name),
    top_horizon: { id: top.row.id, name: top.row.name },
    ...(base ? { base_horizon: { id: base.row.id, name: base.row.name } } : { window_ms: p.window_ms }),
    lattice: { n_il: nIl, n_xl: nXl, dt_ms: dtMs }, traces_with_zone: live, products,
  };
}

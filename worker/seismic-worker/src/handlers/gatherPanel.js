// gather_panel: prestack gathers read from the worker's gather store for the
// QI Studio gather viewer (QI upgrade P1.7, 2026-10-15; closes QI-UPGRADE
// U2-004). Read only. The browser cannot read the work bucket, so the worker
// reads the requested CDP gathers (one CDP, a stretch of an inline or a
// crossline, or the CDPs at given world positions such as the study wells)
// from one store, or from a store and the store trimmed from it side by side,
// and writes them as one float32 panel to the work bucket with a short-lived
// download link. The janitor removes panels after PANEL_RETENTION_HOURS.
//
// params: { dataset_id, compare_dataset_id?, mode: 'cdp'|'inline'|'crossline'|'points',
//   il?, xl? (lattice indices; default the centre CDP), from?, to?, step? (indices
//   along the line), points? [{x, y, label}], t_ms? [from, to] }
//
// Panel layout: float32 little-endian, store by store (the compared store
// second), gather by gather in result order, bin by bin, the samples of the
// time window; nulls are NaN. The result carries the geometry, the bins, each
// gather's lattice and line numbers and its fold per bin.
import { JobFailure } from '../runJob.js';
import { readGather, gatherBlockKey, foldBlockKey } from '../../../../packages/engines/engines/qi/gatherStore.js';
import { surveyAffine, worldToIlxl } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_GATHERS = 24;
export const MAX_POINTS = 12;
export const MAX_FLOATS = 6_000_000; // about 24 MB of panel
export const PANEL_LINK_TTL_S = 2 * 3600;
export const PANEL_RETENTION_HOURS = 6;
const fin = Number.isFinite;
const isInt = (v) => Number.isInteger(v);

export function validateGatherPanelParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  if (p.compare_dataset_id != null && !UUID.test(String(p.compare_dataset_id))) return 'compare_dataset_id must be a uuid.';
  if (p.compare_dataset_id != null && p.compare_dataset_id === p.dataset_id) return 'Compare a store with another store.';
  if (!['cdp', 'inline', 'crossline', 'points'].includes(p.mode)) return 'The mode must be cdp, inline, crossline or points.';
  for (const k of ['il', 'xl', 'from', 'to']) if (p[k] != null && !(isInt(p[k]) && p[k] >= 0)) return `${k} must be a lattice index, zero or more.`;
  if (p.step != null && !(isInt(p.step) && p.step >= 1)) return 'The step must be a whole number of 1 or more.';
  if (p.mode === 'points') {
    if (!Array.isArray(p.points) || !p.points.length) return 'Give at least one position.';
    if (p.points.length > MAX_POINTS) return `At most ${MAX_POINTS} positions.`;
    if (p.points.some((q) => !fin(q?.x) || !fin(q?.y))) return 'Each position needs x and y.';
  }
  if (p.t_ms != null && !(Array.isArray(p.t_ms) && p.t_ms.length === 2 && fin(p.t_ms[0]) && fin(p.t_ms[1]) && p.t_ms[1] > p.t_ms[0] && p.t_ms[0] >= 0)) return 'The time window must be a start and a later end, in ms.';
  return null;
}

/**
 * The CDPs a request asks for, as lattice indices, with the reasons any
 * position was left out. Pure.
 * @returns {{cdps: Array<{i, j, label?}>, skipped: Array<{label, reason}>}}
 */
export function panelCdps(p, geometry) {
  const nIl = geometry.il.count; const nXl = geometry.xl.count;
  const inside = (i, j) => i >= 0 && i < nIl && j >= 0 && j < nXl;
  const ci = p.il ?? Math.floor(nIl / 2); const cj = p.xl ?? Math.floor(nXl / 2);
  const skipped = [];
  if (p.mode === 'cdp') {
    if (!inside(ci, cj)) throw new JobFailure('validate_failed', 'The CDP is outside the gather store.');
    return { cdps: [{ i: ci, j: cj }], skipped };
  }
  if (p.mode === 'inline' || p.mode === 'crossline') {
    const along = p.mode === 'inline' ? nXl : nIl;
    if (p.mode === 'inline' ? !(ci < nIl) : !(cj < nXl)) throw new JobFailure('validate_failed', `The ${p.mode} is outside the gather store.`);
    const from = Math.min(p.from ?? 0, along - 1); const to = Math.min(p.to ?? along - 1, along - 1);
    if (to < from) throw new JobFailure('validate_failed', 'The range must run from a lower index to a higher one.');
    const step = p.step ?? Math.max(1, Math.ceil((to - from + 1) / MAX_GATHERS));
    const n = Math.floor((to - from) / step) + 1;
    if (n > MAX_GATHERS) throw new JobFailure('validate_failed', `That asks for ${n} gathers; at most ${MAX_GATHERS} per panel. Use a larger step or a shorter range.`);
    const cdps = [];
    for (let k = from; k <= to; k += step) cdps.push(p.mode === 'inline' ? { i: ci, j: k } : { i: k, j: cj });
    return { cdps, skipped };
  }
  const aff = surveyAffine(geometry);
  if (!aff) throw new JobFailure('validate_failed', 'The gather store has no survey coordinates, so positions cannot be placed on it.');
  const cdps = [];
  for (const q of p.points) {
    const ij = worldToIlxl(aff, q.x, q.y);
    const i = ij ? Math.round(ij.i) : NaN; const j = ij ? Math.round(ij.j) : NaN;
    const label = typeof q.label === 'string' ? q.label.slice(0, 80) : '';
    if (!inside(i, j)) skipped.push({ label, reason: 'outside the gather store' });
    else cdps.push({ i, j, label });
  }
  if (!cdps.length) throw new JobFailure('validate_failed', 'None of the positions is inside the gather store.');
  return { cdps, skipped };
}

const sameGeometry = (a, b) => ['il', 'xl'].every((k) => a[k].min === b[k].min && a[k].step === b[k].step && a[k].count === b[k].count)
  && a.ns === b.ns && a.dt_us === b.dt_us;

export async function gatherPanel(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateGatherPanelParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, workBucket = 'seismic-work' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;

  const openStore = async (id) => {
    const { data: ds, error } = await admin.from('qi_datasets').select('*').eq('id', id).maybeSingle();
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
    return { ds, prefix, getObject, m, present: new Set((m.blocks_present || []).map(([a, b]) => `${a}-${b}`)) };
  };
  const stores = [await openStore(p.dataset_id)];
  if (p.compare_dataset_id) {
    stores.push(await openStore(p.compare_dataset_id));
    if (!sameGeometry(stores[0].m.geometry, stores[1].m.geometry) || stores[0].m.bins.centres.length !== stores[1].m.bins.centres.length) {
      throw new JobFailure('validate_failed', 'The two gather stores are not on one lattice with the same bins.');
    }
  }
  const g = stores[0].m.geometry;
  const ns = g.ns; const dtMs = g.dt_us / 1000; const cb = stores[0].m.blocks.size;
  const centres = stores[0].m.bins.centres; const nBins = centres.length;
  const { cdps, skipped } = panelCdps(p, g);
  const traceEnd = (ns - 1) * dtMs;
  const s0 = p.t_ms ? Math.max(0, Math.floor(p.t_ms[0] / dtMs)) : 0;
  const s1 = p.t_ms ? Math.min(ns - 1, Math.ceil(p.t_ms[1] / dtMs)) : ns - 1;
  if (p.t_ms && p.t_ms[0] > traceEnd) throw new JobFailure('validate_failed', `The window starts after the last sample (${traceEnd} ms).`);
  const nw = s1 - s0 + 1;
  const floats = stores.length * cdps.length * nBins * nw;
  if (floats > MAX_FLOATS) throw new JobFailure('validate_failed', `The panel would hold ${floats} samples; the limit is ${MAX_FLOATS}. Shorten the time window or ask for fewer gathers.`);

  const panel = new Float32Array(floats).fill(NaN);
  const gathers = cdps.map((c) => ({ i: c.i, j: c.j, il: g.il.min + c.i * g.il.step, xl: g.xl.min + c.j * g.xl.step, ...(c.label ? { label: c.label } : {}), fold: [] }));
  let at = 0;
  for (let st = 0; st < stores.length; st++) {
    const S = stores[st];
    const cache = new Map();
    const block = async (bi, bj) => {
      const k = `${bi}-${bj}`;
      if (!S.present.has(k)) return null;
      if (!cache.has(k)) {
        if (cache.size > 16) cache.clear();
        cache.set(k, { data: new Float32Array(await S.getObject(`${S.prefix}/${gatherBlockKey(bi, bj)}`)), fold: new Uint16Array(await S.getObject(`${S.prefix}/${foldBlockKey(bi, bj)}`)) });
      }
      return cache.get(k);
    };
    for (let q = 0; q < cdps.length; q++) {
      if (ctx.cancelled) return null;
      const { i, j } = cdps[q];
      const blk = await block(Math.floor(i / cb), Math.floor(j / cb));
      const fold = new Array(nBins).fill(0);
      if (blk) {
        const gather = readGather(blk.data, blk.fold, { cb, nBins, ns }, i % cb, j % cb);
        for (let b = 0; b < nBins; b++) {
          fold[b] = gather.fold[b];
          if (!gather.fold[b]) continue;
          const tr = gather.traces[b]; const base = at + b * nw;
          for (let s = 0; s < nw; s++) { const v = tr[s0 + s]; if (fin(v) && Math.abs(v) < 1e29) panel[base + s] = v; }
        }
      }
      if (st === 0) gathers[q].fold = fold; else gathers[q].compareFold = fold;
      at += nBins * nw;
      ctx.progress(0.9 * ((st * cdps.length + q + 1) / (stores.length * cdps.length)), 'Reading the gathers');
    }
  }

  const key = `panels/${uid}/${ctx.job.id}/panel.f32`;
  const bytes = new Uint8Array(panel.buffer);
  const r = await fetchImpl(await sign('PUT', workBucket, key), { method: 'PUT', body: bytes, headers: { 'content-type': 'application/octet-stream' } });
  if (!r.ok) throw new Error(`Could not store the panel (${r.status}).`);
  const url = await (deps.linkSign || sign)('GET', workBucket, key, {}, PANEL_LINK_TTL_S);
  ctx.progress(1, 'Done');
  return {
    dataset_id: stores[0].ds.id, name: stores[0].ds.name,
    ...(stores[1] ? { compare_dataset_id: stores[1].ds.id, compare_name: stores[1].ds.name } : {}),
    mode: p.mode,
    geometry: { il: g.il, xl: g.xl, ns: g.ns, dt_us: g.dt_us, ...(g.affine ? { affine: g.affine } : {}) },
    bins: { kind: stores[0].m.bins.kind, width: stores[0].m.bins.width, centres },
    nmo_corrected: stores[0].m.source?.nmo_corrected !== false,
    window: { s0, ns: nw, t0_ms: s0 * dtMs, dt_ms: dtMs },
    stores: stores.length, gathers, skipped,
    bucket: workBucket, key, bytes: bytes.byteLength, url,
    expires_at: new Date(Date.now() + PANEL_LINK_TTL_S * 1000).toISOString(),
  };
}

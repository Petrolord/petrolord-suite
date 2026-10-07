// prestack_inversion: simultaneous AI, SI and density from angle stacks (QI
// programme Q8b, 2026-10-07; SOW section 9), by the run module QI Studio's
// tests gate (src/pages/apps/QIStudio/services/prestackRun.js) over the
// engines' qi/prestackInversion.js. Two modes:
//  - blind: the well traces only, each well out of the three low-frequency
//    models in turn; returns the blind-well table. Read only.
//  - volume: the same check, then every CDP, published as four derived
//    volumes on the first stack (AI, SI, density, Vp/Vs), elastic estimates.
// The stacks are Seismolord volumes on one lattice, each with its mean angle;
// the wavelet is scaled to them at the wells through the Fatti model.
//
// params: { mode, inversion: { stacks: [{volume_id, angle}], wavelet: {samples, dt_ms},
//   wells: [{name, il, xl, ln_ai, ln_si, ln_rho}], horizon_ids?, lfmHz?, eps?, iters?, vs_vp? },
//   volume_ids?: {ai, si, rho, vpvs} (volume mode) }
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import {
  validatePrestackParams, meanVsVp, prestackLfm, prestackWaveletScale, makeCdpInverter, prestackBlindTable, prestackProducts, PRESTACK_DEFAULTS, PRESTACK_PRODUCTS,
} from '../../../../src/pages/apps/QIStudio/services/prestackRun.js';
import { horizonsAtFrom } from '../../../../src/pages/apps/QIStudio/services/inversionRun.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { sameLattice, surveyAffine, ilxlToWorld } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import { resampleWavelet } from '../../../../packages/engines/engines/qi/wavelets.js';
import { buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE } from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['ai', 'si', 'rho', 'vpvs'];
const UPLOADS_IN_FLIGHT = 4;
const NULL_LIM = 1e29;
export const PRESTACK_ATTRIBUTE = 'qi_prestack_inversion';

export function validatePrestackJob(p) {
  const why = validatePrestackParams(p);
  if (why) return why;
  if (p.inversion.stacks.some((s) => !UUID.test(String(s.volume_id)))) return 'Each stack needs its volume.';
  if (new Set(p.inversion.stacks.map((s) => s.volume_id)).size !== p.inversion.stacks.length) return 'Each stack must be a different volume.';
  if ((p.inversion.horizon_ids || []).some((h) => !UUID.test(String(h)))) return 'Each horizon id must be a uuid.';
  if (p.mode === 'volume' && !KEYS.every((k) => UUID.test(String(p.volume_ids?.[k])))) return 'volume_ids needs ai, si, rho and vpvs for a volume run.';
  return null;
}

export async function prestackInversion(ctx, deps) {
  const p = ctx.params || {};
  const problem = validatePrestackJob(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const num = (a) => a.map((v) => (Number.isFinite(v) ? v : NaN));
  const inv = { ...PRESTACK_DEFAULTS, ...p.inversion, wells: p.inversion.wells.map((w) => ({ ...w, ln_ai: num(w.ln_ai), ln_si: num(w.ln_si), ln_rho: num(w.ln_rho) })) };

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,kind,parent_volume_id,storage_path,crs').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const stacks = [];
  for (const s of inv.stacks) {
    const row = await rowOf(s.volume_id);
    if (!row || row.user_id !== uid) throw new JobFailure('not_found', 'A stack was not found in your account.');
    if (row.status !== 'ready') throw new JobFailure('validate_failed', `${row.name} is ${row.status}; the stacks must be complete.`);
    stacks.push({ ...s, row });
  }
  const parent = stacks[0].row;
  const derived = [];
  if (p.mode === 'volume') {
    for (const k of KEYS) {
      const row = await rowOf(p.volume_ids[k]);
      if (!row || row.user_id !== uid || row.kind !== 'attribute' || row.parent_volume_id !== parent.id || row.status !== 'ingesting') throw new JobFailure('validate_failed', 'An output volume is not a new volume registered on the first stack.');
      derived.push(row);
    }
  }
  const uploaded = [];
  const cleanup = async () => {
    try {
      for (let i = 0; i < uploaded.length; i += 500) await admin.storage.from('seismic').remove(uploaded.slice(i, i + 500));
      for (const d of derived) await admin.from('seismic_volumes').delete().eq('id', d.id).eq('user_id', uid);
    } catch (e) { ctx.log?.warn?.(`cleanup failed: ${e.message}`); }
  };
  const fail = async (stage, message) => { await cleanup(); throw new JobFailure(stage, message); };
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read a manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const manifests = [];
  for (const s of stacks) {
    const m = await readManifest(`${s.row.storage_path}/manifest.json`);
    try { assertFloat32Parent(m); } catch (e) { return fail('validate_failed', e.message); }
    manifests.push(m);
  }
  if (!manifests.every((m) => sameLattice(m, manifests[0]))) return fail('validate_failed', 'The stacks are not on one lattice.');
  const geom = geomFromManifest(manifests[0]);
  const { nIl, nXl, ns, brickSize: b } = geom;
  const dtMs = manifests[0].geometry.dt_us / 1000;
  for (const w of inv.wells) {
    if (w.il < 0 || w.il >= nIl || w.xl < 0 || w.xl >= nXl) return fail('validate_failed', `Well ${w.name} is outside the survey.`);
    if (w.ln_ai.length !== ns) return fail('validate_failed', `Well ${w.name}: the logs have ${w.ln_ai.length} samples; the stacks have ${ns}.`);
  }
  if (p.mode === 'volume') {
    const need = derivedStorageBytes(manifests[0]) * derived.length;
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) return fail('over_quota', overQuotaMessage('The prestack inversion volumes', need, q));
  }
  // horizons: the user's own picks on the first stack
  const grids = [];
  for (const id of inv.horizon_ids || []) {
    const { data: h, error } = await admin.from('seismic_horizons').select('id,user_id,volume_id,name,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read horizon ${id}: ${error.message}`);
    if (!h || h.user_id !== uid || h.volume_id !== parent.id) return fail('not_found', 'A chosen horizon was not found on the first stack in your account.');
    const buf = deps.readBlob ? await deps.readBlob(h.storage_path) : await (async () => {
      const { data, error: e } = await admin.storage.from('seismic').download(h.storage_path);
      if (e) throw new Error(`Could not read horizon ${h.name}: ${e.message}`);
      return data.arrayBuffer();
    })();
    const g = new Float32Array(buf);
    if (g.length !== nIl * nXl) return fail('validate_failed', `Horizon ${h.name} is not on the stacks' grid.`);
    grids.push(g);
  }
  const fetchers = stacks.map((s, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(manifests[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), manifests[k]);
    return async (i, j, kk) => new Float32Array(await f(brickKey(s.row.storage_path, i, j, kk)));
  });
  const readTraces = async (il, xl) => Promise.all(fetchers.map(async (f) => {
    const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, kk) => f(Math.floor(il / b), Math.floor(xl / b), kk)));
    const base = ((il % b) * b + (xl % b)) * b;
    return Float32Array.from({ length: ns }, (_, s) => bricks[Math.floor(s / b)][base + (s % b)]);
  }));
  const aff = surveyAffine(manifests[0].geometry);
  const posOf = aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl });
  const horizonsAt = horizonsAtFrom(grids, nXl, dtMs);
  const thetaDeg = stacks.map((s) => s.angle);
  const onGrid = (w) => {
    const x = Float64Array.from(w.samples);
    return Number(w.dt_ms) > 0 && Math.abs(w.dt_ms - dtMs) > 1e-9 ? resampleWavelet(x, w.dt_ms, dtMs) : x;
  };
  // one wavelet for every stack, or one per stack (angle-dependent, Q6b)
  const wavelet = inv.wavelets ? inv.wavelets.map(onGrid) : onGrid(inv.wavelet);
  const scaled = (k) => (Array.isArray(wavelet) ? wavelet.map((w) => w.map((v) => v * k)) : wavelet.map((v) => v * k));
  const vsVp = inv.vs_vp ?? meanVsVp(inv.wells);

  ctx.progress(0.01, 'Reading the well traces');
  const tracesByWell = [];
  for (const w of inv.wells) tracesByWell.push(await readTraces(w.il, w.xl));
  let scale;
  try { scale = prestackWaveletScale(inv.wells.map((w, k) => ({ well: w, traces: tracesByWell[k] })), thetaDeg, wavelet, vsVp).scale; } catch (e) { return fail('compute_failed', e.message); }
  const lfm = prestackLfm(inv.wells, { dtMs, lfmHz: inv.lfmHz, posOf, horizonsAt });
  const invert = makeCdpInverter({ inv, thetaDeg, wavelet: scaled(scale), lfm, posOf, horizonsAt, ns, dtMs, vsVp });
  ctx.progress(0.03, 'Blind wells');
  const blind = inv.wells.length >= 2 ? prestackBlindTable({ invert, wells: inv.wells, tracesByWell, dtMs, truthHz: inv.truthHz }) : [];
  const settings = { qi_class: 'elastic_estimate', method: 'Fatti three-term simultaneous inversion', wavelets: inv.wavelets ? 'one per stack, from the wells' : 'one for every stack', stacks: stacks.map((s) => ({ volume_id: s.row.id, name: s.row.name, angle: s.angle })), wells: inv.wells.map((w) => w.name), horizon_ids: inv.horizon_ids || [], lfm_hz: inv.lfmHz, eps: inv.eps, vs_vp: vsVp, wavelet_scale: scale };
  if (ctx.cancelled) { await cleanup(); return null; }
  if (p.mode === 'blind') { ctx.progress(1, 'Done'); return { mode: 'blind', settings, blind }; }

  // every CDP: the other stacks' bricks for the column beside the first
  let column = null; let others = null;
  const fetchBrick = async (i, j, kk) => {
    const key = `${i}-${j}`;
    if (column !== key) { column = key; others = new Map(); }
    others.set(kk, await Promise.all(fetchers.slice(1).map((f) => f(i, j, kk))));
    return fetchers[0](i, j, kk);
  };
  const compute = (trace, outs, il, xl) => {
    const base = ((il % b) * b + (xl % b)) * b;
    const traces = [trace, ...stacks.slice(1).map((_, m) => Float32Array.from({ length: ns }, (_, s) => others.get(Math.floor(s / b))[m][base + (s % b)]))];
    const prods = prestackProducts(invert(traces, il, xl));
    prods.forEach((v, o) => { for (let k = 0; k < ns; k++) outs[o][k] = Number.isFinite(v[k]) && Math.abs(v[k]) < NULL_LIM ? v[k] : NULL_VALUE; });
  };
  const dirs = derived.map((d) => volumeDir(uid, d.id));
  const inflight = new Set();
  let uploadError = null;
  const onBrick = async ({ i, j, k, data, output }) => {
    if (uploadError) throw uploadError;
    const path = `${dirs[output]}/${brickRelPath(i, j, k)}`;
    const task = deps.storage.upload(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { contentType: 'application/octet-stream', upsert: false })
      .then(() => { uploaded.push(path); }).catch((e) => { uploadError = uploadError || e; }).finally(() => inflight.delete(task));
    inflight.add(task);
    if (inflight.size >= UPLOADS_IN_FLIGHT) await Promise.race(inflight);
  };
  let result;
  try {
    result = await runVolumeJob({ geom, compute, fetchBrick, onBrick, outputs: 4, shouldCancel: () => ctx.cancelled, onProgress: (done, total) => ctx.progress(0.03 + 0.92 * (total ? done / total : 0), 'Inverting') });
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the inversion bricks failed: ${uploadError.message}`);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }
  try {
    for (let o = 0; o < 4; o++) {
      const d = derived[o];
      const out = buildDerivedManifest({ volumeId: d.id, name: d.name, parentManifest: manifests[0], attribute: { name: PRESTACK_ATTRIBUTE, params: { ...settings, product: KEYS[o], product_label: PRESTACK_PRODUCTS[KEYS[o]], output: KEYS[o] === 'ai' ? 'AI' : KEYS[o].toUpperCase(), blind } }, job: { ...result, stats: result.statsByOutput[o] } });
      await deps.storage.upload(manifestPath(uid, d.id), new TextEncoder().encode(JSON.stringify(out, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes').update({ status: 'ready', survey_meta: derivedSurveyMeta(out, parent.id), updated_at: new Date().toISOString() }).eq('id', d.id).eq('user_id', uid);
      if (error) throw new Error(`Inversion computed but registration failed: ${error.message}`);
    }
    ctx.progress(1, 'Done');
    return { mode: 'volume', volume_ids: p.volume_ids, settings, blind, trace_count: result.traceCount };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

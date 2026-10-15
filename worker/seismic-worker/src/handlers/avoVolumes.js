// avo_volumes: intercept, gradient, fluid factor and a chi projection from
// angle partial stacks (QI programme Q7, Milestone C; SOW section 8), by the
// engines' qi/avo.js. Each stack is a Seismolord volume on one lattice with
// its mean incidence angle. Per trace and sample, the two-term Shuey fit
// over the stacks gives A and B; the Smith-Gidlow fluid factor comes from A
// and B with Gardner's density and the stated Vs/Vp; the chi projection is
// A cos(chi) + B sin(chi). Each product is published as a derived v4 volume
// on the first stack (the browser registers the rows first), labelled an
// elastic estimate.
//
// params: { stacks: [{volume_id, angle}] (2 to 4), products: {A, B, FF, chi} -> volume_id,
//   vs_vp? (0.5), chi_deg? (20) }
// Amplitudes are taken as reflectivity up to one scale for all stacks
// (stacks balanced against each other); A, B and the fluid factor then
// carry that scale too.
import { JobFailure } from '../runJob.js';
import { pilotProblem, pilotOn, pilotBytes } from '../pilot.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { fitShuey, contrastsFromAB, chiProjection } from '../../../../packages/engines/engines/qi/avo.js';
import { scaleFieldAt, avoClassCode, shueyTermsFor } from '../../../../packages/engines/engines/qi/avoCalibration.js';
import { surveyAffine, ilxlToWorld } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { assertTimeDomain } from '../../../../src/pages/apps/Seismolord/lib/verticalDomain.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { sameLattice } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import { buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE } from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AVO_PRODUCTS = Object.freeze({
  A: 'Intercept (A)',
  B: 'Gradient (B)',
  FF: 'Fluid factor (Smith and Gidlow)',
  chi: 'Chi projection',
  // QI upgrade P2.10
  C: 'Curvature (C, three-term Shuey)',
  class: 'AVO class (1 to 4, calibrated A and B)',
});
export const AVO_ATTRIBUTE = 'qi_avo';
const UPLOADS_IN_FLIGHT = 4;
const NULL_LIM = 1e29;

export function validateAvoParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  const st = p.stacks;
  if (!Array.isArray(st) || st.length < 2 || st.length > 4) return 'Give two to four angle stacks.';
  for (const s of st) {
    if (!UUID.test(String(s?.volume_id))) return 'Each stack needs its volume.';
    if (!(s.angle >= 0 && s.angle <= 50)) return 'Each stack needs its mean angle, 0 to 50 degrees.';
  }
  if (new Set(st.map((s) => s.volume_id)).size !== st.length) return 'Each stack must be a different volume.';
  const angles = st.map((s) => s.angle);
  if (Math.max(...angles) - Math.min(...angles) < 5) return 'The stacks need at least 5 degrees between the nearest and the farthest.';
  const prod = p.products || {};
  const keys = Object.keys(prod);
  if (!keys.length || keys.some((k) => !AVO_PRODUCTS[k] || !UUID.test(String(prod[k])))) return 'Choose the products, each with its volume.';
  // QI upgrade P2.10: terms, calibration to reflectivity, class volumes
  if (p.terms != null && ![2, 3, 'auto'].includes(p.terms)) return 'The terms are 2, 3 or auto.';
  const terms = p.terms === 'auto' ? shueyTermsFor(angles) : (p.terms || 2);
  if (terms === 3 && st.length < 3) return 'A three-term fit needs three stacks or more.';
  if (prod.C && terms !== 3) return 'The curvature needs a three-term fit (three stacks reaching 35 degrees, or terms 3).';
  if (p.scale != null && !(Number.isFinite(p.scale) && p.scale !== 0)) return 'The scale must be a number other than zero.';
  if (p.scale_field != null) {
    const w = p.scale_field.wells;
    if (!Array.isArray(w) || !w.length || w.some((x) => !Number.isFinite(x?.x) || !Number.isFinite(x?.y) || !Number.isFinite(x?.scale) || x.scale === 0)) return 'The scale field needs wells with a position and a scale other than zero.';
    if (p.scale_field.method === 'kriging' && !(Number(p.scale_field.variogram?.range) > 0)) return 'Kriging the scale field needs a variogram range.';
  }
  if (prod.class && p.scale == null && p.scale_field == null) return 'An AVO class volume needs A and B in reflectivity: give the scale from the wells or a scale field.';
  if (p.vs_vp != null && !(p.vs_vp > 0.2 && p.vs_vp < 0.8)) return 'Vs/Vp must be between 0.2 and 0.8.';
  if (p.chi_deg != null && !(p.chi_deg >= -90 && p.chi_deg <= 90)) return 'Chi must be -90 to 90 degrees.';
  return null;
}

/** The products of one sample from the stacks' amplitudes. */
export function avoSample(angles, amps, { vsVp, chiDeg, terms = 2, scale = 1 }) {
  const fit = fitShuey(angles, amps, { terms });
  // QI upgrade P2.10: a scale (one, or the field's at this trace) takes the amplitudes to reflectivity
  const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const A = fit.A / s; const B = fit.B / s;
  const ff = contrastsFromAB(A, B, vsVp).fluidFactor;
  return {
    A, B, FF: ff, chi: Number.isFinite(A) && Number.isFinite(B) ? chiProjection(A, B, chiDeg) : NaN,
    C: terms === 3 ? fit.C / s : NaN, class: avoClassCode(A, B),
  };
}

export async function avoVolumes(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateAvoParams(p) || pilotProblem(p.pilot);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const vsVp = p.vs_vp ?? 0.5;
  const chiDeg = p.chi_deg ?? 20;
  const keys = Object.keys(p.products);

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,kind,parent_volume_id,storage_path,crs').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const stacks = [];
  for (const s of p.stacks) {
    const row = await rowOf(s.volume_id);
    if (!row || row.user_id !== uid) throw new JobFailure('not_found', 'A stack was not found in your account.');
    if (row.status !== 'ready') throw new JobFailure('validate_failed', `${row.name} is ${row.status}; the stacks must be complete.`);
    stacks.push({ ...s, row });
  }
  const parent = stacks[0].row;
  const derived = [];
  for (const k of keys) {
    const row = await rowOf(p.products[k]);
    if (!row || row.user_id !== uid || row.kind !== 'attribute' || row.parent_volume_id !== parent.id || row.status !== 'ingesting') {
      throw new JobFailure('validate_failed', 'An output volume is not a new volume registered on the first stack.');
    }
    derived.push(row);
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
    try { assertFloat32Parent(m); assertTimeDomain(m, 'AVO'); } catch (e) { return fail('validate_failed', e.message); }
    manifests.push(m);
  }
  if (!manifests.every((m) => sameLattice(m, manifests[0]))) return fail('validate_failed', 'The stacks are not on one lattice (inlines, crosslines, samples and interval must match).');
  let pilot = null;
  try { pilot = pilotOn(p.pilot, manifests[0]); } catch (e) { return fail('validate_failed', e.message); }
  const need = (pilot ? pilotBytes(pilot.record, manifests[0]) : derivedStorageBytes(manifests[0])) * derived.length;
  const q = await seismicQuota(admin, uid);
  if (q.used + need > q.quota) return fail('over_quota', overQuotaMessage('The AVO volumes', need, q));

  const geom = geomFromManifest(manifests[0]);
  const { ns, brickSize: b } = geom;
  const fetchers = stacks.map((s, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(manifests[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), manifests[k]);
    return async (i, j, kk) => new Float32Array(await f(brickKey(s.row.storage_path, i, j, kk)));
  });
  // the other stacks' bricks for the column runVolumeJob is on
  let column = null; let others = null;
  const fetchBrick = async (i, j, kk) => {
    const key = `${i}-${j}`;
    if (column !== key) { column = key; others = new Map(); }
    const got = await Promise.all(fetchers.slice(1).map((f) => f(i, j, kk)));
    others.set(kk, got);
    return fetchers[0](i, j, kk);
  };
  const angles = stacks.map((s) => s.angle);
  const amps = new Array(stacks.length);
  const terms = p.terms === 'auto' ? shueyTermsFor(angles) : (p.terms || 2);
  const aff = surveyAffine(manifests[0].geometry);
  const posOf = aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl });
  const sf = p.scale_field ? { method: p.scale_field.method === 'kriging' ? 'kriging' : 'idw', ...(p.scale_field.method === 'kriging' ? { variogram: { model: p.scale_field.variogram.model || 'spherical', range: Number(p.scale_field.variogram.range), sill: 1 } } : {}) } : null;
  const scaleAt = sf ? (il, xl) => scaleFieldAt(p.scale_field.wells, posOf(il, xl), sf) : () => (p.scale ?? 1);
  const compute = (trace, outs, il, xl) => {
    const base = ((il % b) * b + (xl % b)) * b;
    const scale = scaleAt(il, xl);
    for (let s = 0; s < ns; s++) {
      amps[0] = Math.abs(trace[s]) <= NULL_LIM ? trace[s] : NaN;
      const kk = Math.floor(s / b); const o = others.get(kk);
      for (let m = 1; m < stacks.length; m++) {
        const v = o[m - 1][base + (s % b)];
        amps[m] = Math.abs(v) <= NULL_LIM ? v : NaN;
      }
      const r = avoSample(angles, amps, { vsVp, chiDeg, terms, scale });
      keys.forEach((k, idx) => { const v = r[k]; (keys.length > 1 ? outs[idx] : outs)[s] = Number.isFinite(v) ? v : NULL_VALUE; });
    }
  };
  const dirs = derived.map((d) => volumeDir(uid, d.id));
  const inflight = new Set();
  let uploadError = null;
  const onBrick = async ({ i, j, k, data, output = 0 }) => {
    if (uploadError) throw uploadError;
    const path = `${dirs[output]}/${brickRelPath(i, j, k)}`;
    const task = deps.storage.upload(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { contentType: 'application/octet-stream', upsert: false })
      .then(() => { uploaded.push(path); })
      .catch((e) => { uploadError = uploadError || e; })
      .finally(() => inflight.delete(task));
    inflight.add(task);
    if (inflight.size >= UPLOADS_IN_FLIGHT) await Promise.race(inflight);
  };
  let result;
  try {
    result = await runVolumeJob({
      geom, compute, fetchBrick, onBrick, outputs: derived.length, window: pilot?.window || null,
      shouldCancel: () => ctx.cancelled,
      onProgress: (done, total) => ctx.progress(0.95 * (total ? done / total : 0), 'Fitting AVO'),
    });
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the AVO bricks failed: ${uploadError.message}`);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }
  try {
    for (let o = 0; o < derived.length; o++) {
      const d = derived[o];
      const params = { qi_class: 'elastic_estimate', product: keys[o], product_label: AVO_PRODUCTS[keys[o]], stacks: stacks.map((s) => ({ volume_id: s.row.id, name: s.row.name, angle: s.angle })), vs_vp: vsVp, ...(keys[o] === 'chi' ? { chi_deg: chiDeg } : {}), method: terms === 3 ? 'Shuey three-term least squares' : 'Shuey two-term least squares', terms, ...(p.scale_field ? { calibration: { kind: 'scale field', method: sf.method, wells: p.scale_field.wells } } : p.scale != null ? { calibration: { kind: 'one scale', scale: p.scale } } : {}), ...(keys[o] === 'class' ? { qi_class: 'interpretation', classes: { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' } } : {}) };
      const job = derived.length > 1 ? { ...result, stats: result.statsByOutput[o] } : result;
      const out = buildDerivedManifest({ volumeId: d.id, name: d.name, parentManifest: manifests[0], attribute: { name: AVO_ATTRIBUTE, params }, job });
      if (pilot) out.pilot = pilot.record;
      await deps.storage.upload(manifestPath(uid, d.id), new TextEncoder().encode(JSON.stringify(out, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes').update({ status: 'ready', survey_meta: derivedSurveyMeta(out, parent.id), updated_at: new Date().toISOString() }).eq('id', d.id).eq('user_id', uid);
      if (error) throw new Error(`AVO computed but registration failed: ${error.message}`);
    }
    ctx.progress(1, 'Done');
    return { volume_ids: Object.fromEntries(keys.map((k, o) => [k, derived[o].id])), stacks: stacks.map((s) => ({ volume_id: s.row.id, angle: s.angle })), vs_vp: vsVp, chi_deg: chiDeg, terms, calibrated: p.scale_field ? 'scale field' : p.scale != null ? 'one scale' : null, trace_count: result.traceCount, ...(pilot ? { pilot: pilot.record } : {}) };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

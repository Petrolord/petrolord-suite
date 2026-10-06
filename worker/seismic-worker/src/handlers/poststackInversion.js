// poststack_inversion: post-stack impedance inversion of a stored volume
// (QI programme Q8a, 2026-10-06), by the run module QI Studio's tests gate
// (src/pages/apps/QIStudio/services/inversionRun.js) over the engines'
// qi/inversion.js and qi/lfm.js. Two modes:
//  - blind: invert only the well traces, each with the low-frequency model
//    built from the other wells, and return the blind-well table. Read only.
//  - volume: the same check, then every trace, published as a derived v4
//    volume the Seismolord viewer opens (the attribute_volume publishing:
//    the browser registers the row 'ingesting', kind 'attribute', first).
// With a sensitivity block (absolute methods) the blind result adds the
// error spread per well and per scenario, and a volume run writes four
// volumes in one pass: AI at Q10, Q50 and Q90 across the scenarios, and the
// relative spread (params.volume_ids: {q10, q50, q90, spread}).
//
// params: { mode, parent_volume_id, volume_id? (volume mode), name?,
//   inversion: { method, wavelet: {samples, dt_ms}, wells: [{name, il, xl,
//   ln_ai}], horizon_ids?, lfmHz?, eps?, epsTV?, outer?, iters?, lambda?,
//   idwPower?, band?, truthHz? } }
// Well ln(AI) is on the volume's time axis (one value per sample, NaN off
// the log), as the browser resamples it.
//
// The worker uses the service role, so this handler checks what RLS would:
// the parent, the derived row and every horizon belong to the job's user,
// and the derived volume fits the user's seismic quota.
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import {
  validateInversionParams, lfmWells, horizonsAtFrom, waveletScale, makeTraceInverter,
  blindWellTable, colouredFromWells, INVERSION_DEFAULTS, INVERSION_METHODS,
  makeScenarioInverters, blindSensitivity, spreadProducts,
} from '../../../../src/pages/apps/QIStudio/services/inversionRun.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { surveyAffine, ilxlToWorld } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import { resampleWavelet } from '../../../../packages/engines/engines/qi/wavelets.js';
import {
  buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE,
} from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOADS_IN_FLIGHT = 4;
export const INVERSION_ATTRIBUTE = 'qi_inversion';
export const SPREAD_PRODUCTS = Object.freeze([
  { key: 'q10', label: 'AI, 10th percentile' },
  { key: 'q50', label: 'AI, 50th percentile' },
  { key: 'q90', label: 'AI, 90th percentile' },
  { key: 'spread', label: 'Relative spread (Q90 - Q10) / Q50' },
]);

export function validatePoststackParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.parent_volume_id))) return 'parent_volume_id is required.';
  if (p.mode === 'volume') {
    if (p.inversion?.sensitivity) {
      if (!SPREAD_PRODUCTS.every((x) => UUID.test(String(p.volume_ids?.[x.key])))) return 'volume_ids needs q10, q50, q90 and spread for a sensitivity volume run.';
    } else if (!UUID.test(String(p.volume_id))) return 'volume_id is required for a volume run.';
  }
  const why = validateInversionParams(p);
  if (why) return why;
  if ((p.inversion.horizon_ids || []).some((h) => !UUID.test(String(h)))) return 'Each horizon id must be a uuid.';
  return null;
}

/** The settings recorded with the product (no well logs, no wavelet samples). */
export function inversionSummary(inv, extra = {}) {
  const s = { ...INVERSION_DEFAULTS, ...inv };
  return {
    qi_class: 'elastic_estimate',
    method: s.method,
    output: INVERSION_METHODS[s.method].absolute ? 'AI' : 'relative AI',
    wells: inv.wells.map((w) => w.name),
    horizon_ids: inv.horizon_ids || [],
    lfm_hz: s.lfmHz,
    ...(s.method === 'model_based' || s.method === 'blocky' ? { eps: s.eps, iters: s.iters } : {}),
    ...(s.method === 'blocky' ? { eps_tv: s.epsTV, outer: s.outer } : {}),
    ...(s.method === 'sparse_spike' ? { lambda: s.lambda, iters: s.iters } : {}),
    ...(s.method === 'coloured' ? { band_hz: s.band } : {}),
    wavelet_dt_ms: inv.wavelet.dt_ms,
    wavelet_length: inv.wavelet.samples.length,
    ...extra,
  };
}

export async function poststackInversion(ctx, deps) {
  const p = ctx.params;
  const problem = validatePoststackParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  // JSON carries the logs' NaN gaps as null
  const inv = { ...p.inversion, wells: p.inversion.wells.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)) })) };
  const absolute = INVERSION_METHODS[inv.method].absolute;

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes')
      .select('id,user_id,status,name,kind,parent_volume_id,storage_path,crs').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const sens = absolute ? inv.sensitivity || null : null;
  const targetIds = p.mode !== 'volume' ? [] : (sens ? SPREAD_PRODUCTS.map((x) => p.volume_ids[x.key]) : [p.volume_id]);
  let derived = [];
  const uploaded = [];
  const cleanup = async () => {
    if (!derived.length) return;
    try {
      for (let i = 0; i < uploaded.length; i += 500) await admin.storage.from('seismic').remove(uploaded.slice(i, i + 500));
      for (const d of derived) await admin.from('seismic_volumes').delete().eq('id', d.id).eq('user_id', uid);
    } catch (e) {
      ctx.log?.warn?.(`cleanup of ${derived.map((d) => d.id).join(', ')} failed: ${e.message}`);
    }
  };
  for (const id of targetIds) {
    const row = await rowOf(id);
    if (!row || row.user_id !== uid) { derived = []; throw new JobFailure('not_found', 'The inversion volume was not found in your account.'); }
    if (row.kind !== 'attribute' || row.parent_volume_id !== p.parent_volume_id || row.status !== 'ingesting') {
      derived = [];
      throw new JobFailure('validate_failed', 'The inversion volume is not a new volume registered on that seismic.');
    }
    derived.push(row);
  }

  const fail = async (stage, message) => { await cleanup(); throw new JobFailure(stage, message); };
  const parent = await rowOf(p.parent_volume_id);
  if (!parent || parent.user_id !== uid) return fail('not_found', 'The seismic volume was not found in your account. Server inversion runs on your own volumes.');
  if (parent.status !== 'ready') return fail('validate_failed', `The seismic volume is ${parent.status}; inversion needs a fully uploaded volume.`);

  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read the volume manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const manifest = await readManifest(`${parent.storage_path}/manifest.json`);
  try { assertFloat32Parent(manifest); } catch (e) { return fail('validate_failed', e.message); }
  const geom = geomFromManifest(manifest);
  const dtMs = Number(manifest.geometry.dt_us) / 1000;
  const { nIl, nXl, ns, brickSize: b } = geom;
  for (const w of inv.wells) {
    if (w.il < 0 || w.il >= nIl || w.xl < 0 || w.xl >= nXl) return fail('validate_failed', `Well ${w.name} is outside the survey.`);
    if (w.ln_ai.length !== ns) return fail('validate_failed', `Well ${w.name}: the impedance log has ${w.ln_ai.length} samples; the volume has ${ns}.`);
  }
  if (p.mode === 'volume') {
    const need = derivedStorageBytes(manifest) * derived.length;
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) return fail('over_quota', overQuotaMessage(derived.length > 1 ? 'The inversion volumes' : 'The inversion volume', need, q));
  }

  // horizons: the user's own picks on this volume
  const grids = [];
  for (const id of inv.horizon_ids || []) {
    const { data: h, error } = await admin.from('seismic_horizons').select('id,user_id,volume_id,name,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read horizon ${id}: ${error.message}`);
    if (!h || h.user_id !== uid || h.volume_id !== parent.id) return fail('not_found', 'A chosen horizon was not found on this volume in your account.');
    const buf = deps.readBlob ? await deps.readBlob(h.storage_path) : await (async () => {
      const { data, error: e } = await admin.storage.from('seismic').download(h.storage_path);
      if (e) throw new Error(`Could not read horizon ${h.name}: ${e.message}`);
      return data.arrayBuffer();
    })();
    const g = new Float32Array(buf);
    if (g.length !== nIl * nXl) return fail('validate_failed', `Horizon ${h.name} is not on this volume's grid.`);
    grids.push(g);
  }

  const fetcher = deps.makeFetcher
    ? deps.makeFetcher(manifest)
    : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), manifest);
  const fetchBrick = async (i, j, k) => new Float32Array(await fetcher(brickKey(parent.storage_path, i, j, k)));
  const readTrace = async (il, xl) => {
    const [, , nk] = geom.grid;
    const bricks = await Promise.all(Array.from({ length: nk }, (_, k) => fetchBrick(Math.floor(il / b), Math.floor(xl / b), k)));
    const base = ((il % b) * b + (xl % b)) * b;
    const out = new Float32Array(ns);
    for (let s = 0; s < ns; s++) out[s] = bricks[Math.floor(s / b)][base + (s % b)];
    return out;
  };

  const aff = surveyAffine(manifest.geometry);
  const posOf = aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl });
  const horizonsAt = horizonsAtFrom(grids, nXl, dtMs);
  const s = { ...INVERSION_DEFAULTS, ...inv };
  const onGrid = (w) => {
    const x = Float64Array.from(w.samples);
    return Number(w.dt_ms) > 0 && Math.abs(w.dt_ms - dtMs) > 1e-9 ? resampleWavelet(x, w.dt_ms, dtMs) : x;
  };
  let wavelet = onGrid(inv.wavelet);

  ctx.progress(0.01, 'Reading the well traces');
  const traces = [];
  for (const w of inv.wells) traces.push(await readTrace(w.il, w.xl));
  let scale = null; let alpha = null; let coloured = null;
  try {
    if (absolute) {
      scale = waveletScale(inv.wells.map((w, k) => ({ trace: traces[k], lnAi: w.ln_ai })), wavelet).scale;
      wavelet = wavelet.map((v) => v * scale);
    } else {
      const c = colouredFromWells({ wellTraces: traces, wellLogs: inv.wells.map((w) => w.ln_ai), dtMs, ns, band: s.band });
      alpha = c.alpha; coloured = c.operator;
    }
  } catch (e) {
    return fail('compute_failed', e.message);
  }
  const wells = lfmWells(inv.wells, { dtMs, lfmHz: s.lfmHz, posOf, horizonsAt });
  const invert = makeTraceInverter({ inv, wavelet, wells, posOf, horizonsAt, ns, dtMs, coloured });

  ctx.progress(0.03, 'Blind wells');
  const blind = inv.wells.length >= 2
    ? blindWellTable({ invert, wells: inv.wells, traces, dtMs, truthHz: s.truthHz, absolute, lowCutHz: s.band[0] })
    : [];
  let scenarioRun = null; let sensitivity = null;
  if (sens) {
    ctx.progress(0.04, 'Sensitivity at the wells');
    const invS = {
      ...inv,
      wavelet: { ...inv.wavelet, samples: Array.from(onGrid(inv.wavelet)) },
      sensitivity: { ...sens, wavelets: (sens.wavelets || []).map((w) => ({ ...w, samples: Array.from(onGrid(w)) })) },
    };
    try {
      scenarioRun = makeScenarioInverters({ inv: invS, wells: inv.wells, traces, posOf, horizonsAt, ns, dtMs });
    } catch (e) {
      return fail('compute_failed', e.message);
    }
    const bs = inv.wells.length >= 2 ? blindSensitivity({ ...scenarioRun, wells: inv.wells, traces, dtMs, truthHz: s.truthHz }) : { rows: [], byScenario: [] };
    sensitivity = { scenarios: scenarioRun.scenarios.map((x) => x.label), scales: scenarioRun.scales, snr: sens.snr ?? null, ...bs };
  }
  const summary = inversionSummary(inv, { ...(scale != null ? { wavelet_scale: scale } : {}), ...(alpha != null ? { impedance_slope: alpha } : {}), ...(sensitivity ? { scenarios: sensitivity.scenarios } : {}) });
  if (ctx.cancelled) { await cleanup(); return null; }
  if (p.mode === 'blind') {
    ctx.progress(1, 'Done');
    return { mode: 'blind', parent_volume_id: parent.id, volume_name: parent.name, settings: summary, blind, ...(sensitivity ? { sensitivity } : {}) };
  }

  // the whole volume, published like an attribute volume
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
  const put = (out, values) => { for (let k = 0; k < ns; k++) out[k] = Number.isFinite(values[k]) ? values[k] : NULL_VALUE; };
  const compute = scenarioRun
    ? (trace, outs, il, xl) => { spreadProducts(scenarioRun.realise(trace, il, xl)).forEach((v, o) => put(outs[o], v)); }
    : (trace, out, il, xl) => {
      const m = invert(trace, il, xl);
      put(out, absolute ? m.map(Math.exp) : m);
    };
  let result;
  try {
    result = await runVolumeJob({
      geom, compute, fetchBrick, onBrick, outputs: derived.length,
      shouldCancel: () => ctx.cancelled,
      onProgress: (done, total) => ctx.progress(0.03 + 0.92 * (total ? done / total : 0), 'Inverting'),
    });
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the inversion bricks failed: ${uploadError.message}`);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }
  try {
    for (let o = 0; o < derived.length; o++) {
      const d = derived[o];
      const product = scenarioRun ? { product: SPREAD_PRODUCTS[o].key, product_label: SPREAD_PRODUCTS[o].label } : {};
      const attribute = { name: INVERSION_ATTRIBUTE, params: { ...summary, ...product, blind, ...(sensitivity ? { sensitivity } : {}) } };
      const job = scenarioRun ? { ...result, stats: result.statsByOutput[o] } : result;
      const out = buildDerivedManifest({ volumeId: d.id, name: d.name, parentManifest: manifest, attribute, job });
      await deps.storage.upload(manifestPath(uid, d.id), new TextEncoder().encode(JSON.stringify(out, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes')
        .update({ status: 'ready', survey_meta: derivedSurveyMeta(out, parent.id), updated_at: new Date().toISOString() })
        .eq('id', d.id).eq('user_id', uid);
      if (error) throw new Error(`Inversion computed but registration failed: ${error.message}`);
    }
    ctx.progress(1, 'Done');
    return {
      mode: 'volume',
      volume_id: derived[0].id,
      ...(scenarioRun ? { volume_ids: Object.fromEntries(SPREAD_PRODUCTS.map((x, o) => [x.key, derived[o].id])) } : {}),
      parent_volume_id: parent.id, volume_name: parent.name, settings: summary, blind,
      ...(sensitivity ? { sensitivity } : {}),
      bricks: uploaded.length, trace_count: result.traceCount,
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

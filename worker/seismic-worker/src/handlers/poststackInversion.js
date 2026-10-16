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
import { horizonLatticeProblem } from '../horizonLattice.js';
import { JobFailure } from '../runJob.js';
import { pilotProblem, pilotOn, pilotBytes } from '../pilot.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import {
  validateInversionParams, horizonsAtFrom,
  blindWellTable, INVERSION_DEFAULTS, INVERSION_METHODS,
  makeScenarioInverters, blindSensitivity, spreadProducts, makeBlindInverter, blindProtocol, residualTrace, residualPercent,
  velocityForLfm,
} from '../../../../src/pages/apps/QIStudio/services/inversionRun.js';
import { blindTableProblem, makeSanityCounter } from '../outputSanity.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { assertTimeDomain } from '../../../../src/pages/apps/Seismolord/lib/verticalDomain.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { surveyAffine, ilxlToWorld, sameLattice } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import { resampleWavelet } from '../../../../packages/engines/engines/qi/wavelets.js';
import {
  buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE,
} from '../../../../packages/engines/engines/seismolord/manifest.js';
import { withUnpackedLogs, packLog } from '../../../../src/pages/apps/QIStudio/services/logPacking.js';

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
  if (p.inversion?.residual && p.mode === 'volume') {
    if (p.inversion.sensitivity) return 'The seismic residual is written with a single inversion, not an uncertainty run.';
    if (!INVERSION_METHODS[p.inversion.method]?.absolute) return 'The seismic residual needs an absolute method (coloured inversion has no forward model).';
    if (!UUID.test(String(p.residual_volume_id))) return 'residual_volume_id is required to write the seismic residual.';
  }
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
    // QI upgrade P2.8: the model options
    lfm_method: inv.lfm?.method === 'kriging' ? 'kriging' : 'inverse distance',
    ...(inv.lfm?.method === 'kriging' ? { lfm_variogram: inv.lfm.variogram } : {}),
    ...((inv.lfm?.barriers || []).length ? { lfm_faults: inv.lfm.barriers.length } : {}),
    ...(inv.velocity ? { lfm_velocity: { volume_id: inv.velocity.volume_id, kind: inv.velocity.kind } } : {}),
    ...extra,
  };
}

export async function poststackInversion(ctx, deps) {
  let p;
  try { p = withUnpackedLogs(ctx.params || {}, 'inversion', ['ln_ai']); } catch (e) { throw new JobFailure('validate_failed', e.message); }
  const problem = validatePoststackParams(p) || pilotProblem(p.pilot);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  // JSON carries the logs' NaN gaps as null
  const inv = p.inversion;
  const absolute = INVERSION_METHODS[inv.method].absolute;

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes')
      .select('id,user_id,status,name,kind,parent_volume_id,storage_path,crs').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const sens = absolute ? inv.sensitivity || null : null;
  // QI upgrade P1.4: the seismic residual as a second output of a single absolute inversion
  const withResidual = p.mode === 'volume' && !sens && absolute && !!inv.residual;
  const targetIds = p.mode !== 'volume' ? [] : (sens ? SPREAD_PRODUCTS.map((x) => p.volume_ids[x.key]) : [p.volume_id, ...(withResidual ? [p.residual_volume_id] : [])]);
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
  try { assertFloat32Parent(manifest); assertTimeDomain(manifest, 'Post-stack inversion'); } catch (e) { return fail('validate_failed', e.message); }
  const geom = geomFromManifest(manifest);
  const dtMs = Number(manifest.geometry.dt_us) / 1000;
  const { nIl, nXl, ns, brickSize: b } = geom;
  for (const w of inv.wells) {
    if (w.il < 0 || w.il >= nIl || w.xl < 0 || w.xl >= nXl) return fail('validate_failed', `Well ${w.name} is outside the survey.`);
    if (w.ln_ai.length !== ns) return fail('validate_failed', `Well ${w.name}: the impedance log has ${w.ln_ai.length} samples; the volume has ${ns}.`);
  }
  let pilot = null;
  try { pilot = p.mode === 'volume' ? pilotOn(p.pilot, manifest) : null; } catch (e) { return fail('validate_failed', e.message); }
  if (p.mode === 'volume') {
    const need = (pilot ? pilotBytes(pilot.record, manifest) : derivedStorageBytes(manifest)) * derived.length;
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) return fail('over_quota', overQuotaMessage(derived.length > 1 ? 'The inversion volumes' : 'The inversion volume', need, q));
  }

  // horizons: the user's own picks on this volume or on any volume of its lattice (horizonLattice.js)
  const grids = [];
  for (const id of inv.horizon_ids || []) {
    const { data: h, error } = await admin.from('seismic_horizons').select('id,user_id,volume_id,name,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read horizon ${id}: ${error.message}`);
    const why = await horizonLatticeProblem(h, { uid, volumeId: parent.id, manifest: manifest, rowOf, readManifest });
    if (why) return fail(why.stage, why.message);
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
  const wavelet = onGrid(inv.wavelet);

  ctx.progress(0.01, 'Reading the well traces');
  const traces = [];
  for (const w of inv.wells) traces.push(await readTrace(w.il, w.xl));

  // QI upgrade P2.8: a velocity volume on the same lattice for the model's trend
  let velocityAtWells = null; let trendAt = null; let velFetch = null; let velCol = null; let velKey = null;
  if (inv.velocity) {
    const vRow = await rowOf(inv.velocity.volume_id);
    if (!vRow || vRow.user_id !== uid) return fail('not_found', 'The velocity volume was not found in your account.');
    if (vRow.status !== 'ready') return fail('validate_failed', `The velocity volume is ${vRow.status}; it must be complete.`);
    const vMan = await readManifest(`${vRow.storage_path}/manifest.json`);
    try { assertFloat32Parent(vMan); } catch (e) { return fail('validate_failed', e.message); }
    if (vMan.geometry?.vertical?.domain === 'depth') return fail('validate_failed', 'The velocity volume is in depth; the model trend needs a velocity volume in two-way time on the seismic lattice.');
    if (!sameLattice(vMan, manifest)) return fail('validate_failed', 'The velocity volume is not on the seismic volume\'s lattice; crop or resample it to the same inlines, crosslines and samples.');
    const vf = deps.makeFetcher ? deps.makeFetcher(vMan, 1) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), vMan);
    velFetch = async (i, j, k) => new Float32Array(await vf(brickKey(vRow.storage_path, i, j, k)));
    const prepV = (tr) => velocityForLfm(tr, { kind: inv.velocity.kind, dtMs, lfmHz: s.lfmHz });
    const readVel = async (il, xl) => {
      const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, k) => velFetch(Math.floor(il / b), Math.floor(xl / b), k)));
      const base = ((il % b) * b + (xl % b)) * b;
      return Float32Array.from({ length: ns }, (_, x) => bricks[Math.floor(x / b)][base + (x % b)]);
    };
    const atWells = new Map();
    velocityAtWells = [];
    for (const w of inv.wells) { const v = prepV(await readVel(w.il, w.xl)); velocityAtWells.push(v); atWells.set(`${w.il},${w.xl}`, v); }
    // at the wells from the map; over the volume from the column the run is on
    trendAt = (il, xl) => {
      const k = `${il},${xl}`;
      if (atWells.has(k)) return atWells.get(k);
      if (!velCol || velKey !== `${Math.floor(il / b)}-${Math.floor(xl / b)}`) return null;
      const base = ((il % b) * b + (xl % b)) * b;
      return prepV(Float32Array.from({ length: ns }, (_, x) => velCol.get(Math.floor(x / b))?.[base + (x % b)] ?? NaN));
    };
  }
  // truly blind (QI upgrade P1.2): the inverter is rebuilt for each held-back
  // well without it (wavelet scale or coloured operator, the field wavelet
  // average when the browser sent the others' average, and the model)
  let blindInv;
  try {
    blindInv = makeBlindInverter({
      inv, wavelet, onGrid: (samples, dt) => onGrid({ samples, dt_ms: dt }), wells: inv.wells, traces, posOf, horizonsAt, ns, dtMs, velocityAtWells, trendAt,
    });
  } catch (e) {
    return fail('compute_failed', e.message);
  }
  const { invert, scale, alpha } = blindInv;

  ctx.progress(0.03, 'Blind wells');
  const blind = inv.wells.length >= 2
    ? blindWellTable({ invert, wells: inv.wells, traces, dtMs, truthHz: s.truthHz, absolute, lowCutHz: s.band[0] })
    : [];
  const blindTraces = blindInv.blindTraces;
  // QI upgrade P2.8: named model scenarios compared at the blind wells
  let lfmScenarios = null;
  if (inv.lfm_scenarios && inv.wells.length >= 2) {
    ctx.progress(0.035, 'Model scenarios at the wells');
    lfmScenarios = [];
    for (const sc of inv.lfm_scenarios) {
      const invS = { ...inv, lfm: sc.lfm || null, velocity: sc.velocity ? inv.velocity : null, lfm_scenarios: undefined };
      try {
        const bi = makeBlindInverter({ inv: invS, wavelet, onGrid: (samples, dt) => onGrid({ samples, dt_ms: dt }), wells: inv.wells, traces, posOf, horizonsAt, ns, dtMs, velocityAtWells: sc.velocity ? velocityAtWells : null, trendAt });
        const t = blindWellTable({ invert: bi.invert, wells: inv.wells, traces, dtMs, truthHz: s.truthHz, absolute, lowCutHz: s.band[0] });
        const errs = t.map((r) => r.blind.rmsPct).filter(Number.isFinite);
        lfmScenarios.push({ name: sc.name, rows: t.map((r) => ({ name: r.name, corr: r.blind.corr, rmsPct: r.blind.rmsPct })), meanRmsPct: errs.length ? errs.reduce((a, v) => a + v, 0) / errs.length : null, ...(bi.trendFit ? { trend: { a: bi.trendFit.a, b: bi.trendFit.b, r2: bi.trendFit.r2 } } : {}) });
      } catch (e) {
        lfmScenarios.push({ name: sc.name, error: e.message });
      }
    }
  }
  // QI upgrade P1.4: how much of the seismic the full inversion leaves unexplained at each well
  const residualAtWells = absolute && blindInv.scaledWavelet ? inv.wells.map((w, k) => {
    const res = residualTrace(traces[k], invert(traces[k], w.il, w.xl), blindInv.scaledWavelet);
    return { name: w.name, pct: residualPercent(traces[k], res) };
  }) : [];
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
    // the blind Q50 replaces the single-inversion blind traces for the property check
    if (inv.wells.length >= 2) blindTraces.clear();
    const bs = inv.wells.length >= 2 ? blindSensitivity({ ...scenarioRun, wells: inv.wells, traces, dtMs, truthHz: s.truthHz, blindTraces }) : { rows: [], byScenario: [] };
    // the scenarios hold back each well from their model and wavelet scale; their wavelets are the ones listed
    sensitivity = { scenarios: scenarioRun.scenarios.map((x) => x.label), scales: scenarioRun.scales, snr: sens.snr ?? null, ...bs, blind_protocol: blindProtocol({ absolute: true, blindWavelets: false }) };
  }
  const blindProtocolRec = { ...blindInv.protocol, held_back: blindInv.scales };
  const summary = inversionSummary(inv, {
    ...(scale != null ? { wavelet_scale: scale } : {}), ...(blindInv.scaleTie ? { wavelet_scale_tie: { corr: blindInv.scaleTie.corr, samples: blindInv.scaleTie.samples } } : {}), ...(alpha != null ? { impedance_slope: alpha } : {}), ...(blindInv.polarity != null ? { coloured_polarity: blindInv.polarity } : {}), ...(sensitivity ? { scenarios: sensitivity.scenarios } : {}),
    blind_protocol: blindProtocolRec,
    ...(blindInv.trendFit ? { lfm_trend: { a: blindInv.trendFit.a, b: blindInv.trendFit.b, r2: blindInv.trendFit.r2, n: blindInv.trendFit.n } } : {}),
  });
  // the held-back estimate at each well (ln AI, packed), recorded with a
  // volume so the property check can predict each well from an inversion
  // that never saw it (absolute methods only; relative AI has no level)
  const blindTracesRec = absolute ? [...blindTraces.entries()].map(([name, m]) => {
    const w = inv.wells.find((x) => x.name === name);
    return { name, il: w.il, xl: w.xl, ln_ai: packLog(Array.from(m, (v) => (Number.isFinite(v) ? v : NaN))) };
  }).filter((x) => x.ln_ai.n > 0) : [];
  if (ctx.cancelled) { await cleanup(); return null; }
  const absurd = blindTableProblem(blind);
  if (absurd) return fail('compute_failed', absurd);
  if (p.mode === 'blind') {
    ctx.progress(1, 'Done');
    return { mode: 'blind', parent_volume_id: parent.id, volume_name: parent.name, settings: summary, blind, blind_protocol: blindProtocolRec, residual_at_wells: residualAtWells, ...(lfmScenarios ? { lfm_scenarios: lfmScenarios } : {}), ...(sensitivity ? { sensitivity } : {}) };
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
  const sanity = makeSanityCounter();
  const liveIn = (v) => Number.isFinite(v) && Math.abs(v) < 1e29;
  const put = (out, values, trace = null) => { for (let k = 0; k < ns; k++) { if (trace) sanity.add(liveIn(trace[k]), values[k]); out[k] = Number.isFinite(values[k]) ? values[k] : NULL_VALUE; } };
  const compute = scenarioRun
    ? (trace, outs, il, xl) => { spreadProducts(scenarioRun.realise(trace, il, xl)).forEach((v, o) => put(outs[o], v)); }
    : withResidual
      ? (trace, outs, il, xl) => {
        const m = invert(trace, il, xl);
        put(outs[0], m.map(Math.exp), trace);
        put(outs[1], residualTrace(trace, m, blindInv.scaledWavelet));
      }
      : (trace, out, il, xl) => {
        const m = invert(trace, il, xl);
        put(out, absolute ? m.map(Math.exp) : m, trace);
      };
  let result;
  try {
    // with a velocity trend, the velocity bricks of the column the run is on are read beside the seismic ones
    const fetchWithVelocity = velFetch ? async (i, j, k) => {
      const key = `${i}-${j}`;
      if (velKey !== key) { velKey = key; velCol = new Map(); }
      velCol.set(k, await velFetch(i, j, k));
      return fetchBrick(i, j, k);
    } : fetchBrick;
    result = await runVolumeJob({
      geom, compute, fetchBrick: fetchWithVelocity, onBrick, outputs: derived.length, window: pilot?.window || null,
      shouldCancel: () => ctx.cancelled,
      onProgress: (done, total) => ctx.progress(0.03 + 0.92 * (total ? done / total : 0), 'Inverting'),
    });
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the inversion bricks failed: ${uploadError.message}`);
    if (sanity.verdict().fail) throw new JobFailure('compute_failed', sanity.verdict('the impedance').fail);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }
  try {
    for (let o = 0; o < derived.length; o++) {
      const d = derived[o];
      const product = scenarioRun ? { product: SPREAD_PRODUCTS[o].key, product_label: SPREAD_PRODUCTS[o].label }
        : withResidual && o === 1 ? { product: 'residual', product_label: 'Seismic residual (input minus the synthetic of the inversion)', output: 'seismic residual' } : {};
      const attribute = { name: INVERSION_ATTRIBUTE, params: { ...summary, ...product, blind, ...(sensitivity ? { sensitivity } : {}), ...(blindTracesRec.length && (scenarioRun ? SPREAD_PRODUCTS[o].key === 'q50' : o === 0) ? { blind_traces: blindTracesRec } : {}), ...(o === 0 && residualAtWells.length ? { residual_at_wells: residualAtWells } : {}) } };
      const job = scenarioRun || withResidual ? { ...result, stats: result.statsByOutput[o] } : result;
      const out = buildDerivedManifest({ volumeId: d.id, name: d.name, parentManifest: manifest, attribute, job });
      if (pilot) out.pilot = pilot.record;
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
      ...(withResidual ? { residual_volume_id: derived[1].id, residual: { percent_of_seismic: manifest.stats?.rms > 0 ? (100 * result.statsByOutput[1].rms) / manifest.stats.rms : null, at_wells: residualAtWells } } : {}),
      parent_volume_id: parent.id, volume_name: parent.name, settings: summary, blind, blind_protocol: blindProtocolRec, residual_at_wells: residualAtWells,
      ...(sensitivity ? { sensitivity } : {}),
      bricks: uploaded.length, trace_count: result.traceCount, ...(pilot ? { pilot: pilot.record } : {}),
      ...(sanity.verdict().warning ? { warnings: [sanity.verdict('the impedance').warning] } : {}),
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

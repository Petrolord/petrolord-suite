// property_prediction: porosity or facies from an inverted impedance volume
// (QI programme Q9a, 2026-10-07), by the run module QI Studio's tests gate
// (src/pages/apps/QIStudio/services/propertyRun.js) over the engines'
// qi/propertyPrediction.js. Two modes:
//  - calibrate: fit at the wells (logs upscaled to seismic scale), then
//    leave each well out and predict it from the inverted impedance at its
//    trace. Read only.
//  - volume: the same calibration, then every trace of the impedance
//    volume, published as derived v4 volumes Seismolord opens: porosity at
//    Q10, Q50 and Q90 (volume_ids {q10, q50, q90}), or one probability per
//    facies and the most likely facies code (volume_ids {'p:<code>', best}).
//    The browser registers the rows ('ingesting', kind 'attribute') first.
//
// params: { mode, ai_volume_id, volume_ids?, name?, property: { kind,
//   wells: [{name, il, xl, ln_ai, target}], names? (facies code -> name),
//   window_ms?, upscaleHz?, density?, priors? } }
// The impedance volume must be an absolute inversion product (AI, not
// relative AI or a spread). The worker uses the service role, so this
// handler checks what RLS would: every volume belongs to the job's user,
// and the outputs fit the user's seismic quota.
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import {
  validatePropertyParams, calibrateProperty, predictTrace, faciesClass, PROPERTY_KINDS,
} from '../../../../src/pages/apps/QIStudio/services/propertyRun.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { runVolumeJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import {
  buildDerivedManifest, brickRelPath, volumeDir, manifestPath, NULL_VALUE,
} from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOADS_IN_FLIGHT = 4;
export const PROPERTY_ATTRIBUTE = 'qi_property';

/** The output keys of a run, in the order predictTrace returns them (facies: the model's class order). */
export function outputKeys(pr, classNames = null) {
  if (pr.kind !== 'facies') return ['q10', 'q50', 'q90'];
  const codeOf = Object.fromEntries(Object.entries(pr.names).map(([c, n]) => [n, c]));
  return [...(classNames || Object.values(pr.names)).map((n) => `p:${codeOf[n]}`), 'best'];
}

export function validatePropertyJob(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.ai_volume_id))) return 'ai_volume_id is required.';
  const why = validatePropertyParams(p);
  if (why) return why;
  if (p.mode === 'volume') {
    const keys = outputKeys(p.property);
    if (!keys.every((k) => UUID.test(String(p.volume_ids?.[k])))) return `volume_ids needs ${keys.join(', ')} for a volume run.`;
  }
  return null;
}

export async function propertyPrediction(ctx, deps) {
  const p = ctx.params;
  const problem = validatePropertyJob(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  // JSON carries NaN gaps as null
  const num = (a) => a.map((v) => (Number.isFinite(v) ? v : NaN));
  const pr = { ...p.property, wells: p.property.wells.map((w) => ({ ...w, ln_ai: num(w.ln_ai), target: num(w.target) })) };

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes')
      .select('id,user_id,status,name,kind,parent_volume_id,storage_path,attribute_params').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const source = await rowOf(p.ai_volume_id);
  if (!source || source.user_id !== uid) throw new JobFailure('not_found', 'The impedance volume was not found in your account.');
  if (source.status !== 'ready') throw new JobFailure('validate_failed', `The impedance volume is ${source.status}; it must be complete.`);

  let derived = [];
  const uploaded = [];
  const cleanup = async () => {
    try {
      for (let i = 0; i < uploaded.length; i += 500) await admin.storage.from('seismic').remove(uploaded.slice(i, i + 500));
      for (const d of derived) await admin.from('seismic_volumes').delete().eq('id', d.id).eq('user_id', uid);
    } catch (e) {
      ctx.log?.warn?.(`cleanup failed: ${e.message}`);
    }
  };
  const fail = async (stage, message) => { await cleanup(); throw new JobFailure(stage, message); };
  if (p.mode === 'volume') {
    for (const id of Object.values(p.volume_ids)) {
      const row = await rowOf(id);
      if (!row || row.user_id !== uid || row.kind !== 'attribute' || row.parent_volume_id !== source.id || row.status !== 'ingesting') {
        derived = [];
        throw new JobFailure('validate_failed', 'An output volume is not a new volume registered on that impedance volume.');
      }
      derived.push(row);
    }
  }

  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read the volume manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const manifest = await readManifest(`${source.storage_path}/manifest.json`);
  try { assertFloat32Parent(manifest); } catch (e) { return fail('validate_failed', e.message); }
  const ap = manifest.attribute?.params || {};
  if (manifest.attribute?.name !== 'qi_inversion' || ap.output !== 'AI' || (ap.product && ap.product === 'spread')) {
    return fail('validate_failed', 'Choose an absolute impedance volume from an inversion (not relative impedance or a spread).');
  }
  const geom = geomFromManifest(manifest);
  const dtMs = Number(manifest.geometry.dt_us) / 1000;
  const { nIl, nXl, ns, brickSize: b } = geom;
  for (const w of pr.wells) {
    if (w.il < 0 || w.il >= nIl || w.xl < 0 || w.xl >= nXl) return fail('validate_failed', `Well ${w.name} is outside the survey.`);
    if (w.ln_ai.length !== ns) return fail('validate_failed', `Well ${w.name}: the logs have ${w.ln_ai.length} samples; the volume has ${ns}.`);
  }
  if (p.mode === 'volume') {
    const need = derivedStorageBytes(manifest) * derived.length;
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) return fail('over_quota', overQuotaMessage('The property volumes', need, q));
  }

  const fetcher = deps.makeFetcher
    ? deps.makeFetcher(manifest)
    : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), manifest);
  const fetchBrick = async (i, j, k) => new Float32Array(await fetcher(brickKey(source.storage_path, i, j, k)));
  const readTrace = async (il, xl) => {
    const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, k) => fetchBrick(Math.floor(il / b), Math.floor(xl / b), k)));
    const base = ((il % b) * b + (xl % b)) * b;
    return Float32Array.from({ length: ns }, (_, s) => bricks[Math.floor(s / b)][base + (s % b)]);
  };

  ctx.progress(0.02, 'Calibrating at the wells');
  const aiTraces = [];
  for (const w of pr.wells) aiTraces.push(await readTrace(w.il, w.xl));
  let cal;
  try {
    cal = calibrateProperty({ pr, aiTraces, dtMs });
  } catch (e) {
    return fail('compute_failed', e.message);
  }
  const settings = {
    kind: pr.kind, label: PROPERTY_KINDS[pr.kind].label, ai_volume_id: source.id, ai_volume_name: source.name,
    wells: pr.wells.map((w) => w.name), window_ms: pr.window_ms || null, upscale_hz: pr.upscaleHz ?? 50,
    ...(pr.kind === 'facies' ? { names: pr.names, density: pr.density || 'gaussian', priors: pr.priors || 'wells' } : {}),
  };
  if (ctx.cancelled) { await cleanup(); return null; }
  if (p.mode === 'calibrate') {
    ctx.progress(1, 'Done');
    return { mode: 'calibrate', settings, summary: cal.summary, rows: cal.rows };
  }

  const keys = outputKeys(pr, pr.kind === 'facies' ? cal.model.classes.map((c) => c.name) : null);
  if (keys.some((k) => !p.volume_ids[k])) return fail('validate_failed', 'A facies present at the wells has no output volume.');
  const targets = keys.map((k) => derived.find((d) => d.id === p.volume_ids[k]));
  const dirs = targets.map((d) => volumeDir(uid, d.id));
  const inflight = new Set();
  let uploadError = null;
  const onBrick = async ({ i, j, k, data, output }) => {
    if (uploadError) throw uploadError;
    const path = `${dirs[output]}/${brickRelPath(i, j, k)}`;
    const task = deps.storage.upload(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { contentType: 'application/octet-stream', upsert: false })
      .then(() => { uploaded.push(path); })
      .catch((e) => { uploadError = uploadError || e; })
      .finally(() => inflight.delete(task));
    inflight.add(task);
    if (inflight.size >= UPLOADS_IN_FLIGHT) await Promise.race(inflight);
  };
  const compute = (trace, outs) => {
    predictTrace(cal.model, pr, trace).forEach((v, o) => {
      for (let k = 0; k < ns; k++) outs[o][k] = Number.isFinite(v[k]) ? v[k] : NULL_VALUE;
    });
  };
  let result;
  try {
    result = await runVolumeJob({
      geom, compute, fetchBrick, onBrick, outputs: targets.length,
      shouldCancel: () => ctx.cancelled,
      onProgress: (done, total) => ctx.progress(0.05 + 0.9 * (total ? done / total : 0), 'Predicting'),
    });
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the property bricks failed: ${uploadError.message}`);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }
  try {
    for (let o = 0; o < targets.length; o++) {
      const d = targets[o]; const key = keys[o];
      const facies = key.startsWith('p:') ? pr.names[key.slice(2)] : null;
      const product = pr.kind === 'facies'
        ? (facies ? { product: key, product_label: `Probability of ${facies}`, qi_class: faciesClass(facies) } : { product: 'best', product_label: 'Most likely facies (code)', qi_class: 'calibrated_prediction' })
        : { product: key, product_label: `Porosity, ${key.toUpperCase()}`, qi_class: 'calibrated_prediction' };
      const attribute = { name: PROPERTY_ATTRIBUTE, params: { ...settings, ...product, summary: cal.summary, check: cal.rows } };
      const out = buildDerivedManifest({ volumeId: d.id, name: d.name, parentManifest: manifest, attribute, job: { ...result, stats: result.statsByOutput[o] } });
      await deps.storage.upload(manifestPath(uid, d.id), new TextEncoder().encode(JSON.stringify(out, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes')
        .update({ status: 'ready', survey_meta: derivedSurveyMeta(out, source.id), updated_at: new Date().toISOString() })
        .eq('id', d.id).eq('user_id', uid);
      if (error) throw new Error(`Property computed but registration failed: ${error.message}`);
    }
    // a facies named but absent at the wells has no model class: its registered row goes
    for (const d of derived) if (!targets.includes(d)) await admin.from('seismic_volumes').delete().eq('id', d.id).eq('user_id', uid);
    ctx.progress(1, 'Done');
    return { mode: 'volume', volume_ids: Object.fromEntries(keys.map((k, o) => [k, targets[o].id])), settings, summary: cal.summary, rows: cal.rows, trace_count: result.traceCount };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

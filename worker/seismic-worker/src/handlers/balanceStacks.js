// spectral_balance: angle stacks given one bandwidth (QI round 3,
// 2026-10-15; the Q5 follow-up "a survey-wide shaping filter per stack, which
// keeps relative amplitudes"), by the engines' qi/prestackConditioning.js.
// Each stack's mean amplitude spectrum is measured on about 300 traces
// across the lattice; one zero-phase operator per stack takes it to the
// target (the reference stack's mean spectrum, or flat inside the band),
// scaled so the stack keeps its own energy in the band, and is applied to
// every trace as a derived volume on that stack. One operator per stack, so
// a trace twice as bright as its neighbour stays exactly twice as bright,
// and the stacks keep their levels for AVO; match_stacks then aligns time,
// phase and scale.
//
// params: { stacks: [volume_id] (1 to 6), volume_ids: { [stack id]: output id },
//   target: 'reference' | 'flat', reference_volume_id? (target reference),
//   f_lo_hz? (8), f_hi_hz? (60), max_gain_db? (20), sample_traces? (300) }
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { meanAmplitudeSpectrum, shapingOperator, applyShaping } from '../../../../packages/engines/engines/qi/prestackConditioning.js';
import { assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta } from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { assertTimeDomain } from '../../../../src/pages/apps/Seismolord/lib/verticalDomain.js';
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
export const BALANCE_ATTRIBUTE = 'qi_balanced_stack';

export function validateBalanceParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!Array.isArray(p.stacks) || p.stacks.length < 1 || p.stacks.length > 6 || p.stacks.some((s) => !UUID.test(String(s)))) return 'Give one to six stacks to balance.';
  if (new Set(p.stacks).size !== p.stacks.length) return 'A stack is listed twice.';
  if (!['reference', 'flat'].includes(p.target)) return 'The target is the reference stack\'s spectrum or flat.';
  if (p.target === 'reference' && !UUID.test(String(p.reference_volume_id))) return 'Choose the reference stack.';
  if (!p.stacks.every((s) => UUID.test(String(p.volume_ids?.[s])))) return 'Each stack needs its output volume.';
  for (const k of ['f_lo_hz', 'f_hi_hz', 'max_gain_db', 'sample_traces']) if (p[k] != null && !(fin(p[k]) && p[k] !== '')) return `${k} must be a number.`;
  const lo = p.f_lo_hz ?? 8; const hi = p.f_hi_hz ?? 60;
  if (!(lo >= 1 && hi > lo + 5 && hi <= 250)) return 'The band needs a low frequency of 1 Hz or more and a high one at least 5 Hz above it, up to 250 Hz.';
  if (p.max_gain_db != null && !(p.max_gain_db >= 0 && p.max_gain_db <= 40)) return 'The largest boost must be 0 to 40 dB.';
  return null;
}

export async function balanceStacksJob(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateBalanceParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;
  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes').select('id,user_id,status,name,kind,parent_volume_id,storage_path').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read a manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  const useRef = p.target === 'reference';
  const ref = useRef ? await rowOf(p.reference_volume_id) : null;
  if (useRef && (!ref || ref.user_id !== uid || ref.status !== 'ready')) throw new JobFailure('not_found', 'The reference stack was not found in your account, or it is not complete.');
  const stacks = [];
  for (const id of p.stacks) {
    const row = await rowOf(id);
    if (!row || row.user_id !== uid || row.status !== 'ready') throw new JobFailure('not_found', 'A stack was not found in your account, or it is not complete.');
    const out = await rowOf(p.volume_ids[id]);
    if (!out || out.user_id !== uid || out.kind !== 'attribute' || out.parent_volume_id !== id || out.status !== 'ingesting') throw new JobFailure('validate_failed', 'An output volume is not a new volume registered on its stack.');
    stacks.push({ row, out });
  }
  const vols = [...(useRef ? [ref] : []), ...stacks.map((s) => s.row)];
  const mans = [];
  for (const v of vols) { const m = await readManifest(`${v.storage_path}/manifest.json`); try { assertFloat32Parent(m); assertTimeDomain(m, 'Spectral balancing'); } catch (e) { throw new JobFailure('validate_failed', e.message); } mans.push(m); }
  if (!mans.every((m) => sameLattice(m, mans[0]))) throw new JobFailure('validate_failed', 'The stacks are not on one lattice.');
  const need = derivedStorageBytes(mans[0]) * stacks.length;
  const q = await seismicQuota(admin, uid);
  if (q.used + need > q.quota) throw new JobFailure('over_quota', overQuotaMessage('The balanced stacks', need, q));
  const geom = geomFromManifest(mans[0]);
  const { nIl, nXl, ns, brickSize: b } = geom;
  const dtMs = mans[0].geometry.dt_us / 1000;
  const nyq = 500 / dtMs;
  const fLo = p.f_lo_hz ?? 8; const fHi = Math.min(p.f_hi_hz ?? 60, 0.95 * nyq);
  const fetchers = vols.map((v, k) => {
    const f = deps.makeFetcher ? deps.makeFetcher(mans[k], k) : v4BrickFetcher(storageBrickFetcher({ supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic' }), mans[k]);
    return async (i, j, kk) => new Float32Array(await f(brickKey(v.storage_path, i, j, kk)));
  });
  const readTrace = async (k, il, xl) => {
    const bricks = await Promise.all(Array.from({ length: geom.grid[2] }, (_, kk) => fetchers[k](Math.floor(il / b), Math.floor(xl / b), kk)));
    const base = ((il % b) * b + (xl % b)) * b;
    return Float64Array.from({ length: ns }, (_, s) => { const v = bricks[Math.floor(s / b)][base + (s % b)]; return Math.abs(v) <= NULL_LIM ? v : NaN; });
  };
  // the mean spectra on sampled traces
  const target = p.sample_traces ?? 300;
  const stride = Math.max(1, Math.round(Math.sqrt((nIl * nXl) / target)));
  const samples = vols.map(() => []);
  for (let il = Math.floor(stride / 2); il < nIl; il += stride) {
    for (let xl = Math.floor(stride / 2); xl < nXl; xl += stride) {
      if (ctx.cancelled) return null;
      for (let k = 0; k < vols.length; k++) { const t = await readTrace(k, il, xl); if (t.some(fin)) samples[k].push(t); }
    }
  }
  if (samples.some((s) => !s.length)) throw new JobFailure('compute_failed', 'A stack has no live trace where the spectra are sampled.');
  const spectra = samples.map((s) => meanAmplitudeSpectrum(s, dtMs));
  const refSpec = useRef ? spectra[0] : null;
  const off = useRef ? 1 : 0;
  const opts = { fLo, fHi, maxGainDb: p.max_gain_db ?? 20 };
  const ops = stacks.map((_, k) => shapingOperator(spectra[k + off], refSpec ? refSpec.amp : null, opts));
  // what the operator did, for the table: the amplitude centroid of the spectrum in the band, before and after
  const centroidHz = (amp, df) => { let s = 0; let w = 0; for (let k = 0; k < amp.length; k++) { const f = k * df; if (f >= fLo && f <= fHi) { s += f * amp[k]; w += amp[k]; } } return w > 0 ? s / w : null; };
  const bandwidth = (amp, df) => { const mx = Math.max(...amp); let lo = null; let hi = null; for (let k = 0; k < amp.length; k++) if (amp[k] >= 0.5 * mx) { if (lo == null) lo = k; hi = k; } return lo == null ? null : [lo * df, hi * df]; };
  ctx.progress(0.1, 'Applying the operators');
  const uploaded = []; const results = [];
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
        const r = applyShaping(t, op);
        for (let s = 0; s < ns; s++) outT[s] = Math.abs(trace[s]) <= NULL_LIM && fin(r[s]) ? r[s] : NULL_VALUE;
      };
      const result = await runVolumeJob({ geom, compute, fetchBrick: fetchers[k + off], onBrick, shouldCancel: () => ctx.cancelled, onProgress: (done, total) => ctx.progress(0.1 + 0.85 * ((k + (total ? done / total : 0)) / stacks.length), `Balancing ${row.name}`) });
      await Promise.all(inflight);
      if (uploadError) throw new JobFailure('upload_failed', `Uploading the balanced bricks failed: ${uploadError.message}`);
      if (ctx.cancelled) throw new JobFailure('cancelled', 'Cancelled.');
      const after = meanAmplitudeSpectrum(samples[k + off].map((t) => applyShaping(Float64Array.from(t, (v) => (fin(v) ? v : 0)), op)), dtMs);
      const before = spectra[k + off];
      const params = {
        qi_class: 'elastic_estimate', target: p.target, ...(useRef ? { reference_volume_id: ref.id, reference_name: ref.name } : {}),
        f_lo_hz: fLo, f_hi_hz: fHi, max_gain_db: opts.maxGainDb, sampled_traces: samples[k + off].length,
        centroid_hz_before: centroidHz(before.amp, before.df), centroid_hz_after: centroidHz(after.amp, after.df),
        band_half_power_before: bandwidth(before.amp, before.df), band_half_power_after: bandwidth(after.amp, after.df),
        ...(refSpec ? { centroid_hz_reference: centroidHz(refSpec.amp, refSpec.df), band_half_power_reference: bandwidth(refSpec.amp, refSpec.df) } : {}),
        // the operator itself, every 2 Hz, for the panel's chart
        operator: Array.from({ length: Math.floor(Math.min(fHi + 10, nyq) / 2) + 1 }, (_, n) => { const f = 2 * n; const kk = Math.min(op.gain.length - 1, Math.round(f / op.df)); return [f, op.gain[kk]]; }),
      };
      const man = buildDerivedManifest({ volumeId: out.id, name: out.name, parentManifest: mans[k + off], attribute: { name: BALANCE_ATTRIBUTE, params }, job: result });
      await deps.storage.upload(manifestPath(uid, out.id), new TextEncoder().encode(JSON.stringify(man, null, 1)), { contentType: 'application/json', upsert: true });
      const { error } = await admin.from('seismic_volumes').update({ status: 'ready', survey_meta: derivedSurveyMeta(man, row.id), updated_at: new Date().toISOString() }).eq('id', out.id).eq('user_id', uid);
      if (error) throw new Error(`Balanced but registration failed: ${error.message}`);
      results.push({ stack_id: row.id, stack_name: row.name, volume_id: out.id, ...params });
    }
  } catch (e) {
    try { for (let i = 0; i < uploaded.length; i += 500) await admin.storage.from('seismic').remove(uploaded.slice(i, i + 500)); for (const s of stacks) await admin.from('seismic_volumes').delete().eq('id', s.out.id).eq('user_id', uid); } catch { /* best effort */ }
    if (ctx.cancelled) return null;
    throw e;
  }
  ctx.progress(1, 'Done');
  return { target: p.target, ...(useRef ? { reference_volume_id: ref.id } : {}), f_lo_hz: fLo, f_hi_hz: fHi, stacks: results };
}

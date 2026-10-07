// angle_stacks: angle partial stacks from a gather store (QI programme Q3b,
// Milestone C; SOW sections 2 and 3). Each offset bin's incidence angle at
// each time is Walden's straight-ray angle (engines qi/prestack.js) from an
// RMS velocity function (a time table; Vint by Dix per segment). The angles
// depend only on the bin and the time, so they are computed once. A partial
// stack over [from, to) degrees is, per CDP and sample, the fold-weighted
// mean of the bins whose angle falls in the range. Each range is written as
// a SEG-Y file in the work bucket and registered as a file the existing
// server import converts into a Seismolord volume (scan_dataset, then
// stack_to_v4). The usable angle of each CDP (the widest angle reached with
// at least min_fold traces, averaged over the live samples) is written as a
// map beside them.
//
// params: { dataset_id (gathers_offset), velocity: {t_ms: [], vrms: []},
//   ranges: [{name, from, to}] (1 to 4, degrees), min_fold? (1), name? }
import { webcrypto } from 'node:crypto';
import { JobFailure } from '../runJob.js';
import { multipartWriter, s3RangeReader } from '../s3.js';
import { waldenAngle, velocityOnGrid } from '../../../../packages/engines/engines/qi/prestack.js';
import { readGather, gatherBlockKey, foldBlockKey } from '../../../../packages/engines/engines/qi/gatherStore.js';
import { textualHeader, binaryHeader, traceHeader, traceSamples } from '../../../../packages/engines/engines/seismolord/segyWrite.js';
import { surveyAffine, ilxlToWorld } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { PART_SIZE, parseUploadId, completeXml } from '../../../../supabase/functions/qi-upload-url/logic.ts';
import { fileFingerprint } from '../../../../src/pages/apps/Seismolord/services/ingestResume.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[A-Za-z0-9 _-]{1,40}$/;

export function validateAngleParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  const v = p.velocity;
  if (!v || !Array.isArray(v.t_ms) || !Array.isArray(v.vrms) || !v.t_ms.length || v.t_ms.length !== v.vrms.length) return 'The velocity needs a table of times and RMS velocities.';
  if (!v.vrms.every((x) => x >= 1000 && x <= 8000)) return 'The RMS velocities must be 1000 to 8000 m/s.';
  const r = p.ranges;
  if (!Array.isArray(r) || r.length < 1 || r.length > 4) return 'Give one to four angle ranges.';
  for (const x of r) {
    if (!NAME.test(String(x?.name || ''))) return 'Each range needs a short name (letters, numbers, spaces, - and _).';
    if (!(x.from >= 0 && x.to > x.from && x.to <= 60)) return `Range ${x.name}: from must be below to, within 0 to 60 degrees.`;
  }
  if (new Set(r.map((x) => x.name)).size !== r.length) return 'The range names must differ.';
  if (p.min_fold != null && !(Number.isInteger(p.min_fold) && p.min_fold >= 1 && p.min_fold <= 1000)) return 'min_fold must be a whole number from 1.';
  return null;
}

/**
 * The angle of every bin at every sample, and per range a mask of the
 * bins that fall in it.
 */
export function angleTable({ centres, ns, dtMs, velocity }) {
  const { vrms, vint } = velocityOnGrid(velocity.t_ms, velocity.vrms, ns, dtMs);
  return centres.map((x) => Float32Array.from({ length: ns }, (_, s) => waldenAngle(x, (s * dtMs) / 1000, vrms[s], vint[s])));
}

/** One CDP's partial stacks (fold-weighted means of the bins in each range) and its usable angle. */
export function stackCdp({ traces, fold }, angles, ranges, minFold, ns) {
  const sum = ranges.map(() => new Float64Array(ns));
  const wt = ranges.map(() => new Float64Array(ns));
  let usableSum = 0; let usableN = 0;
  for (let s = 0; s < ns; s++) {
    let widest = -1;
    for (let b = 0; b < traces.length; b++) {
      const f = fold[b];
      const v = traces[b][s];
      if (!f || !(Math.abs(v) < 1e29)) continue;
      const a = angles[b][s];
      if (f >= minFold && a > widest) widest = a;
      for (let k = 0; k < ranges.length; k++) {
        if (a >= ranges[k].from && a < ranges[k].to) { sum[k][s] += v * f; wt[k][s] += f; }
      }
    }
    if (widest >= 0) { usableSum += widest; usableN += 1; }
  }
  const stacks = sum.map((sk, k) => Float64Array.from(sk, (v, s) => (wt[k][s] > 0 ? v / wt[k][s] : NaN)));
  return { stacks, usable: usableN ? usableSum / usableN : NaN };
}

export async function angleStacks(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateAngleParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, workBucket = 'seismic-work' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const minFold = p.min_fold ?? 1;

  const { data: ds, error } = await admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (error) throw new Error(`Could not read the gathers record: ${error.message}`);
  if (!ds || ds.user_id !== uid) throw new JobFailure('not_found', 'The gathers were not found in your account.');
  if (ds.kind !== 'gathers_offset' || ds.status !== 'uploaded') throw new JobFailure('validate_failed', 'Choose a gather store (offset gathers).');
  const prefix = ds.object_key.replace(/\/manifest\.json$/, '');
  const getObject = deps.getObject || (async (key) => {
    const r = await fetchImpl(await sign('GET', ds.bucket, key));
    if (!r.ok) throw new Error(`Could not read ${key} (${r.status}).`);
    return r.arrayBuffer();
  });
  const manifest = JSON.parse(new TextDecoder().decode(await getObject(ds.object_key)));
  const g = manifest.geometry;
  const { ns } = g; const dtMs = g.dt_us / 1000;
  const cb = manifest.blocks.size; const [ni, nj] = manifest.blocks.grid;
  const centres = manifest.bins.centres; const nBins = centres.length;
  const present = new Set((manifest.blocks_present || []).map(([a, b]) => `${a}-${b}`));
  let angles;
  try { angles = angleTable({ centres, ns, dtMs, velocity: p.velocity }); } catch (e) { throw new JobFailure('validate_failed', e.message); }
  const ranges = p.ranges.map((r) => ({ name: r.name, from: r.from, to: r.to }));
  const aff = g.affine ? surveyAffine(g) : null;
  const base = (typeof p.name === 'string' && p.name.trim()) ? p.name.trim().slice(0, 120) : ds.name;

  const ids = ranges.map(() => (deps.newId || (() => webcrypto.randomUUID()))());
  const files = ranges.map((r) => `${base.replace(/[^A-Za-z0-9._-]+/g, '_')}_${r.name.replace(/[^A-Za-z0-9_-]+/g, '_')}.sgy`);
  const keys = ranges.map((r, k) => `stacks/${uid}/${ids[k]}/${files[k]}`);
  const writers = [];
  for (const key of keys) writers.push(await multipartWriter({ sign, bucket: workBucket, key, fetchImpl, partSize: deps.partSize || PART_SIZE, parseUploadId, completeXml }));
  const abortAll = async () => { for (const w of writers) await w.abort(); };
  const usableMap = new Float32Array(g.il.count * g.xl.count).fill(NaN);
  const counts = ranges.map(() => 0);
  try {
    for (let k = 0; k < ranges.length; k++) {
      const r = ranges[k];
      await writers[k].write(textualHeader([
        `Petrolord angle stack ${r.name}: ${r.from} to ${r.to} degrees`, `From gathers ${ds.name}`.slice(0, 76),
        'Walden straight-ray angles from an RMS velocity function', `Velocity table: ${p.velocity.t_ms.length} rows`,
        'Fold-weighted mean of the offset bins in the range', 'Inline byte 189, crossline 193, CDP X 181, CDP Y 185', 'Null samples are written as 0',
      ]));
      await writers[k].write(binaryHeader({ dtUs: g.dt_us, ns }));
    }
    const layout = { cb, nBins, ns };
    for (let bi = 0; bi < ni; bi++) {
      if (ctx.cancelled) { await abortAll(); return null; }
      const row = new Map();
      for (let bj = 0; bj < nj; bj++) {
        if (!present.has(`${bi}-${bj}`)) continue;
        row.set(bj, {
          data: new Float32Array(await getObject(`${prefix}/${gatherBlockKey(bi, bj)}`)),
          fold: new Uint16Array(await getObject(`${prefix}/${foldBlockKey(bi, bj)}`)),
        });
      }
      for (let li = 0; li < cb && bi * cb + li < g.il.count; li++) {
        const il = bi * cb + li;
        for (let xl = 0; xl < g.xl.count; xl++) {
          const blk = row.get(Math.floor(xl / cb));
          if (!blk) continue;
          const gather = readGather(blk.data, blk.fold, layout, li, xl % cb);
          if (!gather.fold.some((f) => f > 0)) continue;
          const { stacks, usable } = stackCdp(gather, angles, ranges, minFold, ns);
          usableMap[il * g.xl.count + xl] = usable;
          const w = aff ? ilxlToWorld(aff, il, xl) : { x: 0, y: 0 };
          for (let k = 0; k < ranges.length; k++) {
            if (!stacks[k].some(Number.isFinite)) continue;
            counts[k] += 1;
            await writers[k].write(traceHeader({ seq: counts[k], il: g.il.min + il * g.il.step, xl: g.xl.min + xl * g.xl.step, x: w.x, y: w.y, ns, dtUs: g.dt_us }));
            await writers[k].write(traceSamples(stacks[k]));
          }
        }
      }
      ctx.progress(0.95 * ((bi + 1) / ni), 'Stacking angle ranges');
    }
    const done = [];
    for (let k = 0; k < ranges.length; k++) {
      if (!counts[k]) throw new JobFailure('validate_failed', `No sample falls in the ${ranges[k].name} range (${ranges[k].from} to ${ranges[k].to} degrees): check the velocity and the range.`);
      done.push(await writers[k].finish());
    }
    // the usable-angle map beside the stacks
    const mapKey = `stacks/${uid}/${ids[0]}/usable_angle.f32`;
    const mr = await fetchImpl(await sign('PUT', workBucket, mapKey), { method: 'PUT', body: new Uint8Array(usableMap.buffer) });
    if (!mr.ok) throw new Error(`Storing the usable-angle map failed (${mr.status}).`);
    const live = Array.from(usableMap).filter(Number.isFinite).sort((a, b) => a - b);
    const q = (f) => (live.length ? live[Math.min(live.length - 1, Math.floor(f * live.length))] : null);
    const stacks = [];
    for (let k = 0; k < ranges.length; k++) {
      const reader = s3RangeReader({ sign, bucket: workBucket, key: keys[k], size: done[k].bytes, fetchImpl });
      const pseudo = { size: done[k].bytes, slice: (a, b) => ({ arrayBuffer: () => reader.read(a, b - a) }) };
      const fingerprint = deps.fingerprint ? await deps.fingerprint(pseudo) : await fileFingerprint(pseudo, (bytes) => webcrypto.subtle.digest('SHA-256', bytes));
      const { error: insErr } = await admin.from('qi_datasets').insert({
        id: ids[k], user_id: uid, name: `${base} ${ranges[k].name}`.slice(0, 200), kind: 'segy_upload', status: 'uploaded', original_filename: files[k],
        bucket: workBucket, object_key: keys[k], bytes: done[k].bytes, part_size: deps.partSize || PART_SIZE, part_count: Math.max(1, done[k].parts),
        uploaded_at: new Date().toISOString(),
        meta: { fingerprint, partial_stack: { name: ranges[k].name, from: ranges[k].from, to: ranges[k].to, min_fold: minFold }, source_gathers: ds.id, velocity: p.velocity },
      });
      if (insErr) throw new Error(`Stack written but registration failed: ${insErr.message}`);
      stacks.push({ name: ranges[k].name, from: ranges[k].from, to: ranges[k].to, dataset_id: ids[k], file_name: files[k], bytes: done[k].bytes, traces: counts[k], fingerprint });
    }
    ctx.progress(1, 'Done');
    return { source_dataset_id: ds.id, stacks, usable_angle: { object_key: mapKey, q10: q(0.1), q50: q(0.5), q90: q(0.9), cdps: live.length } };
  } catch (e) {
    await abortAll();
    throw e;
  }
}

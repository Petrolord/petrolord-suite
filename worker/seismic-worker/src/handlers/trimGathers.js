// trim_gathers: trim statics on every CDP of a gather store (QI programme Q5,
// 2026-10-07; SOW section 7), by the engines' qi/conditioning.js. Each
// gather's traces are shifted onto the gather's own stack in a window around
// an event (capped shifts), and the shifted gathers are written as a new
// gather store beside the first, with the same fold. The result says how
// much flatter the gathers came out (the mean correlation of each trace with
// its gather's stack, before and after) and how far they moved.
//
// params: { dataset_id (gathers_offset), centre_ms, window_ms? (100), max_shift_ms? (8), name? }
import { webcrypto } from 'node:crypto';
import { JobFailure } from '../runJob.js';
import { trimStatics } from '../../../../packages/engines/engines/qi/conditioning.js';
import { readGather, gatherBlockKey, foldBlockKey, blockLayout } from '../../../../packages/engines/engines/qi/gatherStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fin = Number.isFinite;

export function validateTrimParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  if (!(p.centre_ms > 0)) return 'Give the event time the trim works on.';
  if (p.window_ms != null && !(p.window_ms >= 20 && p.window_ms <= 500)) return 'The window must be 20 to 500 ms.';
  if (p.max_shift_ms != null && !(p.max_shift_ms > 0 && p.max_shift_ms <= 40)) return 'The largest shift must be up to 40 ms.';
  return null;
}

export async function trimGathers(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateTrimParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, workBucket = 'seismic-work' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
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
  const m = JSON.parse(new TextDecoder().decode(await getObject(ds.object_key)));
  const g = m.geometry; const ns = g.ns; const dtMs = g.dt_us / 1000;
  const cb = m.blocks.size; const nBins = m.bins.centres.length;
  if (p.centre_ms >= (ns - 1) * dtMs) throw new JobFailure('validate_failed', 'The event time is past the end of the traces.');
  const layout = blockLayout({ cb, nBins, ns });
  const id = (deps.newId || (() => webcrypto.randomUUID()))();
  const outPrefix = `gathers/${uid}/${id}`;
  const stored = []; let bytes = 0;
  const put = async (key, body) => {
    const r = await fetchImpl(await sign('PUT', workBucket, `${outPrefix}/${key}`), { method: 'PUT', body });
    if (!r.ok) throw new Error(`Storing ${key} failed (${r.status}).`);
    stored.push(`${outPrefix}/${key}`); bytes += body.byteLength;
  };
  const cleanup = async () => { for (const k of stored) { try { await fetchImpl(await sign('DELETE', workBucket, k), { method: 'DELETE' }); } catch { /* best effort */ } } };
  const opts = { dtMs, centreMs: p.centre_ms, windowMs: p.window_ms ?? 100, maxShiftMs: p.max_shift_ms ?? 8 };
  let sumBefore = 0; let sumAfter = 0; let cdps = 0; const absShift = [];
  const blocks = m.blocks_present || [];
  try {
    for (let n = 0; n < blocks.length; n++) {
      if (ctx.cancelled) { await cleanup(); return null; }
      const [bi, bj] = blocks[n];
      const data = new Float32Array(await getObject(`${prefix}/${gatherBlockKey(bi, bj)}`));
      const foldBuf = await getObject(`${prefix}/${foldBlockKey(bi, bj)}`);
      const fold = new Uint16Array(foldBuf);
      const out = Float32Array.from(data);
      for (let li = 0; li < cb; li++) {
        for (let lj = 0; lj < cb; lj++) {
          const gather = readGather(data, fold, { cb, nBins, ns }, li, lj);
          const liveBins = gather.fold.map((f, b) => (f > 0 ? b : -1)).filter((b) => b >= 0);
          if (liveBins.length < 3) continue;
          const r = trimStatics({ traces: liveBins.map((b) => gather.traces[b]), ...opts });
          if (!fin(r.corrBefore)) continue;
          sumBefore += r.corrBefore; sumAfter += r.corrAfter; cdps += 1;
          liveBins.forEach((b, k) => {
            absShift.push(Math.abs(r.shiftsMs[k]));
            const at = layout.cdpOffset(li, lj) + b * ns;
            for (let s = 0; s < ns; s++) out[at + s] = fin(r.traces[k][s]) ? r.traces[k][s] : 1e30;
          });
        }
      }
      await put(gatherBlockKey(bi, bj), new Uint8Array(out.buffer));
      await put(foldBlockKey(bi, bj), new Uint8Array(foldBuf));
      ctx.progress(0.95 * ((n + 1) / blocks.length), 'Trimming the gathers');
    }
    absShift.sort((a, b) => a - b);
    const stats = {
      cdps, corrBefore: cdps ? sumBefore / cdps : NaN, corrAfter: cdps ? sumAfter / cdps : NaN,
      shiftMedianMs: absShift.length ? absShift[Math.floor(absShift.length / 2)] : NaN,
      shiftQ90Ms: absShift.length ? absShift[Math.floor(0.9 * absShift.length)] : NaN,
    };
    const name = (typeof p.name === 'string' && p.name.trim()) ? p.name.trim().slice(0, 200) : `${ds.name} trimmed`.slice(0, 200);
    const manifest = { ...m, name, source: { ...(m.source || {}), conditioned_from: ds.id, trim: { centre_ms: opts.centreMs, window_ms: opts.windowMs, max_shift_ms: opts.maxShiftMs } } };
    await put('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
    const { error: insErr } = await admin.from('qi_datasets').insert({
      id, user_id: uid, name, kind: 'gathers_offset', status: 'uploaded', original_filename: ds.original_filename,
      bucket: workBucket, object_key: `${outPrefix}/manifest.json`, bytes, part_size: ds.part_size, part_count: 1,
      uploaded_at: new Date().toISOString(), meta: { ...(ds.meta || {}), source_gathers: ds.id, conditioning: { trim: { centre_ms: opts.centreMs, window_ms: opts.windowMs, max_shift_ms: opts.maxShiftMs }, ...stats } },
    });
    if (insErr) throw new Error(`Trimmed gathers stored but registration failed: ${insErr.message}`);
    ctx.progress(1, 'Done');
    return { dataset_id: id, source_dataset_id: ds.id, ...stats };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

// ingest_gathers: prestack CDP gathers from an uploaded SEG-Y into the
// worker's gather store (QI programme Q3, Milestone C; SOW sections 2 and 3).
// The file is read twice, both times straight through: once for the trace
// headers (inline, crossline, offset, coordinates: the geometry, the offset
// bins and the survey affine), once for the samples, which go into CDP
// blocks (engines qi/gatherStore.js) one brick row of inlines at a time.
// The file must be sorted by inline (the usual delivery); any other order is
// refused with what to do. Gathers are taken as NMO-corrected. The store is
// registered as a qi_datasets row (kind gathers_offset) and counts against
// the user's worker storage allowance.
//
// params: { dataset_id, mapping?: {ilByte, xlByte, offsetByte, xByte, yByte, scalarByte},
//   bin_width_m? (default 50), cb? (default 4), name? }
// One brick row of blocks is held while it fills: cb x crosslines x bins x
// samples float32. A row over the worker's memory budget is refused with the
// block size or bin width that would fit.
import { webcrypto } from 'node:crypto';
import { JobFailure } from '../runJob.js';
import { s3RangeReader } from '../s3.js';
import { openSegyDoor } from '../../../../src/pages/apps/Seismolord/lib/segyDoor.js';
import { readFileHeaders } from '../../../../packages/engines/engines/seismolord/segyScan.js';
import { decodeSamples, applyCoordScalar } from '../../../../packages/engines/engines/seismolord/segyDecode.js';
import { makeAffineFit, affineFitAdd, solveAffineFit, affineToManifest } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { blockBuilder, builderBytes, gatherManifest, gatherBlockKey, foldBlockKey, cdpSlot } from '../../../../packages/engines/engines/qi/gatherStore.js';
import { USER_RAW_QUOTA_BYTES } from '../../../../supabase/functions/qi-upload-url/logic.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 32 * 1024 * 1024;
const MAX_BINS = 240;
const GiB = 1024 ** 3;
const DEFAULT_MAP = { ilByte: 189, xlByte: 193, offsetByte: 37, xByte: 181, yByte: 185, scalarByte: 71 };

export function validateGatherParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  if (p.bin_width_m != null && !(p.bin_width_m >= 1 && p.bin_width_m <= 1000)) return 'The offset bin width must be 1 to 1000 m.';
  if (p.cb != null && ![4, 8, 16].includes(p.cb)) return 'The block size must be 4, 8 or 16 CDPs.';
  for (const [k, v] of Object.entries(p.mapping || {})) if (!(Number.isInteger(v) && v >= 1 && v <= 237)) return `Header byte ${k} must be 1 to 237.`;
  return null;
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/** Walk the file's traces in big sequential chunks: fn(view, offsetInView, index). */
async function eachTrace(reader, h, fn, onChunk) {
  const per = Math.max(1, Math.floor(CHUNK / h.traceBytes));
  for (let k0 = 0; k0 < h.totalTraces; k0 += per) {
    const n = Math.min(per, h.totalTraces - k0);
    const buf = await reader.read(3600 + k0 * h.traceBytes, n * h.traceBytes);
    const dv = new DataView(buf);
    for (let k = 0; k < n; k++) await fn(dv, k * h.traceBytes, k0 + k);
    if (onChunk && (await onChunk(k0 + n)) === false) return false;
  }
  return true;
}

export async function ingestGathers(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateGatherParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, workBucket = 'seismic-work' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const map = { ...DEFAULT_MAP, ...(p.mapping || {}) };
  const binW = p.bin_width_m ?? 50;
  const cb = p.cb ?? 4;

  const { data: ds, error } = await admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (error) throw new Error(`Could not read the file record: ${error.message}`);
  if (!ds || ds.user_id !== uid) throw new JobFailure('not_found', 'The file was not found in your account.');
  if (ds.status !== 'uploaded' || ds.kind !== 'segy_upload') throw new JobFailure('validate_failed', 'Choose an uploaded SEG-Y file.');

  const raw = deps.makeReader ? deps.makeReader(ds) : s3RangeReader({ sign, bucket: ds.bucket, key: ds.object_key, size: Number(ds.bytes), fetchImpl });
  let reader;
  try { ({ reader } = await openSegyDoor(raw)); } catch (e) { throw new JobFailure('not_segy', e.message); }
  const h = await readFileHeaders(reader);
  const { ns, dtUs, formatCode } = h;

  // pass 1: headers
  ctx.progress(0.01, 'Reading the trace headers');
  const il = new Int32Array(h.totalTraces); const xl = new Int32Array(h.totalTraces); const off = new Float32Array(h.totalTraces);
  const fit = makeAffineFit();
  const fitEvery = Math.max(1, Math.floor(h.totalTraces / 5000)); // about 5,000 traces for the survey affine
  let unsortedAt = -1;
  await eachTrace(reader, h, (dv, at, k) => {
    il[k] = dv.getInt32(at + map.ilByte - 1, false);
    xl[k] = dv.getInt32(at + map.xlByte - 1, false);
    off[k] = Math.abs(dv.getInt32(at + map.offsetByte - 1, false));
    if (k > 0 && unsortedAt < 0 && il[k] < il[k - 1]) unsortedAt = k;
    if (k % fitEvery === 0) {
      const sc = dv.getInt16(at + map.scalarByte - 1, false);
      affineFitAdd(fit, il[k], xl[k], applyCoordScalar(dv.getInt32(at + map.xByte - 1, false), sc), applyCoordScalar(dv.getInt32(at + map.yByte - 1, false), sc));
    }
  }, (done) => { ctx.progress(0.01 + 0.24 * (done / h.totalTraces), 'Reading the trace headers'); return !ctx.cancelled; });
  if (ctx.cancelled) return null;
  if (unsortedAt >= 0) throw new JobFailure('not_sorted', `The file is not sorted by inline (trace ${unsortedAt + 1} goes back to inline ${il[unsortedAt]}). Sort it by inline, then crossline, and upload it again.`);
  let ilMin = Infinity; let ilMax = -Infinity; let xlMin = Infinity; let xlMax = -Infinity; let maxOff = 0;
  for (let k = 0; k < il.length; k++) {
    if (il[k] < ilMin) ilMin = il[k]; if (il[k] > ilMax) ilMax = il[k];
    if (xl[k] < xlMin) xlMin = xl[k]; if (xl[k] > xlMax) xlMax = xl[k];
    if (off[k] > maxOff) maxOff = off[k];
  }
  let ilStep = 0; let xlStep = 0;
  for (let k = 1; k < il.length && (ilStep !== 1 || xlStep !== 1); k++) {
    if (il[k] !== il[k - 1]) ilStep = gcd(ilStep, Math.abs(il[k] - il[k - 1]));
    if (xl[k] !== xl[k - 1]) xlStep = gcd(xlStep, Math.abs(xl[k] - xl[k - 1]));
  }
  ilStep = ilStep || 1; xlStep = xlStep || 1;
  const nIl = (ilMax - ilMin) / ilStep + 1; const nXl = (xlMax - xlMin) / xlStep + 1;
  const nBins = Math.floor(maxOff / binW) + 1;
  if (nBins > MAX_BINS) throw new JobFailure('validate_failed', `Offsets up to ${maxOff} m give ${nBins} bins of ${binW} m; use a wider bin (at most ${MAX_BINS} bins).`);
  if (nIl * nXl > h.totalTraces) {
    // fine: fold below one per CDP somewhere; the store keeps empty CDPs null
  }
  const rowBytes = builderBytes({ cb, nBins, ns }) * Math.ceil(nXl / cb) * 2; // the builders and the finished copies
  const budget = deps.memoryBudgetBytes || 6 * GiB;
  if (rowBytes > budget) throw new JobFailure('too_large', `One row of gather blocks needs ${(rowBytes / GiB).toFixed(1)} GiB of memory, over the worker's ${(budget / GiB).toFixed(1)} GiB. Use a block size of ${cb === 4 ? 'the minimum, 4,' : 4} and a wider offset bin.`);
  const blockBytes = cb * cb * nBins * ns * 4 + cb * cb * nBins * 2;
  const blocksMax = Math.ceil(nIl / cb) * Math.ceil(nXl / cb);
  const { data: used, error: qErr } = await admin.rpc('qi_user_storage_bytes', { p_user_id: uid });
  if (qErr) throw new Error(`Could not check your storage allowance: ${qErr.message}`);
  const room = USER_RAW_QUOTA_BYTES - Number(used || 0);
  const upper = Math.min(blockBytes * blocksMax, (h.totalTraces * ns * 4 + h.totalTraces * 2) * 2);
  if (upper > room) throw new JobFailure('over_quota', `The gather store needs up to ${(upper / GiB).toFixed(1)} GiB and you have ${(room / GiB).toFixed(1)} GiB of your worker storage allowance left.`);

  // pass 2: samples into CDP blocks, one brick row at a time
  const id = (deps.newId || (() => webcrypto.randomUUID()))();
  const prefix = `gathers/${uid}/${id}`;
  const stored = [];
  let bytes = 0;
  const put = async (key, body) => {
    const r = await fetchImpl(await sign('PUT', workBucket, `${prefix}/${key}`), { method: 'PUT', body });
    if (!r.ok) throw new Error(`Storing ${key} failed (${r.status}).`);
    stored.push(`${prefix}/${key}`); bytes += body.byteLength;
  };
  const cleanup = async () => {
    for (const k of stored) { try { await fetchImpl(await sign('DELETE', workBucket, k), { method: 'DELETE' }); } catch { /* best effort */ } }
  };
  const blocks = [];
  let row = -1; let builders = new Map();
  const flushRow = async () => {
    for (const [bj, b] of builders) {
      const { data, fold } = b.finish();
      await put(gatherBlockKey(row, bj), new Uint8Array(data.buffer));
      await put(foldBlockKey(row, bj), new Uint8Array(fold.buffer));
      blocks.push([row, bj]);
    }
    builders = new Map();
  };
  const samples = new Float32Array(ns);
  try {
    const ok = await eachTrace(reader, h, async (dv, at, k) => {
      const ii = (il[k] - ilMin) / ilStep; const jj = (xl[k] - xlMin) / xlStep;
      const s = cdpSlot(ii, jj, cb);
      if (s.bi !== row) { if (row >= 0) await flushRow(); row = s.bi; }
      if (!builders.has(s.bj)) builders.set(s.bj, blockBuilder({ cb, nBins, ns }));
      decodeSamples(dv, at + 240, ns, formatCode, samples);
      builders.get(s.bj).add(s.li, s.lj, Math.floor(off[k] / binW), samples);
    }, (done) => { ctx.progress(0.25 + 0.7 * (done / h.totalTraces), `Building gathers, ${done} of ${h.totalTraces} traces`); return !ctx.cancelled; });
    if (!ok) { await cleanup(); return null; }
    if (row >= 0) await flushRow();
    const g = {
      name: (typeof p.name === 'string' && p.name.trim()) ? p.name.trim().slice(0, 200) : `${ds.name} gathers`,
      il: { min: ilMin, max: ilMax, step: ilStep, count: nIl },
      xl: { min: xlMin, max: xlMax, step: xlStep, count: nXl },
    };
    const aff = solveAffineFit(fit, { ilMin, ilStep, xlMin, xlStep });
    const manifest = {
      ...gatherManifest({
        name: g.name, il: g.il, xl: g.xl, ns, dtUs, cb,
        bins: { kind: 'offset', width: binW, centres: Array.from({ length: nBins }, (_, b) => (b + 0.5) * binW) },
        affine: aff ? affineToManifest(aff) : null,
        source: { dataset_id: ds.id, file: ds.original_filename, mapping: map, nmo_corrected: true },
      }),
      blocks_present: blocks,
      traces: h.totalTraces,
    };
    const mBytes = new TextEncoder().encode(JSON.stringify(manifest));
    await put('manifest.json', mBytes);
    const { error: insErr } = await admin.from('qi_datasets').insert({
      id, user_id: uid, name: g.name, kind: 'gathers_offset', status: 'uploaded', original_filename: ds.original_filename,
      bucket: workBucket, object_key: `${prefix}/manifest.json`, bytes, part_size: blockBytes, part_count: 1,
      uploaded_at: new Date().toISOString(), meta: { source_dataset: ds.id, blocks: blocks.length, bins: nBins, bin_width_m: binW, traces: h.totalTraces },
    });
    if (insErr) throw new Error(`Gathers stored but registration failed: ${insErr.message}`);
    ctx.progress(1, 'Done');
    return { dataset_id: id, source_dataset_id: ds.id, geometry: { il: g.il, xl: g.xl, ns, dt_us: dtUs }, bins: { width: binW, count: nBins, max_offset_m: maxOff }, traces: h.totalTraces, blocks: blocks.length, bytes };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

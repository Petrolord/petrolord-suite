// radon_demultiple and fx_denoise: prestack conditioning of a gather store
// (QI round 3, 2026-10-15; the remainder of the QI programme's Q5), by the
// engines' qi/prestackConditioning.js. Each NMO-corrected CDP gather is
// conditioned across its live offset bins and the result written as a new
// gather store beside the first (the trim_gathers pattern), so the input is
// never changed and the Gathers tab can show input, output and what was
// removed side by side. Optionally the removed part (the multiple model, or
// the noise) is written as a third store for QC.
//
//  - radon_demultiple: AVO-compliant high-resolution parabolic Radon; the
//    multiples are the model at q >= cut_ms (residual moveout at the far
//    offset), rebuilt and subtracted.
//  - fx_denoise: f-x deconvolution across the offset bins of each gather.
//
// params (both): { dataset_id (gathers_offset), name?, keep_removed? (false),
//   area?: { il: [from, to], xl: [from, to] } (inline and crossline numbers;
//   CDPs outside are left out of the new store, fold 0) }
// radon_demultiple: { cut_ms? (30), q_min_ms? (-60), q_max_ms? (300), high_res? (3, 0 to 5),
//   avo_terms? (true), window_ms? (300), f_max_hz? (70) }
// fx_denoise: { filter_length? (3, 1 to 8), window_ms? (200), f_lo_hz? (3), f_hi_hz?, damping? (0.01) }
import { webcrypto } from 'node:crypto';
import { JobFailure } from '../runJob.js';
import { projectFrom } from '../project.js';
import { USER_RAW_QUOTA_BYTES } from '../../../../supabase/functions/qi-upload-url/logic.ts';
import { radonDemultiple, fxDecon } from '../../../../packages/engines/engines/qi/prestackConditioning.js';
import { readGather, gatherBlockKey, foldBlockKey, blockLayout, GATHER_NULL } from '../../../../packages/engines/engines/qi/gatherStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fin = Number.isFinite;
const live = (v) => fin(v) && Math.abs(v) < 1e29;
const num = (v) => v === undefined || v === null || (fin(Number(v)) && v !== '');

function areaProblem(a) {
  if (a == null) return null;
  const ok = (r) => Array.isArray(r) && r.length === 2 && r.every((v) => fin(Number(v))) && Number(r[1]) >= Number(r[0]);
  return ok(a.il) && ok(a.xl) ? null : 'The area needs inline and crossline ranges, each from a number to a larger one.';
}

export function validateConditionParams(kind, p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  const a = areaProblem(p.area); if (a) return a;
  for (const k of ['cut_ms', 'q_min_ms', 'q_max_ms', 'high_res', 'window_ms', 'f_max_hz', 'filter_length', 'f_lo_hz', 'f_hi_hz', 'damping']) if (!num(p[k])) return `${k} must be a number.`;
  if (kind === 'radon_demultiple') {
    const cut = p.cut_ms ?? 30; const qMin = p.q_min_ms ?? -60; const qMax = p.q_max_ms ?? 300;
    if (!(qMin < cut && cut < qMax)) return 'The cut must lie between the smallest and largest moveout.';
    if (!(qMin >= -500 && qMax <= 1500)) return 'The moveout range must be within -500 to 1500 ms.';
    if (!(cut > 0)) return 'The cut must be above zero: primaries sit at zero residual moveout after NMO.';
    const hr = p.high_res ?? 3; if (!(Number.isInteger(Number(hr)) && hr >= 0 && hr <= 5)) return 'High resolution takes 0 to 5 iterations.';
    if (p.window_ms != null && !(p.window_ms === 0 || (p.window_ms >= 100 && p.window_ms <= 2000))) return 'The time window must be 100 to 2000 ms (0 for the whole trace).';
  } else {
    const L = p.filter_length ?? 3; if (!(Number.isInteger(Number(L)) && L >= 1 && L <= 8)) return 'The filter length must be 1 to 8 traces.';
    if (p.window_ms != null && !(p.window_ms === 0 || (p.window_ms >= 60 && p.window_ms <= 2000))) return 'The time window must be 60 to 2000 ms (0 for the whole trace).';
    if (p.damping != null && !(p.damping > 0 && p.damping <= 10)) return 'The damping must be above 0 and at most 10.';
  }
  return null;
}

const KIND_NAME = { radon_demultiple: 'demultipled', fx_denoise: 'f-x denoised' };
const REMOVED_NAME = { radon_demultiple: 'multiple model', fx_denoise: 'removed noise' };

function settingsFor(kind, p) {
  return kind === 'radon_demultiple'
    ? { cut_ms: Number(p.cut_ms ?? 30), q_min_ms: Number(p.q_min_ms ?? -60), q_max_ms: Number(p.q_max_ms ?? 300), high_res: Number(p.high_res ?? 3), avo_terms: p.avo_terms !== false, window_ms: Number(p.window_ms ?? 300), f_max_hz: Number(p.f_max_hz ?? 70) }
    : { filter_length: Number(p.filter_length ?? 3), window_ms: Number(p.window_ms ?? 200), f_lo_hz: Number(p.f_lo_hz ?? 3), ...(p.f_hi_hz != null ? { f_hi_hz: Number(p.f_hi_hz) } : {}), damping: Number(p.damping ?? 0.01) };
}

function conditionOne(kind, s, traces, offsets, dtMs) {
  if (kind === 'radon_demultiple') {
    return radonDemultiple({ traces, offsets, dtMs, cutMs: s.cut_ms, qMinMs: s.q_min_ms, qMaxMs: s.q_max_ms, highRes: s.high_res, avo: s.avo_terms, windowMs: s.window_ms, fMaxHz: s.f_max_hz }).traces;
  }
  return fxDecon({ traces, dtMs, filterLength: s.filter_length, damping: s.damping, fLoHz: s.f_lo_hz, fHiHz: s.f_hi_hz ?? null, timeWindowMs: s.window_ms }).traces;
}

export async function conditionGathers(kind, ctx, deps) {
  const p = ctx.params || {};
  const problem = validateConditionParams(kind, p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, workBucket = 'seismic-work' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const now = deps.now || Date.now;
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
  if (m.bins?.kind && m.bins.kind !== 'offset') throw new JobFailure('validate_failed', 'Conditioning works on offset gathers.');
  const g = m.geometry; const ns = g.ns; const dtMs = g.dt_us / 1000;
  const cb = m.blocks.size; const offsets = m.bins.centres; const nBins = offsets.length;
  if (nBins < 4) throw new JobFailure('validate_failed', 'The gathers need at least four offset bins.');
  const s = settingsFor(kind, p);
  const layout = blockLayout({ cb, nBins, ns });
  // the area as lattice index ranges
  const idx = (ax, v) => Math.round((Number(v) - ax.min) / (ax.step || 1));
  const area = p.area ? { il: [Math.max(0, idx(g.il, p.area.il[0])), Math.min(g.il.count - 1, idx(g.il, p.area.il[1]))], xl: [Math.max(0, idx(g.xl, p.area.xl[0])), Math.min(g.xl.count - 1, idx(g.xl, p.area.xl[1]))] } : null;
  if (area && (area.il[0] > area.il[1] || area.xl[0] > area.xl[1])) throw new JobFailure('validate_failed', 'The area lies outside the gathers.');
  const inArea = (il, xl) => !area || (il >= area.il[0] && il <= area.il[1] && xl >= area.xl[0] && xl <= area.xl[1]);
  const blocks = (m.blocks_present || []).filter(([bi, bj]) => !area || (bi * cb <= area.il[1] && (bi + 1) * cb - 1 >= area.il[0] && bj * cb <= area.xl[1] && (bj + 1) * cb - 1 >= area.xl[0]));
  if (!blocks.length) throw new JobFailure('validate_failed', 'No gathers in the area.');
  const keep = p.keep_removed === true;
  const need = (keep ? 2 : 1) * blocks.length * (layout.blockFloats * 4 + cb * cb * nBins * 2);
  // the worker storage allowance, as ingest_gathers counts it
  const { data: used, error: qErr } = await admin.rpc('qi_user_storage_bytes', { p_user_id: uid });
  if (qErr) throw new Error(`Could not check your storage allowance: ${qErr.message}`);
  const room = USER_RAW_QUOTA_BYTES - Number(used || 0);
  if (need > room) throw new JobFailure('over_quota', `The conditioned gathers need ${(need / 1024 ** 3).toFixed(1)} GiB and you have ${(room / 1024 ** 3).toFixed(1)} GiB of your worker storage allowance left. Remove a file from the Prestack tab, or condition an area.`);
  const newId = deps.newId || (() => webcrypto.randomUUID());
  const id = newId(); const rid = keep ? newId() : null;
  const outPrefix = `gathers/${uid}/${id}`; const remPrefix = keep ? `gathers/${uid}/${rid}` : null;
  const stored = []; let bytes = 0; let remBytes = 0;
  const put = async (pre, key, body) => {
    const r = await fetchImpl(await sign('PUT', workBucket, `${pre}/${key}`), { method: 'PUT', body });
    if (!r.ok) throw new Error(`Storing ${key} failed (${r.status}).`);
    stored.push(`${pre}/${key}`);
    if (pre === outPrefix) bytes += body.byteLength; else remBytes += body.byteLength;
  };
  const cleanup = async () => { for (const k of stored) { try { await fetchImpl(await sign('DELETE', workBucket, k), { method: 'DELETE' }); } catch { /* best effort */ } } };
  // energy in and out, overall and in four time bands
  const bands = 4; const eIn = new Float64Array(bands); const eOut = new Float64Array(bands);
  let cdps = 0; let failed = 0; const started = now();
  try {
    for (let n = 0; n < blocks.length; n++) {
      if (ctx.cancelled) { await cleanup(); return null; }
      const [bi, bj] = blocks[n];
      const data = new Float32Array(await getObject(`${prefix}/${gatherBlockKey(bi, bj)}`));
      const fold = new Uint16Array(await getObject(`${prefix}/${foldBlockKey(bi, bj)}`));
      const out = Float32Array.from(data); const outFold = Uint16Array.from(fold);
      const rem = keep ? new Float32Array(layout.blockFloats).fill(GATHER_NULL) : null;
      for (let li = 0; li < cb; li++) {
        for (let lj = 0; lj < cb; lj++) {
          const il = bi * cb + li; const xl = bj * cb + lj;
          const gat = readGather(data, fold, { cb, nBins, ns }, li, lj);
          if (!inArea(il, xl)) {
            // outside the area: left out of the new store
            const at = layout.cdpOffset(li, lj);
            out.fill(GATHER_NULL, at, at + nBins * ns);
            outFold.fill(0, (li * cb + lj) * nBins, (li * cb + lj + 1) * nBins);
            continue;
          }
          const traces = gat.traces.map((t, b) => (gat.fold[b] > 0 ? Float64Array.from(t, (v) => (live(v) ? v : NaN)) : null));
          if (traces.filter(Boolean).length < 4) continue;
          let res;
          try { res = conditionOne(kind, s, traces, offsets, dtMs); } catch { failed += 1; continue; }
          cdps += 1;
          for (let b = 0; b < nBins; b++) {
            if (!traces[b]) continue;
            const at = layout.cdpOffset(li, lj) + b * ns;
            for (let i = 0; i < ns; i++) {
              const v = traces[b][i]; const r = res[b][i];
              if (!live(v) || !fin(r)) continue;
              const band = Math.min(bands - 1, Math.floor((i * bands) / ns));
              eIn[band] += v * v; eOut[band] += r * r;
              out[at + i] = r;
              if (rem) rem[at + i] = v - r;
            }
          }
          if (ctx.cancelled) { await cleanup(); return null; }
        }
      }
      await put(outPrefix, gatherBlockKey(bi, bj), new Uint8Array(out.buffer));
      await put(outPrefix, foldBlockKey(bi, bj), new Uint8Array(outFold.buffer));
      if (rem) { await put(remPrefix, gatherBlockKey(bi, bj), new Uint8Array(rem.buffer)); await put(remPrefix, foldBlockKey(bi, bj), new Uint8Array(outFold.buffer)); }
      ctx.progress(0.95 * ((n + 1) / blocks.length), `${kind === 'radon_demultiple' ? 'Removing multiples' : 'Attenuating noise'}: ${cdps} CDPs`);
    }
    if (!cdps) throw new JobFailure('compute_failed', 'No gather had four live offset bins to condition.');
    const db = (a, b) => (a > 0 && b > 0 ? 10 * Math.log10(a / b) : null);
    const sumIn = eIn.reduce((x, y) => x + y, 0); const sumOut = eOut.reduce((x, y) => x + y, 0);
    const stats = {
      cdps, failed_cdps: failed,
      removed_share: sumIn > 0 ? 1 - sumOut / sumIn : 0,
      // energy taken away per quarter of the trace length: where the multiples (or noise) were
      bands: Array.from({ length: bands }, (_, k) => ({ from_ms: Math.round((k * ns * dtMs) / bands), to_ms: Math.round(((k + 1) * ns * dtMs) / bands), removed_db: db(eIn[k], eOut[k]), removed_share: eIn[k] > 0 ? 1 - eOut[k] / eIn[k] : 0 })),
      seconds_per_cdp: (now() - started) / 1000 / cdps,
    };
    const conditioning = { [kind === 'radon_demultiple' ? 'radon' : 'fx']: s, ...(area ? { area: p.area } : {}) };
    const blocksPresent = blocks.map(([bi, bj]) => [bi, bj]);
    const name = (typeof p.name === 'string' && p.name.trim()) ? p.name.trim().slice(0, 200) : `${ds.name} ${KIND_NAME[kind]}`.slice(0, 200);
    const manifest = { ...m, name, blocks_present: blocksPresent, source: { ...(m.source || {}), conditioned_from: ds.id, ...conditioning } };
    await put(outPrefix, 'manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
    const baseRow = { user_id: uid, ...projectFrom(ds, ctx.job), kind: 'gathers_offset', status: 'uploaded', original_filename: ds.original_filename, bucket: workBucket, part_size: ds.part_size, part_count: 1, uploaded_at: new Date().toISOString() };
    const meta = { ...(ds.meta || {}), source_gathers: ds.id, conditioning: { ...(ds.meta?.conditioning || {}), ...conditioning, [`${kind}_stats`]: stats } };
    const { error: insErr } = await admin.from('qi_datasets').insert({ id, name, object_key: `${outPrefix}/manifest.json`, bytes, meta, ...baseRow });
    if (insErr) throw new Error(`Conditioned gathers stored but registration failed: ${insErr.message}`);
    let removedId = null;
    if (keep) {
      const rname = `${ds.name} ${REMOVED_NAME[kind]}`.slice(0, 200);
      await put(remPrefix, 'manifest.json', new TextEncoder().encode(JSON.stringify({ ...manifest, name: rname, source: { ...manifest.source, removed_part_of: id } })));
      const { error: e2 } = await admin.from('qi_datasets').insert({ id: rid, name: rname, object_key: `${remPrefix}/manifest.json`, bytes: remBytes, meta: { ...meta, removed_part_of: id }, ...baseRow });
      if (e2) throw new Error(`The removed part was stored but registration failed: ${e2.message}`);
      removedId = rid;
    }
    ctx.progress(1, 'Done');
    return { dataset_id: id, source_dataset_id: ds.id, ...(removedId ? { removed_dataset_id: removedId } : {}), settings: s, ...(area ? { area: p.area } : {}), ...stats };
  } catch (e) {
    await cleanup();
    try { await admin.from('qi_datasets').delete?.().eq('id', id); } catch { /* best effort */ }
    throw e;
  }
}

export const radonDemultipleJob = (ctx, deps) => conditionGathers('radon_demultiple', ctx, deps);
export const fxDenoiseJob = (ctx, deps) => conditionGathers('fx_denoise', ctx, deps);

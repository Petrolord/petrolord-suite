// 2D line persistence + pipelines (W5): registry rows in seismic_lines,
// strip store / nav.bin / v3 manifest under {user_id}/{line_id}/ in the
// seismic bucket, per-line picks grouped across lines by horizon NAME,
// and the mistie workflow. The ingestService structure one dimension
// down; navigation converts to the Project CRS at import (point
// transforms — a polyline has no lattice, so there is no affine
// subtlety, and the native declaration is preserved on the row).

import { supabase } from '@/lib/customSupabaseClient';
import { SEISMIC_BUCKET, STORAGE_QUOTA_BYTES } from './seismicStorage';
import { myOrgId } from './surfacesService';
import { newLineWorker } from './lineWorkerFactory';
import {
  readNavBlob, writeNavBlob, buildLineManifest, geomFromLineManifest,
  assembleLineSection, stripRelPath, DEFAULT_STRIP_SIZE,
} from '../engine/line2d';
import { assertManifestSupported } from '../engine/manifest';
import { getTransformer } from '@/lib/crs';
import { getProjectCrs } from '@/lib/crs/settingsService';
import { normalizeTag, isTransformableTag, UNKNOWN } from '@/lib/crs/tags';
import { BrickCache, storageBrickFetcher, ABORTED } from '../engine/brickCache';
import { persistentBrickFetcher } from './brickStore';
import { NULL_VALUE } from '../engine/manifest';

export { ABORTED };

const NULL_F32 = Math.fround(NULL_VALUE);
const lineDir = (userId, lineId) => `${userId}/${lineId}`;

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in.');
  return user;
}

// ---- registry -------------------------------------------------------------

export async function listLines() {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('seismic_lines').select('*').order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load 2D lines: ${error.message}`);
  return (data || []).map((l) => ({ ...l, is_own: !!user && l.user_id === user.id }));
}

export async function setLineShared(line, shared) {
  let organizationId = null;
  if (shared) {
    organizationId = await myOrgId();
    if (!organizationId) throw new Error('You belong to no organization — nothing to share with.');
  }
  const { data, error } = await supabase.from('seismic_lines')
    .update({ organization_id: organizationId })
    .eq('id', line.id)
    .select().single();
  if (error) throw new Error(`Could not update sharing: ${error.message}`);
  return data;
}

export async function deleteLine(line) {
  const dir = line.storage_path;
  const paths = [`${dir}/manifest.json`, `${dir}/nav.bin`];
  for (const sub of ['strips', 'picks']) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
        .list(`${dir}/${sub}`, { limit: 1000, offset });
      if (error) break;
      (data || []).forEach((o) => paths.push(`${dir}/${sub}/${o.name}`));
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
  }
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await supabase.storage.from(SEISMIC_BUCKET)
      .remove(paths.slice(i, i + 1000));
    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Could not delete line data: ${error.message}`);
    }
  }
  const { error } = await supabase.from('seismic_lines').delete().eq('id', line.id);
  if (error) throw new Error(`Could not delete line record: ${error.message}`);
}

/** Display-side mistie static (stored samples untouched). */
export async function setLineBulkShift(line, bulkShiftMs) {
  const { data, error } = await supabase.from('seismic_lines')
    .update({ bulk_shift_ms: bulkShiftMs, updated_at: new Date().toISOString() })
    .eq('id', line.id)
    .select().single();
  if (error) throw new Error(`Could not store the shift: ${error.message}`);
  return data;
}

// ---- ingest ---------------------------------------------------------------

async function assertQuota(estimateBytes) {
  const { data, error } = await supabase.from('seismic_lines').select('survey_meta');
  if (error) return;
  const { data: vols } = await supabase.from('seismic_volumes').select('survey_meta');
  const used = [...(data || []), ...(vols || [])].reduce(
    (sum, r) => sum + (Number(r.survey_meta?.storage_bytes) || 0), 0);
  if (used + estimateBytes > STORAGE_QUOTA_BYTES) {
    const gib = (b) => (b / 1024 ** 3).toFixed(2);
    throw new Error(
      `Storage quota exceeded: ${gib(used)} GiB used + ~${gib(estimateBytes)} GiB new `
      + `> ${gib(STORAGE_QUOTA_BYTES)} GiB. Delete old data first.`);
  }
}

async function uploadObject(path, body, contentType) {
  const { error } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
}

/** Convert navigation points to the Project CRS when the declaration is
 *  transformable and differs; the row keeps the native declaration. */
function convertNav(navBlob, nativeTag, projectTag, customDefs) {
  const from = normalizeTag(nativeTag);
  const to = normalizeTag(projectTag);
  if (from === to || !isTransformableTag(from) || !isTransformableTag(to)) {
    return { navBlob, storeTag: from === UNKNOWN ? null : from, converted: false };
  }
  const nav = readNavBlob(navBlob);
  const t = getTransformer(from, to, customDefs);
  for (let i = 0; i < nav.x.length; i++) {
    const p = t.forward(nav.x[i], nav.y[i]);
    nav.x[i] = p.x;
    nav.y[i] = p.y;
  }
  return { navBlob: writeNavBlob(nav), storeTag: to, converted: true };
}

/**
 * Full 2D import: register row -> worker scan+transcode -> strip uploads
 * under ack backpressure -> nav.bin + manifest -> ready.
 * No resume in v1 (lines are small; a failed import deletes and retries).
 */
export async function ingestLine2d({
  file, mapping, name, nativeCrs, onProgress, cancelToken = {},
  workerFactory = newLineWorker,
}) {
  const user = await currentUser();
  const lineId = crypto.randomUUID();
  const dir = lineDir(user.id, lineId);
  const displayName = name || file.name;
  await assertQuota(file.size);

  const project = await getProjectCrs();
  const nativeTag = normalizeTag(nativeCrs);

  const { data: row, error: regError } = await supabase.from('seismic_lines')
    .insert({
      id: lineId,
      user_id: user.id,
      name: displayName,
      storage_path: dir,
      status: 'ingesting',
      crs: nativeTag === UNKNOWN ? null : nativeTag,
      survey_meta: { ingest: { file_name: file.name, file_size: file.size, native_crs: nativeTag } },
    })
    .select().single();
  if (regError) throw new Error(`Could not register line: ${regError.message}`);

  const worker = workerFactory();
  const id = 1;
  const inflight = new Set();
  let uploaded = 0;
  let failed = null;

  let finish;
  try {
    finish = await new Promise((resolve, reject) => {
      const fail = (err) => {
        failed = failed || err;
        worker.postMessage({ type: 'cancel', id });
        reject(err);
      };
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.id !== id) return;
        try {
          if (msg.type === 'progress') {
            if (onProgress) onProgress(msg);
            if (cancelToken.cancelled) worker.postMessage({ type: 'cancel', id });
          } else if (msg.type === 'strip') {
            const task = (async () => {
              await uploadObject(`${dir}/${stripRelPath(msg.i, msg.k)}`,
                new Blob([msg.buffer], { type: 'application/octet-stream' }),
                'application/octet-stream');
              uploaded += 1;
              if (onProgress) onProgress({ phase: 'upload', done: uploaded, total: null });
            })();
            inflight.add(task);
            task.then(
              () => {
                if (!failed && !cancelToken.cancelled) worker.postMessage({ type: 'strip:ack', id });
              },
              fail,
            ).finally(() => inflight.delete(task));
          } else if (msg.type === 'ingest2d:done') {
            Promise.all([...inflight]).then(() => {
              if (!failed) resolve(msg);
            }, fail);
          } else if (msg.type === 'error') {
            fail(new Error(msg.message));
          }
        } catch (err) {
          fail(err);
        }
      };
      worker.onerror = (ev) => fail(new Error(ev.message));
      worker.postMessage({ type: 'ingest2d', id, file, mapping });
    });
  } catch (err) {
    // best-effort cleanup: the registered row stays visible as a failed
    // import the user can delete (no resume in v1)
    await supabase.from('seismic_lines')
      .update({ status: 'failed' }).eq('id', lineId);
    throw err;
  } finally {
    worker.terminate();
  }

  const converted = convertNav(
    finish.navBlob, nativeTag, project.tag, project.customDefs,
  );
  await uploadObject(`${dir}/nav.bin`,
    new Blob([converted.navBlob], { type: 'application/octet-stream' }),
    'application/octet-stream');

  // the manifest wants the scan shape back: rebuild nav-dependent parts
  const nav = readNavBlob(converted.navBlob);
  const scanLike = {
    ...finish.summary,
    nav,
    lengthM: finish.summary.lengthM,
  };
  const manifest = buildLineManifest({
    lineId,
    name: displayName,
    scan: scanLike,
    transcode: finish.transcode,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    crs: converted.storeTag ? { tag: converted.storeTag, native: nativeTag } : null,
  });
  await uploadObject(`${dir}/manifest.json`,
    new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }),
    'application/json');

  const stripBytes = manifest.strip.count * DEFAULT_STRIP_SIZE ** 2 * 4;
  const { data: updated, error: updError } = await supabase.from('seismic_lines')
    .update({
      status: 'ready',
      crs: converted.storeTag,
      survey_meta: {
        ntraces: manifest.geometry.ntraces,
        ns: manifest.geometry.ns,
        dt_us: manifest.geometry.dt_us,
        length_m: manifest.geometry.length_m,
        cdp: manifest.geometry.cdp,
        sp: manifest.geometry.sp,
        bbox: manifest.geometry.bbox,
        stats: manifest.stats,
        storage_bytes: stripBytes + converted.navBlob.byteLength,
        ingest: {
          ...row.survey_meta.ingest,
          // scan warnings persist with the line so they stay reviewable
          // after the import dialog closes
          ...(finish.summary.warnings?.length ? { warnings: finish.summary.warnings } : {}),
        },
        ...(converted.converted ? { crs_converted_from: nativeTag } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
    .select().single();
  if (updError) throw new Error(`Line imported but registration failed: ${updError.message}`);
  return { lineId, manifest, row: updated, warnings: finish.summary.warnings || [] };
}

// ---- loading --------------------------------------------------------------

export async function getLineManifest(line) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(`${line.storage_path}/manifest.json`);
  if (error) throw new Error(`Could not load line manifest: ${error.message}`);
  const manifest = JSON.parse(await data.text());
  assertManifestSupported(manifest);
  return manifest;
}

export async function loadLineNav(line) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(`${line.storage_path}/nav.bin`);
  if (error) throw new Error(`Could not load line navigation: ${error.message}`);
  return readNavBlob(await data.arrayBuffer());
}

/**
 * Shift a pick grid by whole samples, preserving nulls. The pick frame
 * convention: STORED picks are raw (unshifted) line time; display and
 * mistie comparison shift them by the line's bulk-static roll
 * (+Math.round(bulk_shift_ms / dtMs)), and drafts picked on the shifted
 * display unshift (negative) before storage. Keeping storage raw means
 * statics can be re-applied or revised without invalidating picks.
 * @param {Float32Array} picks
 * @param {number} shiftSamples integer; 0 returns the input unchanged
 */
export function shiftPickGrid(picks, shiftSamples) {
  if (!shiftSamples) return picks;
  const out = new Float32Array(picks.length);
  for (let i = 0; i < picks.length; i++) {
    out[i] = picks[i] === NULL_F32 ? NULL_F32 : picks[i] + shiftSamples;
  }
  return out;
}

/**
 * Assemble the full line section through a small strip cache. The
 * bulk-shift static applies HERE as an integer-sample roll; stored
 * strips never change. STORED picks stay in raw (unshifted) line time
 * (see shiftPickGrid).
 */
export async function loadLineSection(line, manifest, {
  supabaseUrl, getToken, applyShift = true,
} = {}) {
  const geom2d = geomFromLineManifest(manifest);
  const cache = new BrickCache(
    persistentBrickFetcher(storageBrickFetcher({ supabaseUrl, getToken })),
    { maxBytes: 64 * 1024 * 1024, maxConcurrent: 8 },
  );
  const section = await assembleLineSection(
    (i, k) => cache.get(`${line.storage_path}/${stripRelPath(i, k)}`),
    geom2d,
  );
  const shiftMs = applyShift ? (line.bulk_shift_ms || 0) : 0;
  const dtMs = geom2d.dtUs / 1000;
  const shiftSamples = Math.round(shiftMs / dtMs);
  if (shiftSamples !== 0) {
    const { data, width, height } = section;
    const rolled = new Float32Array(data.length).fill(NULL_F32);
    for (let t = 0; t < height; t++) {
      for (let k = 0; k < width; k++) {
        const src = k - shiftSamples;          // positive shift = deeper
        if (src >= 0 && src < width) rolled[t * width + k] = data[t * width + src];
      }
    }
    section.data = rolled;
  }
  return { ...section, shiftSamples, dtMs };
}

// ---- picks ----------------------------------------------------------------

const pickPath = (line, pickId) => `${line.storage_path}/picks/${pickId}.f32`;

export async function listLinePicks(lineId) {
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.from('seismic_line_picks')
      .select('*').eq('line_id', lineId).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(`Could not load line picks: ${error.message}`);
  return (data || []).map((p) => ({ ...p, is_own: !!user && p.user_id === user.id }));
}

export async function loadLinePicks(pick) {
  const { data, error } = await supabase.storage.from(SEISMIC_BUCKET)
    .download(pick.storage_path);
  if (error) throw new Error(`Could not load picks: ${error.message}`);
  return new Float32Array(await data.arrayBuffer());
}

export async function saveLinePicks({ line, name, picks, params = null }) {
  const user = await currentUser();
  const pickId = crypto.randomUUID();
  const path = pickPath(line, pickId);
  const { error: upError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(path, new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream' });
  if (upError) throw new Error(`Could not store picks: ${upError.message}`);
  let live = 0;
  for (const v of picks) if (v !== NULL_F32) live += 1;
  const { data, error } = await supabase.from('seismic_line_picks')
    .insert({
      id: pickId,
      user_id: user.id,
      line_id: line.id,
      name,
      storage_path: path,
      interpreter: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
      stats: { picked: live, coverage: live / picks.length },
      ...(params ? { params } : {}),
    })
    .select().single();
  if (error) {
    await supabase.storage.from(SEISMIC_BUCKET).remove([path]);
    throw new Error(`Could not register picks: ${error.message}`);
  }
  return data;
}

export async function updateLinePicks(pick, picks) {
  const { error: upError } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(pick.storage_path,
      new Blob([picks.buffer], { type: 'application/octet-stream' }),
      { contentType: 'application/octet-stream', upsert: true });
  if (upError) throw new Error(`Could not store picks: ${upError.message}`);
  let live = 0;
  for (const v of picks) if (v !== NULL_F32) live += 1;
  const { data, error } = await supabase.from('seismic_line_picks')
    .update({
      stats: { picked: live, coverage: live / picks.length },
      updated_at: new Date().toISOString(),
    })
    .eq('id', pick.id)
    .select().single();
  if (error) throw new Error(`Could not update picks: ${error.message}`);
  return data;
}

export async function deleteLinePicks(pick) {
  const { error: rmError } = await supabase.storage.from(SEISMIC_BUCKET)
    .remove([pick.storage_path]);
  if (rmError) throw new Error(`Could not delete stored picks: ${rmError.message}`);
  const { error } = await supabase.from('seismic_line_picks')
    .delete().eq('id', pick.id);
  if (error) throw new Error(`Could not delete picks: ${error.message}`);
}

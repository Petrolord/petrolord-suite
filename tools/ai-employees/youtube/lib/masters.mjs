// Local video files for an upload, restored from R2 when housekeeping has
// freed them. tools/ops/housekeeping.sh deletes youtube.mp4 30 days after
// r2.json vouches for the bucket copy, but uploads are scheduled further out
// than that, so execute.mjs fetches the file back, checks it against the
// r2.json record (size + MD5) and uploads it. The next housekeeping pass
// frees it again. Nothing here writes to the bucket.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MANIFEST = 'r2.json';

const md5File = (f) => new Promise((resolve, reject) => {
  const h = crypto.createHash('md5');
  fs.createReadStream(f).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});

/** The r2.json record for one file in a video folder, or null. */
export function r2Record(dir, name) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'));
    const f = m?.files?.[name];
    return f?.key && Number.isFinite(f.size) && f.md5 ? f : null;
  } catch { return null; }
}

/**
 * Where a file would come from, without fetching: 'local', 'r2' (r2.json
 * has a record and R2 is configured) or 'missing'. For dry runs.
 */
export function fileSource(dir, name, { r2 } = {}) {
  if (fs.existsSync(path.join(dir, name))) return 'local';
  return r2?.cfg && r2Record(dir, name) ? 'r2' : 'missing';
}

/**
 * Makes sure dir/name exists locally. Returns { file, source } where source
 * is 'local' or 'r2'. Throws a clear error when the file is in neither
 * place or the download does not match r2.json. r2 is { cfg, get } from
 * tools/demo-video/lib/r2.mjs (injected so tests never touch the network).
 */
export async function ensureLocal(dir, name, { r2, log = () => {} } = {}) {
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return { file, source: 'local' };
  const rec = r2Record(dir, name);
  if (!rec) throw new Error(`${file} is missing locally and ${path.join(dir, MANIFEST)} has no R2 record for it`);
  if (!r2?.cfg || !r2.get) throw new Error(`${file} is missing locally and R2 is not configured (/root/.r2.env), so it cannot be restored from ${rec.key}`);
  const part = `${file}.r2part`;
  try {
    log(`  ${name} missing locally: fetching ${rec.key} from R2 (${(rec.size / 1e6).toFixed(1)} MB)`);
    try { await r2.get(r2.cfg, rec.key, part); } catch (e) { throw new Error(`${file} is missing locally and the R2 fetch of ${rec.key} failed: ${e.message}`); }
    const size = fs.statSync(part).size;
    if (size !== rec.size) throw new Error(`${rec.key} from R2 is ${size} bytes but r2.json says ${rec.size}; not uploading it`);
    const md5 = await md5File(part);
    if (md5 !== rec.md5) throw new Error(`${rec.key} from R2 has MD5 ${md5} but r2.json says ${rec.md5}; not uploading it`);
    fs.renameSync(part, file);
    log(`  ${name} restored from R2 and verified (size + MD5)`);
    return { file, source: 'r2' };
  } finally {
    fs.rmSync(part, { force: true });
  }
}

/** Thumbnail names to try: the payload's own, else the folder default (jpg, then png). A Short has none. */
export function thumbnailCandidates(payload = {}) {
  if (payload.format === 'short') return [];
  return payload.thumbnail_file ? [payload.thumbnail_file] : ['thumbnail.jpg', 'thumbnail.png'];
}

/**
 * The thumbnail to set after the upload. Tasks proposed before thumbnails
 * existed (#1176) carry no thumbnail_file, so the folder's thumbnail.jpg or
 * .png is used, local first, then R2. Never throws: a thumbnail problem is a
 * warning, never a failed upload. Returns { file, source, warning }.
 */
export async function resolveThumbnail(dir, payload, { r2, log } = {}) {
  const names = thumbnailCandidates(payload);
  for (const name of names) if (fs.existsSync(path.join(dir, name))) return { file: path.join(dir, name), source: 'local', warning: null };
  const errors = [];
  for (const name of names) {
    if (!r2Record(dir, name)) continue;
    try { return { ...(await ensureLocal(dir, name, { r2, log })), warning: null }; } catch (e) { errors.push(e.message); }
  }
  if (errors.length) return { file: null, source: 'missing', warning: `thumbnail: ${errors.join('; ')}` };
  // an explicit thumbnail_file that has vanished is worth a warning; a folder without one is not
  return { file: null, source: 'missing', warning: payload?.thumbnail_file ? `thumbnail: ${path.join(dir, payload.thumbnail_file)} is missing locally and not in R2` : null };
}

/** Dry-run view of the thumbnail: the name and where it would come from. */
export function thumbnailPlan(dir, payload, { r2 } = {}) {
  for (const name of thumbnailCandidates(payload)) {
    const source = fileSource(dir, name, { r2 });
    if (source !== 'missing') return { name, source };
  }
  return { name: null, source: 'missing' };
}

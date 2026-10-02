// The Contour Map Digitizer's map image, kept with the project (Mapping
// U2-020). docs/scope/DigitizerImageStorage-DESIGN-AND-STATUS.md.
//
// One object per project in the PRIVATE bucket `digitizer-images`, at
//   <owner user id>/<project id>/map.<ext>
// read back through a short signed URL (there is no public URL). The path
// rides in the project row's contours.settings.image; no column is added.
//
// The bucket arrives with migration 20261002091000. Staging shares the
// production database, so until the owner applies it the Storage service
// answers "Bucket not found": the store then reports `available: false`
// once and the Digitizer keeps its earlier behaviour (it asks for the image
// on load), saying so.
//
// This file holds the rules (what is accepted, where it goes) and two
// stores with one contract: the Supabase one and an in-memory fake that
// mirrors the bucket's limits and its row-level policies, for the dev
// harness and the tests.

export const DIGITIZER_BUCKET = 'digitizer-images';
export const DIGITIZER_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const DIGITIZER_IMAGE_TYPES = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });
export const SIGNED_URL_SECONDS = 600;

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** PNG, JPEG or WebP by the file's first bytes; null for anything else. The extension is not trusted. */
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** The first bytes of a File or Blob (jsdom and browsers). */
async function headBytes(file, n = 16) {
  const part = typeof file.slice === 'function' ? file.slice(0, n) : file;
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = () => reject(r.error || new Error('The file could not be read.'));
    r.readAsArrayBuffer(part);
  });
}

/**
 * Is this file an image the Digitizer can keep with a project? Checked
 * before any upload, so a refusal carries its reason.
 * @param {File|Blob} file
 * @returns {Promise<{ok: true, type: string, ext: string, size: number} | {ok: false, reason: string}>}
 */
export async function checkDigitizerImage(file) {
  const name = file && file.name ? `"${file.name}"` : 'The file';
  if (!file) return { ok: false, reason: 'No image was given.' };
  const size = Number(file.size);
  if (!Number.isFinite(size) || size === 0) return { ok: false, reason: `${name} is empty (0 bytes). Choose the scanned map image again.` };
  if (size > DIGITIZER_IMAGE_MAX_BYTES) return { ok: false, reason: `${name} is ${mb(size)}; the limit for a map image is ${mb(DIGITIZER_IMAGE_MAX_BYTES)}. Save the scan at a lower resolution or as a JPEG.` };
  let type;
  try { type = sniffImageType(await headBytes(file)); } catch (e) { return { ok: false, reason: `${name} could not be read: ${e.message}` }; }
  if (!type) {
    const tiff = /\.tiff?$/i.test(file.name || '') || /tiff/i.test(file.type || '');
    return {
      ok: false,
      reason: tiff
        ? `${name} is a TIFF, which a browser cannot draw on the digitizing canvas. Convert it to PNG or JPEG.`
        : `${name} is not a PNG, JPEG or WebP image (its content says otherwise, whatever its name). Choose a PNG, JPEG or WebP scan.`,
    };
  }
  return { ok: true, type, ext: DIGITIZER_IMAGE_TYPES[type], size };
}

/** `<uid>/<project id>/map.<ext>`: the one object of a project. */
export function digitizerImagePath(userId, projectId, ext) {
  if (!userId || !projectId || !ext) throw new Error('A stored map image needs its owner, its project and its type.');
  return `${userId}/${projectId}/map.${ext}`;
}
export const digitizerImageFolder = (userId, projectId) => `${userId}/${projectId}`;

const isBucketMissing = (error) => !!error && (/bucket not found/i.test(String(error.message || error.error || '')) || (String(error.statusCode || error.status || '') === '404' && /bucket/i.test(String(error.message || error.error || ''))));

/**
 * The image store over a Storage client with the supabase-js shape
 * (`client.storage.from(bucket)` with upload, createSignedUrl, list,
 * remove). The same code drives the real service and the fake below.
 *
 * @param {{storage: Object, getUserId: () => Promise<?string>, fetchBlob?: (url: string) => Promise<Blob>}} deps
 */
export function makeDigitizerImageStore({ storage, getUserId, fetchBlob = null }) {
  let missing = false; // the bucket is not there (migration not applied): stop trying for the session
  const bucket = () => storage.from(DIGITIZER_BUCKET);
  const getBlob = fetchBlob || (async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the image could not be fetched (${res.status})`);
    return res.blob();
  });

  return {
    /** false once the Storage service has said the bucket does not exist. */
    available() { return !missing; },

    /**
     * Keep `file` as the image of `projectId`, replacing any earlier one.
     * @returns {Promise<{saved: true, image: Object} | {saved: false, reason: string, unavailable?: boolean}>}
     */
    async save(projectId, file, { width = null, height = null } = {}) {
      const checked = await checkDigitizerImage(file);
      if (!checked.ok) return { saved: false, reason: checked.reason };
      if (missing) return { saved: false, unavailable: true, reason: 'The map image is not kept with the project on this server yet (image storage is waiting to be switched on). The project is saved; you will be asked for the image when you load it.' };
      const uid = await getUserId();
      if (!uid) return { saved: false, reason: 'Sign in to keep the map image with the project.' };
      const path = digitizerImagePath(uid, projectId, checked.ext);
      const { error } = await bucket().upload(path, file, { upsert: true, contentType: checked.type, cacheControl: '3600' });
      if (error) {
        if (isBucketMissing(error)) {
          missing = true;
          return { saved: false, unavailable: true, reason: 'The map image is not kept with the project on this server yet (image storage is waiting to be switched on). The project is saved; you will be asked for the image when you load it.' };
        }
        return { saved: false, reason: `The map image was not saved: ${error.message || 'the storage service refused it'}.` };
      }
      // the new object is in; anything else under the project's folder (an
      // earlier image of another type, a leftover) is removed now
      const swept = await this.sweep(projectId, path);
      return {
        saved: true,
        swept,
        image: { name: file.name || `map.${checked.ext}`, width, height, path, bucket: DIGITIZER_BUCKET, size: checked.size, type: checked.type, saved_at: new Date().toISOString() },
      };
    },

    /** Remove every object under the project's folder except `keepPath`. Returns how many went. */
    async sweep(projectId, keepPath = null) {
      if (missing) return 0;
      const uid = await getUserId();
      if (!uid) return 0;
      const folder = digitizerImageFolder(uid, projectId);
      const { data, error } = await bucket().list(folder, { limit: 100 });
      if (error) { if (isBucketMissing(error)) missing = true; return 0; }
      const extra = (data || []).map((o) => `${folder}/${o.name}`).filter((p) => p !== keepPath);
      if (!extra.length) return 0;
      const { error: rmError } = await bucket().remove(extra);
      return rmError ? 0 : extra.length;
    },

    /**
     * The stored image as a blob URL for the canvas, through a signed URL.
     * @param {{path?: string, bucket?: string}} image contours.settings.image
     * @returns {Promise<{ok: true, url: string, blob: Blob} | {ok: false, reason: string, unavailable?: boolean}>}
     */
    async load(image) {
      if (!image || !image.path) return { ok: false, reason: 'This project has no stored image.' };
      if (missing) return { ok: false, unavailable: true, reason: 'Image storage is not switched on for this server yet.' };
      const { data, error } = await bucket().createSignedUrl(image.path, SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) {
        if (isBucketMissing(error)) { missing = true; return { ok: false, unavailable: true, reason: 'Image storage is not switched on for this server yet.' }; }
        return { ok: false, reason: `The stored map image could not be read (${error?.message || 'no link was given'}). It may have been deleted.` };
      }
      try {
        const blob = await getBlob(data.signedUrl);
        return { ok: true, blob, url: URL.createObjectURL(blob) };
      } catch (e) {
        return { ok: false, reason: `The stored map image could not be read: ${e.message}.` };
      }
    },

    /** Remove a project's image (every object under its folder). Throws when the service refuses, so the caller keeps the row. */
    async removeAll(projectId) {
      if (missing) return 0;
      const uid = await getUserId();
      if (!uid) return 0;
      const folder = digitizerImageFolder(uid, projectId);
      const { data, error } = await bucket().list(folder, { limit: 100 });
      if (error) { if (isBucketMissing(error)) { missing = true; return 0; } throw new Error(`Could not read the project's stored image: ${error.message}`); }
      const paths = (data || []).map((o) => `${folder}/${o.name}`);
      if (!paths.length) return 0;
      const { error: rmError } = await bucket().remove(paths);
      if (rmError) throw new Error(`Could not delete the project's stored image: ${rmError.message}`);
      return paths.length;
    },
  };
}

/**
 * An in-memory Storage client that behaves as the `digitizer-images` bucket
 * does once migration 20261002091000 is applied: private, 25 MB, PNG / JPEG
 * / WebP only, and every read and write limited to the caller's own first
 * folder (the four storage.objects policies). `bucket: false` stands in for
 * the server before the migration. For the dev harness and the tests.
 *
 * @param {{bucket?: boolean, userId?: ?string}} [opts] userId null = anon
 */
export function makeFakeDigitizerStorage({ bucket = true, userId = 'user-dev' } = {}) {
  const objects = new Map(); // path -> {blob, type, size, owner}
  const state = { bucket, userId };
  const notFound = { message: 'Bucket not found', statusCode: '404', error: 'Bucket not found' };
  const rls = { message: 'new row violates row-level security policy', statusCode: '403', error: 'Unauthorized' };
  const own = (path) => !!state.userId && String(path).split('/')[0] === state.userId && String(path).split('/').length >= 2;
  const api = {
    async upload(path, file, { upsert = false, contentType = null } = {}) {
      if (!state.bucket) return { data: null, error: notFound };
      if (!own(path)) return { data: null, error: rls };                                  // insert / update policy
      const type = contentType || file.type || '';
      if (!Object.keys(DIGITIZER_IMAGE_TYPES).includes(type)) return { data: null, error: { message: `mime type ${type || 'unknown'} is not supported`, statusCode: '415' } };
      if (Number(file.size) > DIGITIZER_IMAGE_MAX_BYTES) return { data: null, error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } };
      if (objects.has(path) && !upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      objects.set(path, { blob: file, type, size: Number(file.size), owner: state.userId });
      return { data: { path }, error: null };
    },
    async createSignedUrl(path) {
      if (!state.bucket) return { data: null, error: notFound };
      // the read policy: another user's object does not exist for this caller
      if (!own(path) || !objects.has(path)) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
      return { data: { signedUrl: `fake-signed://${DIGITIZER_BUCKET}/${path}?token=${state.userId}` }, error: null };
    },
    async list(folder) {
      if (!state.bucket) return { data: null, error: notFound };
      if (!own(`${folder}/x`)) return { data: [], error: null };                           // the read policy: nothing visible
      const prefix = `${folder}/`;
      return { data: [...objects.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map((p) => ({ name: p.slice(prefix.length) })), error: null };
    },
    async remove(paths) {
      if (!state.bucket) return { data: null, error: notFound };
      const gone = [];
      for (const p of paths || []) if (own(p) && objects.delete(p)) gone.push({ name: p });  // the delete policy: others are untouched
      return { data: gone, error: null };
    },
  };
  return {
    from(id) {
      if (id !== DIGITIZER_BUCKET) throw new Error(`The fake storage holds only the ${DIGITIZER_BUCKET} bucket.`);
      return api;
    },
    /** Test and harness hooks. */
    objects,
    paths: () => [...objects.keys()].sort(),
    as(nextUserId) { state.userId = nextUserId; return this; },
    setBucket(on) { state.bucket = !!on; return this; },
    /** The blob behind a fake signed URL, honouring the read policy (the store's fetchBlob in the harness). */
    async fetchBlob(url) {
      const m = /^fake-signed:\/\/[^/]+\/(.+)\?token=(.*)$/.exec(String(url));
      if (!m || !objects.has(m[1])) throw new Error('the image could not be fetched (404)');
      return objects.get(m[1]).blob;
    },
  };
}

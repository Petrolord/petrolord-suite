// Local brick spool for the two-stage upload (large-survey plan, section
// 5): the conversion worker writes every encoded brick here once, and
// the upload reads them back, so the raw SEG-Y is never read again after
// conversion and an interrupted upload resumes from local disk.
//
// Production storage is the Origin Private File System (OPFS): one
// directory per volume under `seismolord-spool/`, one file per brick
// (the v4 relative path with '/' flattened to '~'), plus small JSON
// records (the manifest and the job state). OPFS survives a reload and
// a browser restart, and needs no permission prompt.
//
// The spool interface (both implementations):
//   put(key, bytes)        store one brick (Uint8Array)
//   get(key)               -> Uint8Array (throws when absent)
//   has(key) / keys()      presence, and every stored key
//   putJson(name, v) / getJson(name) -> v | null
//   bytes()                total bytes stored
//   destroy()              remove the whole spool

const ROOT_DIR = 'seismolord-spool';
const JSON_PREFIX = '@';

export const flattenKey = (key) => key.replace(/\//g, '~');
export const unflattenKey = (name) => name.replace(/~/g, '/');

/** In-memory spool (tests; also a stand-in when OPFS is missing and the
 *  survey is small). */
export function memorySpool() {
  const bricks = new Map();
  const json = new Map();
  return {
    kind: 'memory',
    async put(key, bytes) { bricks.set(key, bytes.slice ? bytes.slice() : new Uint8Array(bytes)); },
    async get(key) {
      const b = bricks.get(key);
      if (!b) throw new Error(`The local copy of ${key} is missing.`);
      return b;
    },
    async has(key) { return bricks.has(key); },
    async keys() { return [...bricks.keys()]; },
    async putJson(name, value) { json.set(name, JSON.stringify(value)); },
    async getJson(name) { return json.has(name) ? JSON.parse(json.get(name)) : null; },
    async bytes() { let s = 0; for (const b of bricks.values()) s += b.byteLength; return s; },
    async destroy() { bricks.clear(); json.clear(); },
  };
}

/** True when this browser has OPFS (navigator.storage.getDirectory). */
export function hasOpfs() {
  return typeof navigator !== 'undefined' && !!navigator.storage
    && typeof navigator.storage.getDirectory === 'function';
}

async function spoolRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function writeFile(dir, name, bytes) {
  const fh = await dir.getFileHandle(name, { create: true });
  // workers: the synchronous access handle is the fast path (and the
  // only writer Safari has); the main thread uses a writable stream
  if (typeof fh.createSyncAccessHandle === 'function' && typeof window === 'undefined') {
    const h = await fh.createSyncAccessHandle();
    try {
      h.truncate(0);
      h.write(bytes, { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    return;
  }
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
}

async function readFile(dir, name) {
  const fh = await dir.getFileHandle(name);
  const file = await fh.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * The OPFS spool of one volume.
 * @param {string} volumeId
 */
export async function opfsSpool(volumeId) {
  const root = await spoolRoot();
  const dir = await root.getDirectoryHandle(volumeId, { create: true });
  const isMissing = (e) => e?.name === 'NotFoundError';
  return {
    kind: 'opfs',
    volumeId,
    put: (key, bytes) => writeFile(dir, flattenKey(key), bytes),
    async get(key) {
      try {
        return await readFile(dir, flattenKey(key));
      } catch (e) {
        if (isMissing(e)) throw new Error(`The local copy of ${key} is missing.`);
        throw e;
      }
    },
    async has(key) {
      try { await dir.getFileHandle(flattenKey(key)); return true; } catch { return false; }
    },
    async keys() {
      const out = [];
      // eslint-disable-next-line no-restricted-syntax
      for await (const name of dir.keys()) if (!name.startsWith(JSON_PREFIX)) out.push(unflattenKey(name));
      return out;
    },
    putJson: (name, value) => writeFile(dir, JSON_PREFIX + name,
      new TextEncoder().encode(JSON.stringify(value))),
    async getJson(name) {
      try {
        return JSON.parse(new TextDecoder().decode(await readFile(dir, JSON_PREFIX + name)));
      } catch { return null; }
    },
    async bytes() {
      let s = 0;
      // eslint-disable-next-line no-restricted-syntax
      for await (const h of dir.values()) if (h.kind === 'file') s += (await h.getFile()).size;
      return s;
    },
    async destroy() {
      await root.removeEntry(volumeId, { recursive: true }).catch(() => {});
    },
  };
}

/** Volume ids that have a spool on this device (resumable uploads). */
export async function listOpfsSpools() {
  if (!hasOpfs()) return [];
  try {
    const root = await spoolRoot();
    const ids = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const [name, h] of root.entries()) if (h.kind === 'directory') ids.push(name);
    return ids;
  } catch {
    return [];
  }
}

/** Remove a volume's spool (volume deleted, or upload finished). */
export async function removeOpfsSpool(volumeId) {
  if (!hasOpfs()) return;
  try {
    const root = await spoolRoot();
    await root.removeEntry(volumeId, { recursive: true });
  } catch { /* nothing to remove */ }
}

/**
 * Free local space for a spool, in bytes (null when the browser cannot
 * say). The spool needs about the SEG-Y size: the float32 copy
 * compressed is about 0.75x, the display copy with its levels about
 * 0.1x.
 */
export async function spoolSpaceAvailable() {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (!Number.isFinite(quota)) return null;
    return Math.max(0, quota - (usage || 0));
  } catch {
    return null;
  }
}

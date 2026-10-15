// Reading a local volume through the existing brick paths
// (docs/scope/LocalWorkspace-DESIGN.md section 3.2). Every viewer, tracker
// and compute path fetches bricks with `(path, signal) => ArrayBuffer` where
// path is "<owner>/<volume>/<key>" in the seismic bucket. withLocalBricks
// wraps such a fetcher: when this computer's workspace holds the volume, the
// key is read from its pack store; anything else goes to the wrapped
// fetcher as before. No cloud request is made for a local volume.

import { defaultRegistry } from './registry';
import { openLocalVolume } from './workspace';

const PATH_RE = /^([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(.+)$/i;

/** {owner, volumeId, key} of a bucket path, or null. */
export function splitBrickPath(path) {
  const m = PATH_RE.exec(String(path || ''));
  return m ? { owner: m[1], volumeId: m[2].toLowerCase(), key: m[3] } : null;
}

const toBuffer = (u8) => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
  ? u8.buffer : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));

/**
 * A cache of open read-only stores per volume, shared by the fetchers of one
 * JS context. A volume not on this computer is remembered for a few seconds
 * so a cloud volume costs one IndexedDB read per few seconds, not per brick.
 */
export function createLocalBrickSource({ registry = defaultRegistry(), open = openLocalVolume, missTtlMs = 5000, now = () => Date.now() } = {}) {
  const stores = new Map(); // volumeId -> Promise<store>
  const misses = new Map(); // volumeId -> time
  async function storeFor(volumeId) {
    if (stores.has(volumeId)) return stores.get(volumeId);
    const miss = misses.get(volumeId);
    if (miss != null && now() - miss < missTtlMs) return null;
    let rec = null;
    try { rec = await registry.getVolume(volumeId); } catch { rec = null; }
    if (!rec || rec.state === 'missing') { misses.set(volumeId, now()); return null; }
    const p = open(volumeId, { registry }).catch((e) => { stores.delete(volumeId); throw e; });
    stores.set(volumeId, p);
    return p;
  }
  return {
    /** The open store when this computer holds the volume, else null. */
    storeFor,
    /** Read one key: Uint8Array, or null when the volume is not local. */
    async read(path) {
      const parts = splitBrickPath(path);
      if (!parts) return null;
      const store = await storeFor(parts.volumeId);
      if (!store) return null;
      if (parts.key === 'manifest.json') {
        const m = await store.getJson('manifest');
        if (!m) throw new Error('The local copy of the manifest is missing.');
        return new TextEncoder().encode(JSON.stringify(m));
      }
      return store.get(parts.key);
    },
    forget(volumeId) { stores.delete(volumeId); misses.delete(volumeId); },
    clear() { stores.clear(); misses.clear(); },
  };
}

let shared = null;
export function defaultLocalBrickSource() {
  if (!shared) shared = createLocalBrickSource();
  return shared;
}
export function setDefaultLocalBrickSource(s) { shared = s; }

/**
 * Wrap a BrickFetcher so local volumes read from this computer.
 * @param {(path: string, signal?: AbortSignal) => Promise<ArrayBuffer>} fetcher
 * @param {Object} [source] createLocalBrickSource()
 */
export function withLocalBricks(fetcher, source = null) {
  return async (path, signal) => {
    const src = source || defaultLocalBrickSource();
    let local = null;
    try {
      local = await src.read(path);
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(`Reading the local volume failed: ${e.message}`);
    }
    if (local) return toBuffer(local);
    return fetcher(path, signal);
  };
}

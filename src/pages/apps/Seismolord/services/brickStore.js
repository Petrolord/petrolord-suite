// Persistent brick cache (W4.4): IndexedDB survives a reload, so the
// second session on a volume scrubs from disk instead of re-paying
// egress. Wraps any BrickFetcher; every IndexedDB failure (quota,
// private mode, corrupted store, aborted transaction) silently falls
// through to the network fetcher: persistence is an optimization, never
// a dependency.
//
// v2 (stability, 2026-09-22): payloads and bookkeeping live in separate
// object stores. v1 kept bytes + last-access inside each payload record,
// so opening the database summed the budget by walking EVERY payload
// with a value cursor (up to the 512 MB budget of ArrayBuffers
// structured-cloned on the main thread), every cache hit rewrote the
// whole payload just to bump its timestamp, and eviction and purge
// walked payloads too. Now:
//   bricks  {path, buf}          payload only, touched by get/put/delete
//   meta    {path, bytes, ts}    small; index 'ts' drives eviction
// Opening sums `meta` only, hits update `meta` only, eviction and purge
// walk `meta` and delete payloads by key. Every transaction has
// onabort/onerror handlers so a failed one can never leave a promise
// pending. Upgrading from v1 drops the old store (it is a cache; the
// bricks refetch on demand).

const DB_NAME = 'seismolord-bricks';
const DB_VERSION = 2;
const BRICKS = 'bricks';
const META = 'meta';
const DEFAULT_BUDGET = 512 * 1024 * 1024;

let dbPromise = null;
let trackedBytes = 0;

/** Promise over one transaction's completion (never left pending). */
const txDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
});

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (ev.oldVersion < 2 && db.objectStoreNames.contains(BRICKS)) {
        db.deleteObjectStore(BRICKS);            // v1 payload+meta records
      }
      if (!db.objectStoreNames.contains(BRICKS)) db.createObjectStore(BRICKS, { keyPath: 'path' });
      if (!db.objectStoreNames.contains(META)) {
        const meta = db.createObjectStore(META, { keyPath: 'path' });
        meta.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // another tab upgrading: step aside and reopen next time
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).then(async (db) => {
    // key + bytes only: the meta records are tiny
    trackedBytes = await new Promise((resolve) => {
      let sum = 0;
      try {
        const tx = db.transaction(META, 'readonly');
        const cur = tx.objectStore(META).openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) { resolve(sum); return; }
          sum += c.value.bytes || 0;
          c.continue();
        };
        cur.onerror = () => resolve(sum);
        tx.onabort = () => resolve(sum);
      } catch {
        resolve(0);
      }
    });
    return db;
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

const idbGet = (db, store, path) => new Promise((resolve, reject) => {
  const tx = db.transaction(store, 'readonly');
  const req = tx.objectStore(store).get(path);
  req.onsuccess = () => resolve(req.result || null);
  req.onerror = () => reject(req.error);
  tx.onabort = () => reject(tx.error || new Error('IndexedDB read aborted'));
});

/** Refresh a hit's last-access time (meta only, never the payload). */
function touch(db, path, bytes) {
  try {
    const tx = db.transaction(META, 'readwrite');
    const store = tx.objectStore(META);
    const req = store.get(path);
    req.onsuccess = () => {
      const m = req.result;
      if (m) store.put({ ...m, ts: Date.now() });
      else {
        // payload without bookkeeping (interrupted write): adopt it
        store.put({ path, bytes, ts: Date.now() });
        trackedBytes += bytes;
      }
    };
    return txDone(tx);
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Store payload + meta in one transaction; resolves the byte delta. */
function idbPut(db, path, buf) {
  const tx = db.transaction([BRICKS, META], 'readwrite');
  const meta = tx.objectStore(META);
  let delta = buf.byteLength;
  const prev = meta.get(path);
  prev.onsuccess = () => {
    if (prev.result) delta -= prev.result.bytes || 0;
    meta.put({ path, bytes: buf.byteLength, ts: Date.now() });
  };
  tx.objectStore(BRICKS).put({ path, buf });
  return txDone(tx).then(() => delta);
}

/** Evict oldest-accessed entries until the tracked total fits. */
async function evict(db, budget) {
  if (trackedBytes <= budget) return;
  const tx = db.transaction([BRICKS, META], 'readwrite');
  const bricks = tx.objectStore(BRICKS);
  const cur = tx.objectStore(META).index('ts').openCursor();
  cur.onsuccess = () => {
    const c = cur.result;
    if (!c || trackedBytes <= budget) return;
    trackedBytes -= c.value.bytes || 0;
    bricks.delete(c.value.path);
    c.delete();
    c.continue();
  };
  await txDone(tx).catch(() => {});
}

/**
 * Wrap a network BrickFetcher with the persistent store.
 * @param {(path: string, signal: AbortSignal) => Promise<ArrayBuffer>} fetcher
 * @param {{budgetBytes?: number}} [opts]
 */
export function persistentBrickFetcher(fetcher, { budgetBytes = DEFAULT_BUDGET } = {}) {
  return async (path, signal) => {
    let db = null;
    try {
      db = await openDb();
      const hit = await idbGet(db, BRICKS, path);
      if (hit?.buf) {
        // refresh last-access lazily; a failure only ages the entry
        touch(db, path, hit.buf.byteLength).catch(() => {});
        return hit.buf;
      }
    } catch { db = null; /* fall through to network */ }

    const buf = await fetcher(path, signal);
    if (db) {
      idbPut(db, path, buf)
        .then((delta) => { trackedBytes += delta; return evict(db, budgetBytes); })
        .catch(() => {});
    }
    return buf;
  };
}

/** Drop a volume's persisted bricks (called on volume delete). */
export async function purgePersistedBricks(volumeId) {
  try {
    const db = await openDb();
    const tx = db.transaction([BRICKS, META], 'readwrite');
    const bricks = tx.objectStore(BRICKS);
    const cur = tx.objectStore(META).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      if (c.value.path.includes(`/${volumeId}/`)) {
        trackedBytes -= c.value.bytes || 0;
        bricks.delete(c.value.path);
        c.delete();
      }
      c.continue();
    };
    await txDone(tx);
  } catch { /* persistence is optional */ }
}

/** Test hooks: the tracked byte total and a fresh module state. */
export const __trackedBytes = () => trackedBytes;
export function __resetBrickStore() {
  dbPromise = null;
  trackedBytes = 0;
}

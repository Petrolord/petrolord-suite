// Persistent brick cache (W4.4): IndexedDB survives a reload, so the
// second session on a volume scrubs from disk instead of re-paying
// egress. Wraps any BrickFetcher; every IndexedDB failure (quota,
// private mode, corrupted store) silently falls through to the network
// fetcher — persistence is an optimization, never a dependency.
//
// Entries store the RAW payload (encoded bytes, pre-decode) keyed by
// storage path with a last-access timestamp; eviction trims oldest-
// accessed entries once the tracked total exceeds the budget. The
// tracked total is recomputed by scan on open (cheap: key + bytes
// only), so a crashed eviction never wedges the accounting.

const DB_NAME = 'seismolord-bricks';
const STORE = 'bricks';
const DEFAULT_BUDGET = 512 * 1024 * 1024;

let dbPromise = null;
let trackedBytes = 0;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, { keyPath: 'path' });
      store.createIndex('ts', 'ts');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  }).then(async (db) => {
    trackedBytes = await new Promise((resolve) => {
      let sum = 0;
      const tx = db.transaction(STORE, 'readonly');
      const cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { resolve(sum); return; }
        sum += c.value.bytes || 0;
        c.continue();
      };
      cur.onerror = () => resolve(sum);
    });
    return db;
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

const idbGet = (db, path) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(path);
  req.onsuccess = () => resolve(req.result || null);
  req.onerror = () => reject(req.error);
});

const idbPut = (db, record) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
});

/** Evict oldest-accessed entries until the tracked total fits. */
async function evict(db, budget) {
  if (trackedBytes <= budget) return;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const cur = tx.objectStore(STORE).index('ts').openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c || trackedBytes <= budget) { resolve(); return; }
      trackedBytes -= c.value.bytes || 0;
      c.delete();
      c.continue();
    };
    cur.onerror = () => resolve();
  });
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
      const hit = await idbGet(db, path);
      if (hit?.buf) {
        // refresh last-access lazily; a failure only ages the entry
        idbPut(db, { ...hit, ts: Date.now() }).catch(() => {});
        return hit.buf;
      }
    } catch { db = null; /* fall through to network */ }

    const buf = await fetcher(path, signal);
    if (db) {
      const record = { path, buf, bytes: buf.byteLength, ts: Date.now() };
      idbPut(db, record)
        .then(() => { trackedBytes += record.bytes; return evict(db, budgetBytes); })
        .catch(() => {});
    }
    return buf;
  };
}

/** Drop a volume's persisted bricks (called on volume delete). */
export async function purgePersistedBricks(volumeId) {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { resolve(); return; }
        if (c.value.path.includes(`/${volumeId}/`)) {
          trackedBytes -= c.value.bytes || 0;
          c.delete();
        }
        c.continue();
      };
      cur.onerror = () => resolve();
    });
  } catch { /* persistence is optional */ }
}

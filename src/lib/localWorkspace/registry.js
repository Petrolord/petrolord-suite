// What this browser profile knows about its local workspace, in IndexedDB
// (readable from every worker, so the slice, conversion and job workers find
// local bricks without asking the page):
//
//   workspaces  key "ws:<userId>"  {key, userId, backend: 'folder'|'opfs',
//               handle (FileSystemDirectoryHandle, folder backend only),
//               workspaceId, deviceId (seismic_devices row or null), label,
//               createdAt}
//   volumes     key volumeId       {volumeId, userId, projectId, backend,
//               state: 'writing'|'ready'|'missing', bytes, contentId,
//               brickRoot, name, createdAt, updatedAt}
//
// Directory handles are structured-cloneable, so IndexedDB keeps the folder
// the user picked across restarts; the browser re-asks for permission (or
// remembers "Allow on every visit", Chrome 122+). memoryRegistry() is the
// same interface for tests.

const DB_NAME = 'petrolord-local-workspace';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no IndexedDB, so it cannot keep a local workspace.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('volumes')) db.createObjectStore('volumes', { keyPath: 'volumeId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the local workspace records.'));
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('The local workspace record was not saved.'));
  });
}

export const workspaceKey = (userId) => `ws:${userId}`;

export function idbRegistry() {
  let dbp = null;
  const db = () => { if (!dbp) dbp = openDb().catch((e) => { dbp = null; throw e; }); return dbp; };
  return {
    kind: 'idb',
    async getWorkspace(userId) { return (await tx(await db(), 'workspaces', 'readonly', (s) => s.get(workspaceKey(userId)))) || null; },
    async putWorkspace(rec) { await tx(await db(), 'workspaces', 'readwrite', (s) => s.put({ ...rec, key: workspaceKey(rec.userId) })); },
    async deleteWorkspace(userId) { await tx(await db(), 'workspaces', 'readwrite', (s) => s.delete(workspaceKey(userId))); },
    async getVolume(volumeId) { return (await tx(await db(), 'volumes', 'readonly', (s) => s.get(volumeId))) || null; },
    async putVolume(rec) { await tx(await db(), 'volumes', 'readwrite', (s) => s.put({ ...rec, updatedAt: Date.now() })); },
    async patchVolume(volumeId, patch) {
      const cur = await this.getVolume(volumeId);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      await tx(await db(), 'volumes', 'readwrite', (s) => s.put(next));
      return next;
    },
    async deleteVolume(volumeId) { await tx(await db(), 'volumes', 'readwrite', (s) => s.delete(volumeId)); },
    async listVolumes(userId = null) {
      const all = (await tx(await db(), 'volumes', 'readonly', (s) => s.getAll())) || [];
      return userId ? all.filter((v) => v.userId === userId) : all;
    },
  };
}

export function memoryRegistry() {
  const ws = new Map();
  const vols = new Map();
  return {
    kind: 'memory',
    async getWorkspace(userId) { return ws.get(workspaceKey(userId)) || null; },
    async putWorkspace(rec) { ws.set(workspaceKey(rec.userId), { ...rec, key: workspaceKey(rec.userId) }); },
    async deleteWorkspace(userId) { ws.delete(workspaceKey(userId)); },
    async getVolume(volumeId) { return vols.get(volumeId) || null; },
    async putVolume(rec) { vols.set(rec.volumeId, { ...rec, updatedAt: Date.now() }); },
    async patchVolume(volumeId, patch) {
      const cur = vols.get(volumeId);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      vols.set(volumeId, next);
      return next;
    },
    async deleteVolume(volumeId) { vols.delete(volumeId); },
    async listVolumes(userId = null) { return [...vols.values()].filter((v) => !userId || v.userId === userId); },
  };
}

let shared = null;
/** The registry of this browser profile (one per JS context). */
export function defaultRegistry() {
  if (!shared) shared = idbRegistry();
  return shared;
}
/** Tests: replace the shared registry. */
export function setDefaultRegistry(r) { shared = r; }

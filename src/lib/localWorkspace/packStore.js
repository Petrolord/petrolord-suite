// The local volume store: one volume's bricks in write-once pack files
// (docs/scope/LocalWorkspace-DESIGN.md section 5.3). The same code runs on a
// user-chosen folder (File System Access), on the Origin Private File System
// and on the in-memory directory (memoryDir.js), because all three expose
// the same handle surface.
//
//   <volume dir>/
//     packs/000001.pack       encoded bricks, appended, never rewritten
//     packs/000001.idx.json   that pack's index, written when it closes:
//                             [[key, offset, length, sha256], ...]
//     <name>.json             small records (manifest, conversion, job, state)
//
// Why packs: each createWritable() on a real folder writes a swap file and
// moves it on close, so one file per brick would be about 80,000 swap and
// move cycles for an 80 GB stack. A pack is one writable for up to 256 MiB.
// A pack is durable only once its index exists; a pack without one (the
// browser closed while it was open) is removed by the next writer.
//
// The store implements the brick spool interface (services/brickSpool.js),
// so the existing v4 conversion writes into it and the existing two-stage
// upload reads from it unchanged: put, get, has, keys, putJson, getJson,
// bytes, destroy. Added: flush, close, entries, brickRoot, verify.

import { sha256Hex } from './sha256';
import { brickRootOf } from './identity';

export const PACK_BYTES = 256 * 1024 * 1024;
const PACK_DIR = 'packs';
const PACK_RE = /^(\d{6})\.pack$/;
const IDX_RE = /^(\d{6})\.idx\.json$/;
const packName = (n) => `${String(n).padStart(6, '0')}.pack`;
const idxName = (n) => `${String(n).padStart(6, '0')}.idx.json`;
const jsonName = (name) => `${name}.json`;

const isNotFound = (e) => e?.name === 'NotFoundError';

/** A clear message for a failed local write (disk full, folder gone, permission). */
export function localWriteError(err, where = 'the local workspace') {
  const n = err?.name || '';
  if (n === 'QuotaExceededError') {
    return new Error(`There is not enough free space for ${where}. Free some disk space or choose a workspace folder on a larger drive, then try again.`);
  }
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return new Error(`The browser no longer has permission to write to ${where}. Reconnect the workspace folder, then try again.`);
  }
  if (n === 'NotFoundError') {
    return new Error(`The workspace folder was moved or deleted, so ${where} could not be written. Reconnect the folder, then try again.`);
  }
  return new Error(`Writing to ${where} failed: ${err?.message || err}`);
}

async function readJsonFile(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return JSON.parse(await (await fh.getFile()).text());
  } catch (e) {
    if (isNotFound(e) || e instanceof SyntaxError) return null;
    throw e;
  }
}

async function writeWhole(dir, name, bytes) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable({ keepExistingData: false });
  try {
    await w.write(bytes);
    await w.close();
  } catch (e) {
    try { await w.abort(); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Open (or create) a volume's pack store in `dir`.
 * @param {Object} dir directory handle of the volume (FileSystemDirectoryHandle or memoryDirectory)
 * @param {Object} [o]
 * @param {boolean} [o.write] a writer: removes incomplete packs on open and may put
 * @param {number} [o.packBytes]
 * @param {boolean} [o.sync] use createSyncAccessHandle when the file handle has it (OPFS in a worker)
 * @param {(bytes: Uint8Array) => Promise<string>} [o.hash]
 * @param {{parent: Object, name: string}} [o.home] where `dir` lives, for destroy()
 * @param {string} [o.label] used in error messages
 */
export async function openPackStore(dir, {
  write = false, packBytes = PACK_BYTES, sync = true, hash = sha256Hex, home = null, label = 'this volume',
} = {}) {
  const packs = await dir.getDirectoryHandle(PACK_DIR, { create: write });
  const index = new Map(); // key -> {pack, off, len, sha}
  const files = new Map(); // pack number -> File snapshot (closed packs)
  let next = 1;

  async function loadIndex() {
    const seenPacks = new Set();
    const seenIdx = new Set();
     
    for await (const name of packs.keys()) {
      let m = PACK_RE.exec(name);
      if (m) { seenPacks.add(Number(m[1])); continue; }
      m = IDX_RE.exec(name);
      if (m) seenIdx.add(Number(m[1]));
    }
    for (const n of [...seenIdx].sort((a, b) => a - b)) {
       
      const rec = await readJsonFile(packs, idxName(n));
      if (!rec || !Array.isArray(rec.entries)) continue;
      for (const [key, off, len, sha] of rec.entries) index.set(key, { pack: n, off, len, sha });
    }
    const all = [...seenPacks, ...seenIdx];
    next = Math.max(next, (all.length ? Math.max(...all) : 0) + 1);
    return { orphans: [...seenPacks].filter((n) => !seenIdx.has(n)) };
  }

  const { orphans } = await loadIndex();
  if (write) {
    // a pack with no index never closed: its bricks are not in the index, so drop it
    for (const n of orphans) {
       
      await packs.removeEntry(packName(n)).catch(() => {});
    }
     
    for await (const name of packs.keys()) {
      if (name.endsWith('.crswap')) await packs.removeEntry(name).catch(() => {});
    }
  }

  // ---- the open pack (writers only) ------------------------------------
  let cur = null; // {n, handle, writable|access, size, entries}
  let tail = Promise.resolve();
  let failure = null;

  async function openPack() {
    const n = next;
    next += 1;
    const fh = await packs.getFileHandle(packName(n), { create: true });
    const canSync = sync && typeof fh.createSyncAccessHandle === 'function' && typeof window === 'undefined';
    if (canSync) {
      const access = await fh.createSyncAccessHandle();
      access.truncate(0);
      cur = { n, fh, access, size: 0, entries: [] };
    } else {
      const writable = await fh.createWritable({ keepExistingData: false });
      cur = { n, fh, writable, size: 0, entries: [] };
    }
  }

  async function closePack() {
    if (!cur) return;
    const c = cur;
    cur = null;
    if (c.access) {
      c.access.flush();
      c.access.close();
    } else {
      await c.writable.close();
    }
    const entries = await Promise.all(c.entries.map(async (e) => [e.key, e.off, e.len, await e.shaP]));
    await writeWhole(packs, idxName(c.n), new TextEncoder().encode(JSON.stringify({ format: 1, pack: c.n, entries })));
    for (const [key, off, len, sha] of entries) index.set(key, { pack: c.n, off, len, sha });
  }

  function enqueue(fn) {
    const run = tail.then(() => {
      if (failure) throw failure;
      return fn();
    });
    tail = run.catch((e) => { failure = failure || e; });
    return run;
  }

  async function readPack(n, off, len) {
    if (cur && cur.n === n) {
      if (cur.access) {
        const out = new Uint8Array(len);
        cur.access.read(out, { at: off });
        return out;
      }
      // a createWritable pack is readable only once closed
      await enqueue(closePack);
    }
    let f = files.get(n);
    if (!f) {
      const fh = await packs.getFileHandle(packName(n));
      f = await fh.getFile();
      files.set(n, f);
    }
    return new Uint8Array(await f.slice(off, off + len).arrayBuffer());
  }

  let lastReload = 0;
  async function lookup(key) {
    let e = index.get(key);
    if (!e && cur) e = cur.entries.find((x) => x.key === key) && { pending: true };
    if (!e && !write && Date.now() - lastReload > 2000) {
      // a reader beside a writer in another worker: the pack may have closed since
      lastReload = Date.now();
      await loadIndex();
      e = index.get(key);
    }
    return e || null;
  }

  const store = {
    kind: 'pack',
    label,
    async put(key, bytes) {
      if (!write) throw new Error('This local volume is open read-only.');
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const shaP = hash(b);
      return enqueue(async () => {
        try {
          if (cur && cur.size > 0 && cur.size + b.byteLength > packBytes) await closePack();
          if (!cur) await openPack();
          const off = cur.size;
          if (cur.access) {
            // Firefox returns a short count at its quota instead of throwing (L0 spike)
            const n = cur.access.write(b, { at: off });
            if (typeof n === 'number' && n !== b.byteLength) throw Object.assign(new Error(`Short write: ${n} of ${b.byteLength} bytes.`), { name: 'QuotaExceededError' });
          }
          else await cur.writable.write(b);
          cur.size += b.byteLength;
          cur.entries.push({ key, off, len: b.byteLength, shaP });
        } catch (e) {
          throw localWriteError(e, label);
        }
      });
    },
    async get(key) {
      let e = await lookup(key);
      if (e?.pending) {
        await enqueue(closePack);
        e = index.get(key);
      }
      if (!e) throw new Error(`The local copy of ${key} is missing.`);
      return readPack(e.pack, e.off, e.len);
    },
    async has(key) {
      if (index.has(key)) return true;
      return Boolean(cur && cur.entries.some((x) => x.key === key));
    },
    async keys() {
      const out = new Set(index.keys());
      if (cur) for (const e of cur.entries) out.add(e.key);
      return [...out];
    },
    async putJson(name, value) {
      if (!write) throw new Error('This local volume is open read-only.');
      // a record may refer to bricks: make them durable first
      await enqueue(closePack);
      try {
        await writeWhole(dir, jsonName(name), new TextEncoder().encode(JSON.stringify(value)));
      } catch (e) {
        throw localWriteError(e, label);
      }
    },
    getJson: (name) => readJsonFile(dir, jsonName(name)),
    async bytes() {
      let s = 0;
      for (const e of index.values()) s += e.len;
      if (cur) for (const e of cur.entries) s += e.len;
      return s;
    },
    /** Close the open pack so every brick put so far is durable. */
    flush: () => (write ? enqueue(closePack) : Promise.resolve()),
    close: () => (write ? enqueue(closePack) : Promise.resolve()),
    /** [[key, sha256]] of every durable brick. */
    entries: () => [...index.entries()].map(([k, e]) => [k, e.sha]),
    get count() { return index.size; },
    async brickRoot() {
      await store.flush();
      return brickRootOf(store.entries());
    },
    /**
     * Re-read every brick and check it against its recorded hash, and the
     * hashes against `root` when given. A replica is ready only when this
     * passes.
     * @returns {Promise<{ok: boolean, checked: number, bad: string[], root: string, rootMatches: ?boolean}>}
     */
    async verify({ root = null, onProgress = () => {}, isCancelled = () => false } = {}) {
      await store.flush();
      const bad = [];
      const actual = [];
      let checked = 0;
      const all = [...index.entries()];
      for (const [key, e] of all) {
        if (isCancelled()) throw new Error('Verification cancelled.');
        let sha = null;
        try {
           
          sha = await hash(await readPack(e.pack, e.off, e.len));
        } catch { sha = 'unreadable'; }
        if (sha !== e.sha) bad.push(key);
        actual.push([key, sha]);
        checked += 1;
        onProgress(checked, all.length);
      }
      const computed = await brickRootOf(actual);
      const rootMatches = root ? computed === root : null;
      return { ok: bad.length === 0 && rootMatches !== false, checked, bad, root: computed, rootMatches };
    },
    async destroy() {
      if (cur) {
        try { if (cur.access) cur.access.close(); else await cur.writable.abort(); } catch { /* ignore */ }
        cur = null;
      }
      if (home) await home.parent.removeEntry(home.name, { recursive: true }).catch(() => {});
    },
  };
  return store;
}

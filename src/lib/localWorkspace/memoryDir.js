// An in-memory directory with the File System Access handle surface the
// local workspace uses (getDirectoryHandle, getFileHandle, removeEntry,
// entries/keys/values, getFile, createWritable and, optionally,
// createSyncAccessHandle). The memory backend of the local volume store and
// the stand-in for a real folder or OPFS in jest. Writes become visible on
// close, as with createWritable on a real disk.

class MemFile {
  constructor(bytes, name) {
    this.bytes = bytes;
    this.name = name;
  }

  get size() { return this.bytes.byteLength; }

  slice(start = 0, end = this.bytes.byteLength) {
    return new MemFile(this.bytes.subarray(Math.max(0, start), Math.min(this.bytes.byteLength, end)), this.name);
  }

  async arrayBuffer() {
    const out = new Uint8Array(this.bytes.byteLength);
    out.set(this.bytes);
    return out.buffer;
  }

  async text() { return new TextDecoder().decode(this.bytes); }
}

const toBytes = (data) => {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && data.bytes instanceof Uint8Array) return data.bytes; // MemFile
  throw new TypeError('memoryDir: unsupported write payload');
};

const notFound = (name) => Object.assign(new Error(`A requested file or directory could not be found: ${name}`), { name: 'NotFoundError' });

export function memoryFileHandle(name, store, { sync = false, failWritesAfter = null } = {}) {
  const handle = {
    kind: 'file',
    name,
    async getFile() { return new MemFile(store.bytes, name); },
    async createWritable({ keepExistingData = false } = {}) {
      let buf = keepExistingData ? store.bytes.slice() : new Uint8Array(0);
      let pos = 0;
      let len = buf.byteLength;
      const ensure = (n) => {
        if (n <= buf.byteLength) return;
        const next = new Uint8Array(Math.max(n, buf.byteLength * 2, 1024));
        next.set(buf.subarray(0, len));
        buf = next;
      };
      return {
        async write(arg) {
          let data = arg;
          if (arg && typeof arg === 'object' && arg.type === 'write') {
            if (arg.position != null) pos = arg.position;
            data = arg.data;
          }
          const b = toBytes(data);
          if (failWritesAfter != null && len + b.byteLength > failWritesAfter) {
            throw Object.assign(new Error('The disk is full.'), { name: 'QuotaExceededError' });
          }
          ensure(pos + b.byteLength);
          buf.set(b, pos);
          pos += b.byteLength;
          len = Math.max(len, pos);
        },
        async seek(p) { pos = p; },
        async truncate(n) { ensure(n); len = n; if (pos > n) pos = n; },
        async close() { store.bytes = buf.slice(0, len); },
        async abort() { /* drop */ },
      };
    },
  };
  if (sync) {
    handle.createSyncAccessHandle = async () => {
      let buf = store.bytes.slice();
      let len = buf.byteLength;
      const ensure = (n) => {
        if (n <= buf.byteLength) return;
        const next = new Uint8Array(Math.max(n, buf.byteLength * 2, 1024));
        next.set(buf.subarray(0, len));
        buf = next;
      };
      return {
        write(data, { at = 0 } = {}) {
          const b = toBytes(data);
          ensure(at + b.byteLength);
          buf.set(b, at);
          len = Math.max(len, at + b.byteLength);
          store.bytes = buf.slice(0, len); // visible at once, as OPFS sync handles are
          return b.byteLength;
        },
        read(out, { at = 0 } = {}) {
          const n = Math.max(0, Math.min(out.byteLength, len - at));
          new Uint8Array(out.buffer, out.byteOffset, out.byteLength).set(buf.subarray(at, at + n));
          return n;
        },
        getSize() { return len; },
        truncate(n) { ensure(n); len = n; store.bytes = buf.slice(0, len); },
        flush() {},
        close() { store.bytes = buf.slice(0, len); },
      };
    };
  }
  return handle;
}

/**
 * @param {string} [name]
 * @param {{sync?: boolean, failWritesAfter?: number}} [opts] sync: file
 *   handles offer createSyncAccessHandle (OPFS in a worker);
 *   failWritesAfter: a write that would take a file past this many bytes
 *   throws QuotaExceededError (disk-full tests)
 */
export function memoryDirectory(name = '', opts = {}) {
  const dirs = new Map();
  const files = new Map(); // name -> {bytes}
  const dir = {
    kind: 'directory',
    name,
    async getDirectoryHandle(n, { create = false } = {}) {
      if (!dirs.has(n)) {
        if (!create) throw notFound(n);
        if (files.has(n)) throw Object.assign(new Error(`${n} is a file`), { name: 'TypeMismatchError' });
        dirs.set(n, memoryDirectory(n, opts));
      }
      return dirs.get(n);
    },
    async getFileHandle(n, { create = false } = {}) {
      if (!files.has(n)) {
        if (!create) throw notFound(n);
        files.set(n, { bytes: new Uint8Array(0) });
      }
      return memoryFileHandle(n, files.get(n), opts);
    },
    async removeEntry(n, { recursive = false } = {}) {
      if (files.delete(n)) return;
      const d = dirs.get(n);
      if (!d) throw notFound(n);
      if (!recursive && (await d.isEmpty()) === false) {
        throw Object.assign(new Error(`${n} is not empty`), { name: 'InvalidModificationError' });
      }
      dirs.delete(n);
    },
    async isEmpty() { return dirs.size === 0 && files.size === 0; },
    async* entries() {
      for (const [n, d] of dirs) yield [n, d];
      for (const n of files.keys()) yield [n, memoryFileHandle(n, files.get(n), opts)];
    },
    async* keys() { for await (const [n] of dir.entries()) yield n; },
    async* values() { for await (const [, h] of dir.entries()) yield h; },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    /** test helper: total bytes stored below this directory */
    async totalBytes() {
      let s = 0;
      for (const f of files.values()) s += f.bytes.byteLength;
      for (const d of dirs.values()) s += await d.totalBytes();
      return s;
    },
    /** test helper: direct access to a file's bytes (corruption tests) */
    rawFile(n) { return files.get(n) || null; },
  };
  return dir;
}

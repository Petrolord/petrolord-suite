// Incremental SHA-256 (FIPS 180-4) for Local Workspace volume identity
// (docs/scope/LocalWorkspace-DESIGN.md section 5.3). SubtleCrypto hashes one
// buffer at a time and cannot stream, so the full source SHA-256 of an 80 GB
// SEG-Y is computed here, chunk by chunk, while the import reads the file.
// Plain JS, no dependencies; runs in workers. Checked against node:crypto
// and SubtleCrypto in __tests__/sha256.test.js.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lowercase hex of bytes. */
export function toHex(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += HEX[b[i]];
  return s;
}

/**
 * An incremental hasher: update(bytes) any number of times, then digest()
 * (Uint8Array(32)) or hex(). update accepts Uint8Array, ArrayBuffer or any
 * ArrayBufferView.
 */
export function createSha256() {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  const block = new Uint8Array(64);
  let blockLen = 0;
  let total = 0; // bytes; exact to 2^53, ample for any file
  let done = false;

  function compress(buf, off) {
    for (let t = 0; t < 16; t++) {
      const o = off + t * 4;
      W[t] = (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
    }
    for (let t = 16; t < 64; t++) {
      const w15 = W[t - 15];
      const w2 = W[t - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }
    let a = H[0]; let b = H[1]; let c = H[2]; let d = H[3];
    let e = H[4]; let f = H[5]; let g = H[6]; let h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  const api = {
    update(data) {
      if (done) throw new Error('sha256: update after digest');
      const bytes = data instanceof Uint8Array ? data
        : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data);
      let i = 0;
      const n = bytes.length;
      total += n;
      if (blockLen > 0) {
        while (blockLen < 64 && i < n) block[blockLen++] = bytes[i++];
        if (blockLen === 64) { compress(block, 0); blockLen = 0; }
      }
      while (i + 64 <= n) { compress(bytes, i); i += 64; }
      while (i < n) block[blockLen++] = bytes[i++];
      return api;
    },
    digest() {
      if (done) throw new Error('sha256: digest called twice');
      done = true;
      const bitsHi = Math.floor(total / 0x20000000);
      const bitsLo = (total * 8) >>> 0;
      block[blockLen++] = 0x80;
      if (blockLen > 56) {
        while (blockLen < 64) block[blockLen++] = 0;
        compress(block, 0);
        blockLen = 0;
      }
      while (blockLen < 56) block[blockLen++] = 0;
      block[56] = bitsHi >>> 24; block[57] = bitsHi >>> 16; block[58] = bitsHi >>> 8; block[59] = bitsHi;
      block[60] = bitsLo >>> 24; block[61] = bitsLo >>> 16; block[62] = bitsLo >>> 8; block[63] = bitsLo;
      compress(block, 0);
      const out = new Uint8Array(32);
      for (let t = 0; t < 8; t++) {
        out[t * 4] = H[t] >>> 24; out[t * 4 + 1] = H[t] >>> 16; out[t * 4 + 2] = H[t] >>> 8; out[t * 4 + 3] = H[t];
      }
      return out;
    },
    hex() { return toHex(api.digest()); },
    get bytesHashed() { return total; },
  };
  return api;
}

/** One-shot hex SHA-256: SubtleCrypto when present (native, fast), else the JS hasher. */
export async function sha256Hex(data) {
  const bytes = data instanceof Uint8Array ? data
    : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : null;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
    } catch { /* fall through (insecure context) */ }
  }
  return createSha256().update(bytes).hex();
}

/**
 * Hash a whole File or Blob in order, reading `chunkBytes` at a time.
 * @param {Blob} file
 * @param {{chunkBytes?: number, onProgress?: (done: number, total: number) => void,
 *   isCancelled?: () => boolean}} [o]
 * @returns {Promise<string>} hex
 */
export async function sha256File(file, { chunkBytes = 8 * 1024 * 1024, onProgress = () => {}, isCancelled = () => false } = {}) {
  const h = createSha256();
  const size = file.size;
  for (let off = 0; off < size; off += chunkBytes) {
    if (isCancelled()) throw new Error('Hashing cancelled.');
     
    const buf = await file.slice(off, Math.min(size, off + chunkBytes)).arrayBuffer();
    h.update(new Uint8Array(buf));
    onProgress(Math.min(size, off + chunkBytes), size);
  }
  return h.hex();
}

/** JSON with object keys sorted at every level, so equal content hashes equal. */
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return 'null';
    return JSON.stringify(v === undefined ? null : v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

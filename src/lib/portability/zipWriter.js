// .pld package writer on jszip (Project Portability PP1, PLAN §4.1, §4.6).
//
// jszip is the Suite's declared zip dependency (package.json), so PP1 uses
// it rather than adding a streaming library while node_modules is still
// tracked. Files are added one at a time and hashed as they go (sha256 for
// the manifest's `files` map); the archive is generated at the end either
// to a Blob (download) or piped chunk-by-chunk into a File System Access
// writable when the browser offers one. Geoscience packages are megabytes;
// seismic bricks (PP3) are where a true streaming writer becomes necessary
// and this module is the seam to swap it in.

import JSZip from 'jszip';

// jsdom (jest) has no TextEncoder on the global; Node's util one is identical.
let encoder = null;
async function textEncoder() {
  if (encoder) return encoder;
  if (typeof globalThis.TextEncoder === 'function') encoder = new globalThis.TextEncoder();
  else { const util = await import('node:util'); encoder = new util.TextEncoder(); }
  return encoder;
}

/** sha256 hex of bytes. WebCrypto in the browser and Node 19+; node:crypto under jest/Node 18. */
export async function sha256Hex(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', u8);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(u8).digest('hex');
}

export class PackageWriter {
  constructor() {
    this.zip = new JSZip();
    /** @type {Record<string, {bytes:number, sha256:string}>} */
    this.files = {};
    this.totalBytes = 0;
  }

  /** Add UTF-8 text at `path`. Returns its file entry. */
  async addText(path, text) {
    return this.addBytes(path, (await textEncoder()).encode(text));
  }

  /** Add binary content at `path`. Returns its file entry. */
  async addBytes(path, bytes) {
    if (!path || path.startsWith('/') || path.includes('..')) throw new Error(`PackageWriter: bad path "${path}"`);
    if (path in this.files) throw new Error(`PackageWriter: duplicate path "${path}"`);
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const entry = { bytes: u8.byteLength, sha256: await sha256Hex(u8) };
    this.zip.file(path, u8, { binary: true, createFolders: false, compression: path.endsWith('.f32') || path.endsWith('.bin') ? 'STORE' : 'DEFLATE' });
    this.files[path] = entry;
    this.totalBytes += u8.byteLength;
    return entry;
  }

  /** Add the manifest last (it is the one file not listed in `files`). */
  addManifest(manifest) {
    this.zip.file('manifest.json', JSON.stringify(manifest, null, 2), { createFolders: false });
  }

  /** Whole archive as a Uint8Array (tests, and the download fallback). */
  async toUint8Array(onProgress) {
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      onProgress ? (meta) => onProgress(meta.percent) : undefined);
  }

  /** Whole archive as a Blob. */
  async toBlob(onProgress) {
    const u8 = await this.toUint8Array(onProgress);
    return new Blob([u8], { type: 'application/zip' });
  }

  /**
   * Stream the archive into a WritableStream (File System Access API
   * `FileSystemWritableFileStream`). Chunks go straight to disk.
   */
  async pipeTo(writable, onProgress) {
    const writer = writable.getWriter ? writable.getWriter() : writable;
    await new Promise((resolve, reject) => {
      this.zip.generateInternalStream({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, streamFiles: true })
        .on('data', (chunk, meta) => {
          writer.write(chunk);
          if (onProgress) onProgress(meta.percent);
        })
        .on('error', reject)
        .on('end', resolve)
        .resume();
    });
    if (writer.close) await writer.close();
  }
}

/**
 * Save an archive with the best sink the browser offers: the File System
 * Access picker (streamed) when present, otherwise an anchor download.
 * Returns { method: 'fsa' | 'download' | 'cancelled' }.
 */
export async function savePackage(writer, filename, onProgress) {
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Petrolord Project Package', accept: { 'application/zip': ['.pld'] } }],
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'cancelled' };
      handle = null; // picker unavailable in this context: fall back to download
    }
    if (handle) {
      const stream = await handle.createWritable();
      await writer.pipeTo(stream, onProgress);
      return { method: 'fsa' };
    }
  }
  const blob = await writer.toBlob(onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { method: 'download' };
}

/** Safe file name from a package name: `<slug>-<yyyymmdd>.pld`. */
export function packageFilename(name, date = new Date()) {
  const slug = String(name || 'petrolord-package').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'petrolord-package';
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${slug}-${ymd}.pld`;
}

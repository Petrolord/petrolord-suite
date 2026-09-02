// Multi-part packages (Project Portability PP4, PLAN §4.1 "sizes above a
// threshold split into numbered parts with one manifest").
//
// A PackageSet is one logical .pld spread over N zip files:
//   <slug>.part1of3.pld   data/**, open/**, README.txt, manifest.json
//   <slug>.part2of3.pld   blobs/**
//   <slug>.part3of3.pld   blobs/**
// Part 1 always holds the rows, sidecars and the manifest; blobs fill parts
// in order until each reaches the part size. The manifest gains `parts`
// (file, bytes, sha256 of every part except part 1, which cannot hash
// itself) and every blob entry carries its `part`. A single-part set is
// exactly the PP1 package, so readers that know nothing about parts still
// open it.
//
// Reading: readPackageSet(files[]) merges the parts by manifest.package_id
// and checks every part's sha256 before handing a single logical archive
// to readPackage.

import { PackageWriter, sha256Hex, savePackage, packageFilename } from './zipWriter';
import { validateManifest } from './manifest';

export const DEFAULT_PART_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB of raw input per part

export class PackageSet {
  constructor({ partBytes = DEFAULT_PART_BYTES } = {}) {
    this.partBytes = partBytes;
    this.parts = [new PackageWriter()]; // part 1: rows, sidecars, manifest
    /** logical path -> { bytes, sha256, part } */
    this.files = {};
  }

  get partCount() { return this.parts.length; }

  /** Text goes to part 1 (rows, sidecars, README). */
  async addText(path, text) {
    const entry = await this.parts[0].addText(path, text);
    this.files[path] = { ...entry, part: 1 };
    return entry;
  }

  /** Blobs fill part 1 first (so small packages stay single-part), then further parts. */
  async addBytes(path, bytes) {
    const size = bytes.byteLength ?? bytes.length ?? 0;
    let idx = this.parts.length - 1;
    if (this.parts[idx].totalBytes > 0 && this.parts[idx].totalBytes + size > this.partBytes) {
      this.parts.push(new PackageWriter());
      idx = this.parts.length - 1;
    }
    const entry = await this.parts[idx].addBytes(path, bytes);
    this.files[path] = { ...entry, part: idx + 1 };
    return entry;
  }

  /** Files map for the manifest (bytes + sha256 only; `part` is recorded on blobs). */
  manifestFiles() {
    return Object.fromEntries(Object.entries(this.files).map(([p, e]) => [p, { bytes: e.bytes, sha256: e.sha256 }]));
  }

  partOf(path) { return this.files[path]?.part ?? null; }

  /**
   * Finalise: hash parts 2..N, stamp `parts` on the manifest, add the
   * manifest to part 1. Returns the archives as Uint8Arrays in order.
   */
  async finish(manifest, nameFor = null) {
    const archives = [];
    const parts = [];
    const count = this.parts.length;
    const fileOf = (index) => (nameFor ? nameFor(index, count) : null);
    for (let i = 1; i < count; i += 1) {
      const u8 = await this.parts[i].toUint8Array();
      archives[i] = u8;
      parts.push({ index: i + 1, file: fileOf(i + 1), bytes: u8.byteLength, sha256: await sha256Hex(u8) });
    }
    if (parts.length) manifest.parts = [{ index: 1, file: fileOf(1), bytes: null, sha256: null }, ...parts];
    const check = validateManifest(manifest);
    if (!check.ok) throw new Error(`Internal error: the multi-part manifest failed validation (${check.errors[0]}).`);
    this.parts[0].addManifest(manifest);
    archives[0] = await this.parts[0].toUint8Array();
    return archives;
  }
}

export function partFilename(name, index, count, date = new Date()) {
  const base = packageFilename(name, date).replace(/\.pld$/, '');
  return count > 1 ? `${base}.part${index}of${count}.pld` : `${base}.pld`;
}

/**
 * Save every part with the best sink available. Returns
 * { method, files: [names] }; 'cancelled' if the user dismissed the first picker.
 */
export async function savePackageSet(set, manifest, name, onProgress) {
  const archives = await set.finish(manifest, (index, count) => partFilename(name, index, count));
  const count = archives.length;
  const files = [];
  for (let i = 0; i < count; i += 1) {
    const filename = partFilename(name, i + 1, count);
    const fake = { toUint8Array: async () => archives[i], toBlob: async () => new Blob([archives[i]], { type: 'application/zip' }), pipeTo: async (w) => { const wr = w.getWriter ? w.getWriter() : w; await wr.write(archives[i]); if (wr.close) await wr.close(); } };
    const res = await savePackage(fake, filename, (pct) => onProgress?.(`Saving part ${i + 1} of ${count}`, pct));
    if (res.method === 'cancelled') return { method: 'cancelled', files };
    files.push(filename);
  }
  return { method: count > 1 ? 'parts' : 'single', files };
}

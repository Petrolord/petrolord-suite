// A transient copy on the worker's scratch disk of what a job reads from a
// link (2026-10-15, QI round 3). The converters read their source several
// times (the gather check, the scan of the cropped view, the index, the
// amplitudes, the conversion), which is free from the worker's store and
// costly from a link; so a job on a linked file reads the link once, in
// order, into scratch, and works from there. With a crop only the cropped
// file is copied. The copy is removed when the job ends; nothing is kept.
import fs from 'node:fs/promises';
import { JobFailure } from './runJob.js';

const MiB = 1024 * 1024;
const GiB = 1024 ** 3;

/** Free bytes on the file system holding dir (null when it cannot be told). */
export async function freeBytes(dir) {
  try { const s = await fs.statfs(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

/**
 * Copy reader into file, then read from the copy.
 * @returns {Promise<{size, read, remove}>}
 */
export async function copyToScratch(reader, file, { chunkBytes = 64 * MiB, isCancelled = () => false, onProgress, reserveBytes = 4 * GiB, free = freeBytes } = {}) {
  const dir = file.slice(0, file.lastIndexOf('/')) || '.';
  await fs.mkdir(dir, { recursive: true });
  const avail = await free(dir);
  if (avail != null && avail < reader.size + reserveBytes) {
    throw new JobFailure('scratch_full', `The worker needs ${(reader.size / GiB).toFixed(1)} GiB of working space for this file and has ${(Math.max(0, avail - reserveBytes) / GiB).toFixed(1)} GiB free. Try a smaller crop, or try again later.`);
  }
  const fh = await fs.open(file, 'w');
  try {
    for (let at = 0; at < reader.size; at += chunkBytes) {
      if (isCancelled()) break;
      const n = Math.min(chunkBytes, reader.size - at);
      const b = new Uint8Array(await reader.read(at, n));
      await fh.write(b, 0, b.length, at);
      onProgress?.(at + n, reader.size);
    }
  } finally {
    await fh.close();
  }
  let rh = null;
  return {
    size: reader.size,
    async read(offset, length) {
      if (offset < 0 || length < 0 || offset + length > reader.size) throw new Error(`Read out of range: ${offset}+${length} of ${reader.size}`);
      if (!rh) rh = await fs.open(file, 'r');
      const out = new Uint8Array(length);
      let got = 0;
      while (got < length) {
        const { bytesRead } = await rh.read(out, got, length - got, offset + got);
        if (!bytesRead) throw new Error(`Short read from the scratch copy at ${offset + got}.`);
        got += bytesRead;
      }
      return out.buffer;
    },
    async remove() {
      try { await rh?.close(); } catch { /* closed */ }
      await fs.rm(file, { force: true });
    },
  };
}

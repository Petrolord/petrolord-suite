/**
 * Virtual SEG-Y reader for soak testing: synthesizes file bytes on
 * demand, so a multi-gigabyte "file" needs no disk and no RAM beyond the
 * requested window. IEEE format 5, il/xl at the standard 189/193 bytes,
 * one shared sample template per trace (the soak measures streaming and
 * memory discipline, not decode values — those are golden-tested).
 */

export function virtualSegyReader({ nIl, nXl, ns, dtUs = 4000 }) {
  const traceBytes = 240 + ns * 4;
  const size = 3600 + nIl * nXl * traceBytes;

  // 3600-byte header block
  const headerBlock = new Uint8Array(3600);
  {
    const v = new DataView(headerBlock.buffer);
    v.setInt16(3200 + 16, dtUs, false);
    v.setInt16(3200 + 20, ns, false);
    v.setInt16(3200 + 24, 5, false);            // IEEE float
  }

  // shared big-endian sample payload
  const samples = new Uint8Array(ns * 4);
  {
    const v = new DataView(samples.buffer);
    for (let s = 0; s < ns; s++) v.setFloat32(s * 4, Math.sin(s * 0.37), false);
  }

  const traceHeader = (t, out) => {
    out.fill(0);
    const v = new DataView(out.buffer, out.byteOffset, 240);
    const il = 1 + Math.floor(t / nXl);
    const xl = 101 + (t % nXl);
    v.setInt32(188, il, false);
    v.setInt32(192, xl, false);
    v.setInt16(70, -100, false);
    v.setInt32(180, (500000 + (xl - 101) * 25) * 100, false);
    v.setInt32(184, (6700000 + (il - 1) * 25) * 100, false);
    v.setInt16(114, ns, false);
    v.setInt16(116, dtUs, false);
  };

  const scratchHeader = new Uint8Array(240);

  return {
    size,
    async read(offset, length) {
      if (offset < 0 || offset + length > size) {
        throw new Error(`Read out of range: ${offset}+${length} of ${size}`);
      }
      const out = new Uint8Array(length);
      let pos = offset;
      let done = 0;
      while (done < length) {
        if (pos < 3600) {
          const n = Math.min(3600 - pos, length - done);
          out.set(headerBlock.subarray(pos, pos + n), done);
          pos += n;
          done += n;
          continue;
        }
        const rel = pos - 3600;
        const t = Math.floor(rel / traceBytes);
        const within = rel - t * traceBytes;
        if (within < 240) {
          traceHeader(t, scratchHeader);
          const n = Math.min(240 - within, length - done);
          out.set(scratchHeader.subarray(within, within + n), done);
          pos += n;
          done += n;
        } else {
          const sOff = within - 240;
          const n = Math.min(ns * 4 - sOff, length - done);
          out.set(samples.subarray(sOff, sOff + n), done);
          pos += n;
          done += n;
        }
      }
      return out.buffer;
    },
  };
}

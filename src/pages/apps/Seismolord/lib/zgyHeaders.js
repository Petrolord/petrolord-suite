// A ZGY's SEG-Y view for header-only readers (owner report 2026-10-17: the
// import hung at "Scanning headers" on a real ZGY). The scan, the trace-delay
// check, the door and the gathers check read only the 240-byte trace headers,
// but they read whole traces in chunks; on a ZGY view every chunk made the
// reader fetch (or decompress) whole bricks, so a sampled scan of a large
// survey read most of the file. This view answers each trace's header from the
// ZGY view (headers are synthesised, no brick is touched) and returns zeros
// for the sample bytes. Use it only where samples are not read; conversion,
// crop and preview keep the full view. Pure apart from the view it wraps.

const HEAD = 3600;
const TH = 240;

/**
 * @param {import('../engine/reader').ByteReader & {zgy: {layout: {traceBytes: number}}}} view zgySegyReader()
 * @returns {import('../engine/reader').ByteReader}
 */
export function zgyHeadersOnlyReader(view) {
  const tb = view.zgy.layout.traceBytes;
  return {
    size: view.size,
    zgy: view.zgy,
    headersOnly: true,
    async read(offset, length) {
      if (offset < 0 || offset + length > view.size) throw new Error(`Read out of range: ${offset}+${length} of ${view.size}`);
      const out = new Uint8Array(length);   // sample bytes stay zero
      const end = offset + length;
      if (offset < HEAD) {
        const n = Math.min(HEAD, end) - offset;
        out.set(new Uint8Array(await view.read(offset, n)), 0);
      }
      const from = Math.max(offset, HEAD);
      if (from >= end) return out.buffer;
      const t0 = Math.floor((from - HEAD) / tb);
      const t1 = Math.floor((end - 1 - HEAD) / tb);
      for (let t = t0; t <= t1; t++) {
        const hs = HEAD + t * tb;
        const a = Math.max(hs, offset);
        const b = Math.min(hs + TH, end);
        if (b > a) out.set(new Uint8Array(await view.read(a, b - a)), a - offset);
      }
      return out.buffer;
    },
  };
}

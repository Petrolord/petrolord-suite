// SEG-Y rev 1 writer (3D post-stack), IBM or IEEE float.
// ============================================================================
// Byte positions follow the convention the Seismolord scanner proposes:
// inline 189, crossline 193, CDP X 181, CDP Y 185. The scanner reads the
// traces rather than trusting the textual header, so the header here is a
// note, exactly as the Episode 6 script says it should be treated.
// ============================================================================

const EBCDIC = (() => {
  // ASCII -> EBCDIC (cp037) for the printable set we use.
  const map = new Uint8Array(256).fill(0x40);
  const table = {
    ' ': 0x40, '.': 0x4b, '<': 0x4c, '(': 0x4d, '+': 0x4e, '|': 0x4f,
    '&': 0x50, '!': 0x5a, '$': 0x5b, '*': 0x5c, ')': 0x5d, ';': 0x5e,
    '-': 0x60, '/': 0x61, ',': 0x6b, '%': 0x6c, '_': 0x6d, '>': 0x6e, '?': 0x6f,
    ':': 0x7a, '#': 0x7b, '@': 0x7c, "'": 0x7d, '=': 0x7e, '"': 0x7f,
  };
  for (const [ch, code] of Object.entries(table)) map[ch.charCodeAt(0)] = code;
  const runs = [['a', 0x81, 9], ['j', 0x91, 9], ['s', 0xa2, 8],
    ['A', 0xc1, 9], ['J', 0xd1, 9], ['S', 0xe2, 8], ['0', 0xf0, 10]];
  for (const [start, code, n] of runs) {
    for (let i = 0; i < n; i += 1) map[start.charCodeAt(0) + i] = code + i;
  }
  return map;
})();

function textualHeader(lines) {
  const buf = Buffer.alloc(3200, 0x40);
  for (let i = 0; i < 40; i += 1) {
    const text = `C${String(i + 1).padStart(2, ' ')} ${lines[i] ?? ''}`.slice(0, 80);
    for (let j = 0; j < text.length; j += 1) {
      buf[i * 80 + j] = EBCDIC[text.charCodeAt(j) & 0xff];
    }
  }
  return buf;
}

/** IEEE float -> 4-byte IBM 360 hexadecimal float, big endian. */
export function toIbm(value) {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const sign = value < 0 ? 1 : 0;
  let v = Math.abs(value);
  let exp = 0;
  while (v >= 1) { v /= 16; exp += 1; }
  while (v < 1 / 16 && v > 0) { v *= 16; exp -= 1; }
  let frac = Math.round(v * 0x1000000);
  if (frac >= 0x1000000) { frac = Math.round(frac / 16); exp += 1; }
  const biased = exp + 64;
  if (biased < 0) return 0;
  if (biased > 127) return (sign << 31) | (127 << 24) | 0xffffff;
  return ((sign << 31) | (biased << 24) | (frac & 0xffffff)) >>> 0;
}

/**
 * @param {object} o
 * @param {number} o.nInline @param {number} o.nXline @param {number} o.ns
 * @param {number} o.dtUs sample interval, microseconds
 * @param {number} o.formatCode 1 = IBM float, 5 = IEEE float
 * @param {(il:number, xl:number)=>Float32Array} o.trace
 * @param {(il:number, xl:number)=>{x:number,y:number}} o.coords
 * @param {number} o.il0 @param {number} o.xl0
 * @param {Array<string>} o.textLines
 * @param {number} [o.coordScalar] negative divides; -100 keeps centimetres
 */
export function writeSegy(o) {
  const {
    nInline, nXline, ns, dtUs, formatCode, trace, coords, il0, xl0,
    textLines, coordScalar = -100,
  } = o;
  const traceBytes = 240 + ns * 4;
  const total = 3600 + nInline * nXline * traceBytes;
  const buf = Buffer.alloc(total);
  textualHeader(textLines).copy(buf, 0);

  // Binary header
  const bh = buf.subarray(3200, 3600);
  bh.writeInt32BE(1, 4);            // 3205-3208 line number
  bh.writeInt16BE(1, 12);           // 3213-3214 traces per ensemble
  bh.writeInt16BE(dtUs, 16);        // 3217-3218 sample interval
  bh.writeInt16BE(dtUs, 18);        // 3219-3220 field sample interval
  bh.writeInt16BE(ns, 20);          // 3221-3222 samples per trace
  bh.writeInt16BE(ns, 22);          // 3223-3224 field samples per trace
  bh.writeInt16BE(formatCode, 24);  // 3225-3226 format code
  bh.writeInt16BE(4, 28);           // 3229-3230 trace sorting: 4 = horizontally stacked
  bh.writeInt16BE(1, 54);           // 3255-3256 measurement system: 1 = metres
  bh.writeInt16BE(0x0100, 300);     // 3501-3502 SEG-Y rev 1.0
  bh.writeInt16BE(1, 302);          // 3503-3504 fixed length trace flag
  bh.writeInt16BE(0, 304);          // 3505-3506 extended textual headers

  let off = 3600;
  let seq = 1;
  for (let i = 0; i < nInline; i += 1) {
    for (let x = 0; x < nXline; x += 1) {
      const il = il0 + i;
      const xl = xl0 + x;
      const { x: cx, y: cy } = coords(il, xl);
      const th = buf.subarray(off, off + 240);
      th.writeInt32BE(seq, 0);                       // 1-4   sequence in line
      th.writeInt32BE(seq, 4);                       // 5-8   sequence in file
      th.writeInt32BE(il, 8);                        // 9-12  field record
      th.writeInt32BE(seq, 20);                      // 21-24 ensemble (CDP)
      th.writeInt16BE(1, 28);                        // 29-30 trace id: 1 = live
      th.writeInt16BE(coordScalar, 70);              // 71-72 coordinate scalar
      th.writeInt32BE(Math.round(cx * 100), 72);     // 73-76 source X
      th.writeInt32BE(Math.round(cy * 100), 76);     // 77-80 source Y
      th.writeInt32BE(Math.round(cx * 100), 80);     // 81-84 group X
      th.writeInt32BE(Math.round(cy * 100), 84);     // 85-88 group Y
      th.writeInt16BE(1, 88);                        // 89-90 coordinate units: length
      th.writeInt16BE(ns, 114);                      // 115-116 samples
      th.writeInt16BE(dtUs, 116);                    // 117-118 sample interval
      th.writeInt32BE(Math.round(cx * 100), 180);    // 181-184 CDP X
      th.writeInt32BE(Math.round(cy * 100), 184);    // 185-188 CDP Y
      th.writeInt32BE(il, 188);                      // 189-192 inline
      th.writeInt32BE(xl, 192);                      // 193-196 crossline
      const samples = trace(il, xl);
      let p = off + 240;
      for (let s = 0; s < ns; s += 1) {
        if (formatCode === 1) buf.writeUInt32BE(toIbm(samples[s]), p);
        else buf.writeFloatBE(samples[s], p);
        p += 4;
      }
      off += traceBytes;
      seq += 1;
    }
  }
  return buf;
}

// Small SEG-Y writer for the Seismolord hostile file set (SEIS-U1, PL2).
// Pure: returns a Uint8Array. Node, the browser and jest all import it,
// so the committed .sgy files and the jest cases come from one recipe.
//
// Every option models a real-world variation in the files interpreters
// bring from Petrel, Kingdom, OpendTect, ProMAX and field tapes.

const EBCDIC = (() => {
  const m = new Map();
  const put = (code, chars) => { for (let i = 0; i < chars.length; i++) m.set(chars[i], code + i); };
  m.set(' ', 0x40);
  put(0x4b, '.<(+|');
  m.set('&', 0x50);
  put(0x5a, '!$*);^');
  put(0x60, '-/');
  put(0x6b, ',%_>?');
  put(0x7a, ':#@\'="');
  put(0x81, 'abcdefghi');
  put(0x91, 'jklmnopqr');
  put(0xa2, 'stuvwxyz');
  put(0xc1, 'ABCDEFGHI');
  put(0xd1, 'JKLMNOPQR');
  put(0xe2, 'STUVWXYZ');
  put(0xf0, '0123456789');
  return m;
})();

/** IEEE number -> IBM System/360 single word (truncating, as ProMAX does). */
export function numberToIbm32(v) {
  if (v === 0 || !Number.isFinite(v)) return 0;
  const sign = v < 0 ? 0x80000000 : 0;
  let a = Math.abs(v);
  let exp = 64;
  while (a >= 1) { a /= 16; exp += 1; }
  while (a < 1 / 16) { a *= 16; exp -= 1; }
  const frac = Math.floor(a * 0x1000000) & 0xffffff;
  return (sign | (exp << 24) | frac) >>> 0;
}

/** The deterministic test amplitude: a dipping Ricker-like event plus a flat one. */
export function amplitude(il, xl, s, ns) {
  const t1 = ns * 0.35 + il * 0.6 + xl * 0.3;
  const t2 = ns * 0.7;
  const r = (t) => { const a = (s - t) / 2.2; return (1 - 2 * a * a) * Math.exp(-a * a); };
  return 1000 * r(t1) - 600 * r(t2) + 3 * Math.sin(il * 7 + xl * 3 + s);
}

/**
 * @param {Object} o
 * @param {number} [o.nIl] @param {number} [o.nXl] @param {number} [o.ns]
 * @param {number} [o.dtUs] true sample interval (µs, or mm/cm for depth files)
 * @param {number} [o.formatCode] 1 IBM, 5 IEEE, 2 int32, 3 int16, 8 int8
 * @param {boolean} [o.littleEndian] byte-swapped file (SEG-Y rev 2 allows it)
 * @param {number} [o.revision] 0, 1 or 2 (binary header bytes 3501-3502)
 * @param {number} [o.extTextHeaders] rev 1 extended textual headers (bytes 3505-3506)
 * @param {?number} [o.binDtUs] binary-header dt override (0 = unset, as field tapes do)
 * @param {?number} [o.binNs] binary-header ns override (a lying header)
 * @param {boolean} [o.traceDtNs] write ns/dt into trace bytes 115/117 (default true)
 * @param {number} [o.ilByte] @param {number} [o.xlByte]
 * @param {'inline'|'crossline'} [o.order]
 * @param {(il:number, xl:number) => boolean} [o.skip] traces absent from the file
 * @param {number} [o.scalar] byte 71 coordinate scalar
 * @param {number} [o.coordUnits] byte 89 (1 length, 2 arc-seconds, 3 degrees)
 * @param {number} [o.measurementSystem] binary 3255 (1 m, 2 ft)
 * @param {(il:number, xl:number) => {x:number, y:number}} [o.xy] world coordinates
 * @param {number} [o.il0] @param {number} [o.xl0] @param {number} [o.ilStep] @param {number} [o.xlStep]
 * @param {string} [o.text] textual header text (40 x 80 characters are cut from it)
 * @param {boolean} [o.asciiText] ASCII textual header (default EBCDIC)
 * @param {number} [o.cdpByte21] also write the CDP number at byte 21 (2D files)
 */
export function writeSegy(o = {}) {
  const {
    nIl = 8, nXl = 6, ns = 40, dtUs = 4000, formatCode = 5, littleEndian = false,
    revision = 1, extTextHeaders = 0, binDtUs = null, binNs = null, traceDtNs = true,
    ilByte = 189, xlByte = 193, order = 'inline', skip = null,
    scalar = -100, coordUnits = 1, measurementSystem = 1,
    il0 = 1001, xl0 = 2001, ilStep = 1, xlStep = 1,
    xy = (il, xl) => ({ x: 500000 + (xl - xl0) * 25, y: 700000 + (il - il0) * 25 }),
    text = 'C 1 PETROLORD HOSTILE SEG-Y SET', asciiText = false,
  } = o;
  const le = littleEndian;
  const bps = { 1: 4, 5: 4, 2: 4, 3: 2, 8: 1 }[formatCode] || 4;
  const traceBytes = 240 + ns * bps;
  const cells = [];
  const outer = order === 'inline' ? nIl : nXl;
  const inner = order === 'inline' ? nXl : nIl;
  for (let a = 0; a < outer; a++) {
    for (let b = 0; b < inner; b++) {
      const i = order === 'inline' ? a : b;
      const x = order === 'inline' ? b : a;
      const il = il0 + i * ilStep;
      const xl = xl0 + x * xlStep;
      if (skip && skip(il, xl)) continue;
      cells.push({ i, x, il, xl });
    }
  }
  const head = 3600 + extTextHeaders * 3200;
  const buf = new ArrayBuffer(head + cells.length * traceBytes);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // textual header
  const line = (n) => {
    const src = text.split('\n')[n] ?? (n === 0 ? text : `C${String(n + 1).padStart(2)}`);
    return src.padEnd(80).slice(0, 80);
  };
  for (let n = 0; n < 40; n++) {
    const l = line(n);
    for (let c = 0; c < 80; c++) {
      const ch = l[c];
      u8[n * 80 + c] = asciiText ? ch.charCodeAt(0) : (EBCDIC.get(ch) ?? 0x40);
    }
  }
  for (let e = 0; e < extTextHeaders; e++) {
    const t = e === extTextHeaders - 1 ? '((SEG: EndText))' : `((SEG: extended header ${e + 1}))`;
    for (let c = 0; c < 3200; c++) u8[3600 + e * 3200 + c] = asciiText ? (t[c] || ' ').charCodeAt(0) : (EBCDIC.get(t[c] || ' ') ?? 0x40);
  }
  // binary header
  const B = 3200;
  dv.setInt16(B + 16, binDtUs ?? dtUs, le);
  dv.setInt16(B + 20, binNs ?? ns, le);
  dv.setInt16(B + 24, formatCode, le);
  dv.setInt16(B + 28, 1, le); // ensemble fold... keep plain
  dv.setInt16(B + 54, measurementSystem, le);
  if (revision >= 2) dv.setUint32(B + 96, 0x01020304, le); // 3297-3300 byte-order constant
  // 3501-3502 revision: rev1 = 0x0100, rev2 = 0x0200 (major byte first)
  u8[B + 300] = revision;
  u8[B + 301] = 0;
  dv.setInt16(B + 302, 1, le); // fixed-length traces
  dv.setInt16(B + 304, extTextHeaders, le);
  // traces
  cells.forEach((c, t) => {
    const off = head + t * traceBytes;
    dv.setInt32(off + 0, t + 1, le);                  // trace seq in line
    dv.setInt32(off + 4, t + 1, le);                  // trace seq in file
    dv.setInt32(off + ilByte - 1, c.il, le);
    dv.setInt32(off + xlByte - 1, c.xl, le);
    if (o.cdpByte21) dv.setInt32(off + 20, c.xl, le);
    dv.setInt16(off + 70, scalar, le);
    const w = xy(c.il, c.xl);
    const f = scalar < 0 ? -scalar : scalar > 1 ? 1 / scalar : 1;
    dv.setInt32(off + 72, Math.round(w.x * f), le);   // source X (73)
    dv.setInt32(off + 76, Math.round(w.y * f), le);   // source Y (77)
    dv.setInt16(off + 88, coordUnits, le);
    if (traceDtNs) {
      dv.setInt16(off + 114, ns, le);                 // 115
      dv.setInt16(off + 116, dtUs, le);               // 117
    }
    dv.setInt32(off + 180, Math.round(w.x * f), le);  // CDP X (181)
    dv.setInt32(off + 184, Math.round(w.y * f), le);  // CDP Y (185)
    for (let s = 0; s < ns; s++) {
      const a = amplitude(c.il, c.xl, s, ns);
      const p = off + 240 + s * bps;
      if (formatCode === 1) dv.setUint32(p, numberToIbm32(a), le);
      else if (formatCode === 5) dv.setFloat32(p, a, le);
      else if (formatCode === 2) dv.setInt32(p, Math.round(a * 1000), le);
      else if (formatCode === 3) dv.setInt16(p, Math.round(a * 10), le);
      else if (formatCode === 8) dv.setInt8(p, Math.max(-127, Math.min(127, Math.round(a / 10))));
    }
  });
  return u8;
}

/** The hostile set: name -> { options, note }. */
export const HOSTILE_SEGY = {
  'rev0_ibm_ebcdic_9_21.sgy': {
    note: 'Rev 0 field-era file: IBM floats, EBCDIC header, inline at byte 9 and crossline at byte 21 (no 189/193).',
    options: { formatCode: 1, revision: 0, ilByte: 9, xlByte: 21 },
  },
  'rev1_ieee_clean.sgy': {
    note: 'Control: rev 1, IEEE, 189/193, full rectangle, metres.',
    options: { formatCode: 5, revision: 1 },
  },
  'rev1_ext_textual.sgy': {
    note: 'Rev 1 with two extended textual headers (bytes 3505-3506 = 2): traces start at byte 10,001.',
    options: { formatCode: 5, revision: 1, extTextHeaders: 2 },
  },
  'rev2_little_endian.sgy': {
    note: 'Rev 2 byte-swapped (little-endian) file, byte-order constant 0x01020304 at 3297.',
    options: { formatCode: 5, revision: 2, littleEndian: true },
  },
  'fmt3_int16.sgy': {
    note: 'Format code 3 (two-byte integers), common from older processing shops.',
    options: { formatCode: 3 },
  },
  'bin_dt_zero.sgy': {
    note: 'Binary-header sample interval 0 (unset); the trace headers carry 4 ms.',
    options: { binDtUs: 0 },
  },
  'bin_ns_lies.sgy': {
    note: 'Binary header says 30 samples; the traces hold 40 (trace byte 115 says 40).',
    options: { binNs: 30 },
  },
  'irregular_outline.sgy': {
    note: 'Irregular survey outline: the corner triangles hold no traces (they are absent from the file).',
    options: { skip: (il, xl) => (il - 1001) + (xl - 2001) < 3 || (il - 1001) - (xl - 2001) > 4 },
  },
  'crossline_sorted.sgy': {
    note: 'Crossline-sorted traces (common from Kingdom exports).',
    options: { order: 'crossline' },
  },
  'no_coordinates.sgy': {
    note: 'Every X, Y and scalar is zero (a processed cube exported without coordinates).',
    options: { scalar: 0, xy: () => ({ x: 0, y: 0 }) },
  },
  'feet_state_plane_scalar0.sgy': {
    note: 'US state plane feet, scalar 0, binary measurement system 2 (feet).',
    options: {
      scalar: 0, measurementSystem: 2,
      xy: (il, xl) => ({ x: 2200000 + (xl - 2001) * 82.5, y: 13700000 + (il - 1001) * 82.5 }),
    },
  },
  'degrees_coords.sgy': {
    note: 'Coordinates in decimal degrees (byte 89 = 3), scalar -10000.',
    options: {
      scalar: -10000, coordUnits: 3,
      xy: (il, xl) => ({ x: 6.5 + (xl - 2001) * 0.00025, y: 4.8 + (il - 1001) * 0.00025 }),
    },
  },
  'depth_psdm.sgy': {
    note: 'A depth-migrated (PSDM) cube: sample interval 5000 = 5 m, the textual header says DEPTH.',
    options: {
      dtUs: 5000,
      text: 'C 1 CLIENT PETROLORD  PSDM DEPTH VOLUME\nC 2 SAMPLE INTERVAL 5 M  DEPTH DOMAIN  Z UNIT METRES',
    },
  },
  'line2d_cdp21.sgy': {
    note: 'A 2D line: one inline value, CDP at byte 21, crooked navigation.',
    options: {
      nIl: 1, nXl: 40, cdpByte21: 1,
      xy: (il, xl) => ({ x: 500000 + (xl - 2001) * 12.5, y: 700000 + Math.sin((xl - 2001) / 6) * 40 }),
    },
  },
};

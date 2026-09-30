// The SEG-Y door (SEIS-U1-001..006): what the importer checks BEFORE the
// engines read a file, so a valid file that is merely unusual imports
// correctly and an inconsistent one stops with its reason.
//
// Owner rule (tester programme 2026-09-22): confirm the headers (samples,
// interval, format code, trace count, IL/XL ranges, sort) and STOP if they
// disagree. The engines (vendored, packages/engines) read the classic
// layout: big-endian, traces from byte 3601, samples and interval from the
// binary header. This module adapts real files to that contract without
// touching the engines:
//
//  - rev 1/2 extended textual headers (binary bytes 3505-3506) are skipped
//    through a remapping reader, so traces start where the file says;
//  - a binary header whose sample interval or sample count is unset (0,
//    common on field tapes and some exports) takes the trace headers'
//    value (bytes 115 and 117), said as a warning;
//  - the binary and trace headers disagreeing on either value, both
//    intervals unset, a byte-swapped (little-endian) file and a sample
//    format other than IBM or IEEE float are refused with the reason.
//
// Pure apart from the reader; jest-tested on the hostile set in
// e2e/fixtures/seis/hostile/.

const TEXT = 3200;
const BIN = 400;
const HEAD = TEXT + BIN;
const TRACE_HEADER = 240;
const EXT_BLOCK = 3200;
const MAX_EXT = 100;

/** Named refusal: the file is readable but must not import as it is. */
export class SegyDoorRefusal extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'Error';
    this.code = code;
  }
}

export const SAMPLE_FORMATS = Object.freeze({
  1: '4-byte IBM floating point',
  2: '4-byte two\'s complement integer',
  3: '2-byte two\'s complement integer',
  4: '4-byte fixed point with gain (obsolete)',
  5: '4-byte IEEE floating point',
  6: '8-byte IEEE floating point',
  7: '3-byte two\'s complement integer',
  8: '1-byte two\'s complement integer',
  9: '8-byte two\'s complement integer',
  10: '4-byte unsigned integer',
  11: '2-byte unsigned integer',
  12: '8-byte unsigned integer',
  15: '3-byte unsigned integer',
  16: '1-byte unsigned integer',
});

/** Byte-89 coordinate units (SEG-Y rev 1). */
export const COORD_UNITS = Object.freeze({
  1: 'length (metres or feet)',
  2: 'arc-seconds',
  3: 'decimal degrees',
  4: 'degrees, minutes, seconds (DMS)',
});

const SUPPORTED_FORMATS = new Set([1, 5]);
const DEPTH_WORDS = /\b(DEPTH|PSDM|PRE-?STACK DEPTH|DEPTH[- ]MIGRAT\w*|Z UNIT|TVDSS)\b/i;
const TIME_WORDS = /\b(PSTM|TIME[- ]MIGRAT\w*|TWT|TWO[- ]WAY TIME|MILLISECONDS?|\bMS\b)\b/i;

const i16 = (dv, pos, le) => dv.getInt16(pos, le);
const i32 = (dv, pos, le) => dv.getInt32(pos, le);

/** Does the textual header say the volume is in depth? A HINT, never a decision. */
export function depthDomainHint(textLines) {
  const text = (textLines || []).join('\n');
  if (!DEPTH_WORDS.test(text)) return null;
  const m = text.match(DEPTH_WORDS);
  return { word: m[0].trim(), alsoTime: TIME_WORDS.test(text) };
}

const isEbcdicText = (b) => b === 0x40 || (b >= 0x4b && b <= 0x7f) || (b >= 0x81 && b <= 0xa9)
  || (b >= 0xc1 && b <= 0xe9) || (b >= 0xf0 && b <= 0xf9);
const isAsciiText = (b) => b >= 0x20 && b < 0x7f;

/** Are the 240 bytes at `offset` text (an extended textual header)? */
async function looksLikeText(reader, offset) {
  const bytes = new Uint8Array(await reader.read(offset, TRACE_HEADER));
  let ebcdic = 0;
  let ascii = 0;
  for (const b of bytes) {
    if (isEbcdicText(b)) ebcdic += 1;
    if (isAsciiText(b)) ascii += 1;
  }
  return Math.max(ebcdic, ascii) >= 0.9 * bytes.length;
}

async function countStanzas(reader, start) {
  // ext = -1 (rev 1): variable count, the last one holds ((SEG: EndText))
  for (let n = 0; n < MAX_EXT; n++) {
    const off = start + n * EXT_BLOCK;
    if (off + EXT_BLOCK > reader.size) return null;
    // eslint-disable-next-line no-await-in-loop
    const bytes = new Uint8Array(await reader.read(off, EXT_BLOCK));
    const ascii = String.fromCharCode(...bytes.map((b) => (b >= 0x20 && b < 0x7f ? b : 0x20)));
    // EBCDIC "((SEG: EndText))" is 4D 4D E2 C5 C7 7A 40 C5 95 84 E3 85 A7 A3 5D 5D
    let ebcdic = false;
    for (let i = 0; i + 16 <= bytes.length; i++) {
      if (bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 2] === 0xe2 && bytes[i + 3] === 0xc5) {
        ebcdic = true;
        break;
      }
    }
    if (/\(\(SEG: *EndText\)\)/i.test(ascii) || ebcdic) return n + 1;
  }
  return null;
}

/**
 * Inspect a SEG-Y's headers.
 * @param {import('../engine/reader').ByteReader} reader
 * @returns {Promise<Object>} door: {byteOrder, revision, extTextHeaders,
 *   dataStart, formatCode, binNs, binDtUs, traceNs, traceDtUs, ns, dtUs,
 *   coordUnits, zeroCoordinates, warnings[], patches}
 * @throws {SegyDoorRefusal}
 */
export async function inspectSegy(reader) {
  if (reader.size < HEAD) {
    throw new SegyDoorRefusal(`File is too small to be a SEG-Y (${reader.size} bytes; the textual `
      + 'and binary headers alone are 3,600 bytes).', 'too-small');
  }
  const bin = new DataView(await reader.read(TEXT, BIN));
  const fmtBe = i16(bin, 24, false);
  const fmtLe = i16(bin, 24, true);
  const orderBe = bin.getUint32(96, false);
  const littleEndian = orderBe === 0x04030201
    || (!SAMPLE_FORMATS[fmtBe] && Boolean(SAMPLE_FORMATS[fmtLe]));
  if (littleEndian) {
    throw new SegyDoorRefusal('This SEG-Y is byte-swapped (little-endian): its binary header reads '
      + `format code ${fmtLe} only when the bytes are reversed. Seismolord reads the standard `
      + 'big-endian layout. Export the volume again as big-endian SEG-Y (the default in Petrel, '
      + 'Kingdom, OpendTect and segyio) and import that file.', 'little-endian');
  }
  const formatCode = fmtBe;
  if (!SUPPORTED_FORMATS.has(formatCode)) {
    const what = SAMPLE_FORMATS[formatCode];
    throw new SegyDoorRefusal(`The samples are ${what ? `${what} (format code ${formatCode})` : `in an `
      + `unknown format (code ${formatCode})`}. Seismolord imports IBM floating point (code 1) and `
      + 'IEEE floating point (code 5). Export the volume again as 32-bit float SEG-Y.', 'format');
  }
  const revision = new Uint8Array(bin.buffer, bin.byteOffset + 300, 1)[0];
  const binDtUs = i16(bin, 16, false);
  const binNs = i16(bin, 20, false);
  const warnings = [];

  // Extended textual headers: honoured only in rev 1 and 2 files (the
  // bytes are unassigned in rev 0 and hold junk in the wild).
  let extTextHeaders = 0;
  const extWord = i16(bin, 304, false);
  if (revision === 1 || revision === 2) {
    if (extWord > 0 && extWord <= MAX_EXT && HEAD + extWord * EXT_BLOCK < reader.size) {
      extTextHeaders = extWord;
    } else if (extWord === -1) {
      const n = await countStanzas(reader, HEAD);
      if (n) extTextHeaders = n;
    }
  }
  let dataStart = HEAD + extTextHeaders * EXT_BLOCK;

  const readTrace0 = async (start) => (reader.size >= start + TRACE_HEADER
    ? new DataView(await reader.read(start, TRACE_HEADER)) : null);
  let th = await readTrace0(dataStart);
  // A header claiming extended blocks that are not there is a stale word:
  // extended textual headers are text (EBCDIC or ASCII), a trace header is
  // mostly binary zeros. Trust the bytes.
  if (extTextHeaders && !(await looksLikeText(reader, HEAD))) {
    warnings.push(`The binary header announces ${extTextHeaders} extended textual header(s), `
      + 'but the traces start straight after the binary header; the announcement was ignored.');
    extTextHeaders = 0;
    dataStart = HEAD;
    th = await readTrace0(dataStart);
  }
  if (extTextHeaders) {
    warnings.push(`${extTextHeaders} extended textual header${extTextHeaders === 1 ? '' : 's'} `
      + `(${(extTextHeaders * EXT_BLOCK).toLocaleString('en-US')} bytes) skipped; traces start at byte `
      + `${(dataStart + 1).toLocaleString('en-US')}.`);
  }
  if (!th) {
    throw new SegyDoorRefusal('No traces found in file.', 'no-traces');
  }
  const traceNs = i16(th, 114, false);
  const traceDtUs = i16(th, 116, false);

  // samples per trace
  let ns = binNs;
  let nsPatched = false;
  const bytesPerSample = 4;
  const fits = (n) => n > 0 && (reader.size - dataStart) % (TRACE_HEADER + n * bytesPerSample) === 0;
  if (binNs > 0 && traceNs > 0 && binNs !== traceNs) {
    const which = fits(traceNs) && !fits(binNs) ? ` The file size fits ${traceNs} samples per trace.`
      : fits(binNs) && !fits(traceNs) ? ` The file size fits ${binNs} samples per trace.` : '';
    throw new SegyDoorRefusal(`The headers disagree on the number of samples per trace: the binary `
      + `header says ${binNs}, the first trace header (byte 115) says ${traceNs}.${which} Seismolord `
      + 'stops rather than guess, because a wrong count shifts every trace after the first. Correct '
      + 'the header in the exporting application and import again.', 'ns-mismatch');
  }
  if (binNs <= 0) {
    if (traceNs > 0) {
      ns = traceNs;
      nsPatched = true;
      warnings.push(`The binary header gives no sample count; ${traceNs} samples per trace were read `
        + 'from the trace headers (byte 115).');
    } else {
      throw new SegyDoorRefusal('Neither the binary header nor the first trace header gives the '
        + 'number of samples per trace.', 'ns-missing');
    }
  }

  // sample interval
  let dtUs = binDtUs;
  let dtPatched = false;
  if (binDtUs > 0 && traceDtUs > 0 && binDtUs !== traceDtUs) {
    throw new SegyDoorRefusal(`The headers disagree on the sample interval: the binary header says `
      + `${binDtUs / 1000} ms, the first trace header (byte 117) says ${traceDtUs / 1000} ms. `
      + 'Seismolord stops rather than guess, because the interval sets every time on the axis. '
      + 'Correct the header in the exporting application and import again.', 'dt-mismatch');
  }
  if (binDtUs <= 0) {
    if (traceDtUs > 0) {
      dtUs = traceDtUs;
      dtPatched = true;
      warnings.push(`The binary header gives no sample interval; ${traceDtUs / 1000} ms was read from `
        + 'the trace headers (byte 117).');
    } else {
      throw new SegyDoorRefusal('Neither the binary header nor the first trace header gives the '
        + 'sample interval, so no time axis can be built.', 'dt-missing');
    }
  }

  const coordUnits = i16(th, 88, false);
  if (coordUnits === 3 || coordUnits === 4) {
    warnings.push(`The trace headers declare coordinates in ${COORD_UNITS[coordUnits]} (byte 89 = `
      + `${coordUnits}). Declare a geographic CRS for this file, or check the preview X and Y before `
      + 'choosing a projected one.');
  }
  const zeroCoordinates = [180, 184, 72, 76].every((p) => i32(th, p, false) === 0);
  if (zeroCoordinates) {
    warnings.push('The first trace carries no coordinates (CDP and source X/Y are zero). If the '
      + 'whole file has none, declare it Local (engineering grid): maps, wells and surfaces '
      + 'will not line up with it.');
  }

  return {
    byteOrder: 'big',
    revision,
    extTextHeaders,
    dataStart,
    formatCode,
    binNs,
    binDtUs,
    traceNs,
    traceDtUs,
    ns,
    dtUs,
    coordUnits,
    zeroCoordinates,
    warnings,
    patches: { ns: nsPatched, dt: dtPatched },
  };
}

/**
 * A reader presenting the file in the layout the engines expect: the
 * 3,600 header bytes (binary sample count and interval filled in when the
 * door took them from the trace headers, extended-header count zeroed)
 * followed directly by the traces.
 */
export function doorReader(reader, door) {
  const shift = door.dataStart - HEAD;
  if (!shift && !door.patches.ns && !door.patches.dt) return reader;
  let headPromise = null;
  const head = () => {
    if (!headPromise) {
      headPromise = reader.read(0, HEAD).then((buf) => {
        const copy = buf.slice(0);
        const dv = new DataView(copy);
        if (door.patches.dt) dv.setInt16(TEXT + 16, door.dtUs, false);
        if (door.patches.ns) dv.setInt16(TEXT + 20, door.ns, false);
        if (shift) dv.setInt16(TEXT + 304, 0, false);
        return copy;
      });
    }
    return headPromise;
  };
  const size = reader.size - shift;
  return {
    size,
    async read(offset, length) {
      if (offset < 0 || offset + length > size) {
        throw new Error(`Read out of range: ${offset}+${length} of ${size}`);
      }
      if (offset >= HEAD) return reader.read(offset + shift, length);
      const h = await head();
      if (offset + length <= HEAD) return h.slice(offset, offset + length);
      const out = new Uint8Array(length);
      out.set(new Uint8Array(h, offset, HEAD - offset), 0);
      out.set(new Uint8Array(await reader.read(HEAD + shift, offset + length - HEAD)), HEAD - offset);
      return out.buffer;
    },
  };
}

/** Inspect and wrap in one step. */
export async function openSegyDoor(reader) {
  const door = await inspectSegy(reader);
  return { door, reader: doorReader(reader, door) };
}

/** True when the traces do not fill a full inline-sorted rectangle, so a
 *  conversion must address them through a trace lattice. */
export function needsTraceLattice(scan) {
  return scan.il.count * scan.xl.count !== scan.totalTraces || scan.inlineSorted === false;
}

const ENGINE_IRREGULAR = /^Grid is not regular under this mapping/;
const ENGINE_UNSORTED = /^Traces are not inline-sorted/;

/**
 * The scan warnings as the import dialog shows them: the door's first,
 * the engine's regularity and sort warnings reworded so they say what
 * happens to an irregular outline or a crossline-sorted file (both
 * import) instead of blaming the byte positions, and a 2D hint.
 */
export function doorScanWarnings(door, scan) {
  const out = [...(door?.warnings || [])];
  const cells = scan.il.count * scan.xl.count;
  for (const w of scan.warnings || []) {
    if (ENGINE_IRREGULAR.test(w)) {
      if (cells > scan.totalTraces && scan.totalTraces >= 0.2 * cells) {
        out.push(`${(cells - scan.totalTraces).toLocaleString('en-US')} of ${cells.toLocaleString('en-US')} `
          + 'inline and crossline positions hold no trace (an irregular survey outline). They import '
          + 'as nulls. If the survey should be a full rectangle, check the inline and crossline byte '
          + 'positions in the preview table.');
      } else {
        out.push(`The inline and crossline numbers give ${cells.toLocaleString('en-US')} positions for `
          + `${scan.totalTraces.toLocaleString('en-US')} traces. Check the inline and crossline byte `
          + 'positions in the preview table.');
      }
    } else if (ENGINE_UNSORTED.test(w)) {
      out.push('Traces are not in inline order (a crossline-sorted or unsorted file). The import '
        + 'indexes every trace header first, which takes one extra pass over the file.');
    } else {
      out.push(w);
    }
  }
  if ((scan.il.count === 1) !== (scan.xl.count === 1) && scan.totalTraces > 1) {
    out.push('Every trace has the same inline (or crossline) number: this looks like a 2D line. '
      + 'Import 2D lines from the 2D Lines section, which keeps their crooked navigation.');
  }
  return out;
}

/** The scan the manifest is built from: a lattice conversion replaces the
 *  preview's inline and crossline ranges (and geometry) with the index's. */
export function scanForManifest(scan, record) {
  const lat = record?.lattice;
  if (!lat) return scan;
  return {
    ...scan,
    il: lat.il,
    xl: lat.xl,
    corners: lat.corners || scan.corners,
    affine: lat.affineRaw || scan.affine,
  };
}

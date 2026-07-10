// Automatic SEG-Y trace-header geometry detection.
//
// Non-experts should never have to know that inline/crossline live at
// "byte 189". This scans a contiguous sample of trace headers, scores
// every 4-byte int32 slot, and works out which slots hold the inline and
// crossline line numbers (and, best-effort, the X/Y coordinates and the
// coordinate scalar) — so the importer can map the geometry itself and
// only fall back to the manual controls when no grid can be found.
//
// Robustness rationale (validated in headerDetect.test.js):
//  - Line numbers are small and mostly step by 1; coordinates are large
//    and step by the bin spacing — a magnitude cap cleanly separates the
//    two, so eastings never masquerade as crosslines.
//  - The crossline sawtooth (increments within a line, resets at each new
//    inline) must line up with the inline's change points — that
//    alignment is what distinguishes a real (inline, crossline) pair from
//    two unrelated counters.

import {
  TEXT_HEADER_BYTES,
  BIN_HEADER_BYTES,
  TRACE_HEADER_BYTES,
  readHeaderInt32,
  readHeaderInt16,
  applyCoordScalar,
} from './segyDecode';
import { readFileHeaders, DEFAULT_MAPPING } from './segyScan';

// 4-byte-aligned int32 slots in the 240-byte trace header (1-based).
const INT32_SLOTS = [];
for (let p = 1; p <= 237; p += 4) INT32_SLOTS.push(p);

// Standard coordinate slots for X/Y, CDP pair first (the conventional
// choice for stacked interpretation data), then source, then a common
// alternate.
const COORD_PAIRS = [[181, 185], [73, 77], [201, 205]];

const AXIS_MAX_ABS = 1e6;        // line numbers stay well under this
const COORD_MIN_ABS = 1000;      // real world coordinates are large
const SAMPLE_TARGET = 4096;      // trace headers to inspect
const SAMPLE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Read a contiguous run of trace headers into DataViews (one windowed
 * read, headers extracted in memory — never the whole file).
 * @param {import('./reader').ByteReader} reader
 * @param {Object} header readFileHeaders() result
 */
async function sampleHeaders(reader, header) {
  const { traceBytes, totalTraces } = header;
  const byBytes = Math.floor(SAMPLE_MAX_BYTES / traceBytes);
  const count = Math.max(1, Math.min(totalTraces, SAMPLE_TARGET, byBytes));
  const buf = await reader.read(TEXT_HEADER_BYTES + BIN_HEADER_BYTES, count * traceBytes);
  const views = [];
  for (let i = 0; i < count; i++) {
    views.push(new DataView(buf, i * traceBytes, TRACE_HEADER_BYTES));
  }
  return views;
}

/** Per-slot value sequence + summary stats. */
function slotProfile(views, pos) {
  const n = views.length;
  const v = new Array(n);
  let vmin = Infinity;
  let vmax = -Infinity;
  const distinct = new Set();
  let resets = 0;              // v[i] < v[i-1]  (sawtooth teeth)
  let zeros = 0;              // v[i] === v[i-1] (piecewise-constant runs)
  const posDiffs = new Map(); // modal positive step
  for (let i = 0; i < n; i++) {
    const x = readHeaderInt32(views[i], pos);
    v[i] = x;
    if (x < vmin) vmin = x;
    if (x > vmax) vmax = x;
    if (distinct.size < 100000) distinct.add(x);
    if (i > 0) {
      const d = x - v[i - 1];
      if (d < 0) resets += 1;
      else if (d === 0) zeros += 1;
      else posDiffs.set(d, (posDiffs.get(d) || 0) + 1);
    }
  }
  let modalStep = 0;
  let modalCount = 0;
  for (const [d, c] of posDiffs) if (c > modalCount) { modalStep = d; modalCount = c; }
  const posTotal = [...posDiffs.values()].reduce((a, b) => a + b, 0);
  return {
    pos, v, vmin, vmax, distinct: distinct.size, resets, zeros,
    modalStep, modalStepShare: posTotal ? modalCount / posTotal : 0, n,
  };
}

/** Indices where the value changes (for alignment scoring). */
function changeIndices(v) {
  const idx = [];
  for (let i = 1; i < v.length; i++) if (v[i] !== v[i - 1]) idx.push(i);
  return idx;
}

/** Indices where the value resets downward. */
function resetIndices(v) {
  const idx = [];
  for (let i = 1; i < v.length; i++) if (v[i] < v[i - 1]) idx.push(i);
  return idx;
}

const looksLikeLineNumbers = (p) =>
  p.vmin >= 0 && p.vmax <= AXIS_MAX_ABS && p.distinct >= 2;

/**
 * Detect the header mapping for a SEG-Y source.
 *
 * @param {import('./reader').ByteReader} reader
 * @returns {Promise<{
 *   detected: boolean,
 *   mapping: {ilByte:number,xlByte:number,xByte:number,yByte:number,scalarByte:number},
 *   il: {byte:number,min:number,max:number,step:number}|null,
 *   xl: {byte:number,min:number,max:number,step:number}|null,
 *   coords: {xByte:number,yByte:number}|null,
 *   confidence: 'high'|'low'|'none',
 *   note: string,
 * }>}
 */
export async function detectHeaderMapping(reader) {
  const header = await readFileHeaders(reader);
  const views = await sampleHeaders(reader, header);
  const profiles = INT32_SLOTS.map((p) => slotProfile(views, p));

  const axisCandidates = profiles.filter(looksLikeLineNumbers);

  // Fast axis (crossline): sawtooth — real resets, and within a tooth it
  // steps consistently (usually by 1). Reject monotonic global counters
  // (no resets) and constants.
  const fast = axisCandidates
    .filter((p) => p.resets >= 1 && p.modalStepShare >= 0.6 && p.distinct >= 3)
    .map((p) => ({
      p,
      score: p.modalStepShare
        * (p.modalStep === 1 ? 1 : p.modalStep <= 5 ? 0.7 : 0.35)   // small steps preferred
        * (p.vmax <= 1e5 ? 1 : 0.6),                                // small magnitudes preferred
    }))
    .sort((a, b) => b.score - a.score);

  // Slow axis (inline): piecewise constant — mostly equal-to-previous,
  // few distinct values, changes at regular intervals.
  const slow = axisCandidates
    .filter((p) => p.zeros >= p.n * 0.4 && p.distinct >= 2 && p.resets <= p.distinct)
    .map((p) => ({ p, changes: changeIndices(p.v) }))
    .filter((c) => c.changes.length >= 1);

  let best = null;
  for (const f of fast) {
    const fResets = new Set(resetIndices(f.p.v));
    if (fResets.size === 0) continue;
    for (const s of slow) {
      if (s.p.pos === f.p.pos) continue;
      // crossline resets exactly where inline advances → indices align
      const overlap = s.changes.filter((i) => fResets.has(i)).length;
      const align = overlap / Math.max(fResets.size, s.changes.length);
      if (align < 0.6) continue;
      const score = f.score * align
        * (s.p.vmax <= 1e5 ? 1 : 0.6);
      if (!best || score > best.score) {
        best = { score, ilPos: s.p.pos, xlPos: f.p.pos, ilProf: s.p, xlProf: f.p };
      }
    }
  }

  // Coordinate detection: a standard pair whose values are large and vary,
  // and are not the chosen axis slots.
  const chosen = best ? new Set([best.ilPos, best.xlPos]) : new Set();
  let coords = null;
  for (const [xb, yb] of COORD_PAIRS) {
    if (chosen.has(xb) || chosen.has(yb)) continue;
    const px = profiles.find((p) => p.pos === xb);
    const py = profiles.find((p) => p.pos === yb);
    if (px && py
      && Math.max(Math.abs(px.vmin), Math.abs(px.vmax)) >= COORD_MIN_ABS
      && Math.max(Math.abs(py.vmin), Math.abs(py.vmax)) >= COORD_MIN_ABS
      && px.distinct >= 3 && py.distinct >= 3) {
      coords = { xByte: xb, yByte: yb };
      break;
    }
  }

  const scalarByte = DEFAULT_MAPPING.scalarByte;   // byte 71 is fixed by the SEG-Y standard

  if (!best) {
    return {
      detected: false,
      mapping: { ...DEFAULT_MAPPING },
      il: null,
      xl: null,
      coords,
      confidence: 'none',
      note: 'No inline/crossline grid could be found in the trace headers. '
        + 'The headers may be empty (geometry implied by trace order) or use an '
        + 'unusual layout — set the byte positions manually.',
    };
  }

  const stepOf = (prof) => {
    // gcd of adjacent nonzero jumps → line-number increment
    let g = 0;
    for (let i = 1; i < prof.v.length; i++) {
      const d = Math.abs(prof.v[i] - prof.v[i - 1]);
      if (d > 0) g = g === 0 ? d : gcd(g, d);
    }
    return g || 1;
  };
  const mapping = {
    ilByte: best.ilPos,
    xlByte: best.xlPos,
    xByte: coords ? coords.xByte : DEFAULT_MAPPING.xByte,
    yByte: coords ? coords.yByte : DEFAULT_MAPPING.yByte,
    scalarByte,
  };
  return {
    detected: true,
    mapping,
    il: { byte: best.ilPos, min: best.ilProf.vmin, max: best.ilProf.vmax, step: stepOf(best.ilProf) },
    xl: { byte: best.xlPos, min: best.xlProf.vmin, max: best.xlProf.vmax, step: stepOf(best.xlProf) },
    coords,
    confidence: best.score >= 0.7 ? 'high' : 'low',
    note: `Detected inline at byte ${best.ilPos}, crossline at byte ${best.xlPos}`
      + (coords ? `, coordinates at ${coords.xByte}/${coords.yByte}.` : ' (no world coordinates found).'),
  };
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

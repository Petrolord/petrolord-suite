// Well data import (SHARED wells engine — moved out of Seismolord at the second consumer, Well Data Manager G1.3): delimited-text parsing (CSV / tab / whitespace)
// with user column mapping — the SEG-Y header-mapping philosophy
// applied to well files: never assume a layout, always preview.
//
// Domain rules enforced here (Seismolord-WELLS-PLAN.md — violating
// these = bug): deviation MD must strictly increase and inclination
// stay within 0–180°; checkshot T(z) must be STRICTLY MONOTONIC in
// both depth and time — reject with a clear row-numbered message,
// never sort silently. All errors are plain domain Errors.
//
// Pure functions, worker-safe, no I/O.

import { parseDelimitedText } from './tabularFile';

/** Split delimited text into rows. Detects the delimiter per file
 *  (comma / semicolon / tab / whitespace) unless one is given, skips
 *  blank and #-comment lines, and detects a header row.
 *  @param {{delimiter?: ','|';'|'\t'|'whitespace'|'auto'}} [opts]
 *  @returns {{header: ?string[], rows: string[][], delimiter: string}} */
export function parseDelimited(text, opts = {}) {
  // Shared with the workbook path (src/lib/tabularFile.js): delimiter
  // auto-detected unless `opts.delimiter` names one of ',', ';', '\t',
  // 'whitespace'; header detection unchanged from the original.
  return parseDelimitedText(text, opts);
}

/** Column-name heuristics per field, matched case-insensitively against
 *  header cells (whole-cell or prefix). First hit wins. */
const GUESSES = {
  md: ['md', 'depth_md', 'measured', 'meas_depth', 'depth'],
  inc: ['inc', 'incl', 'inclination', 'dev', 'angle'],
  azi: ['azi', 'azim', 'azimuth', 'az'],
  name: ['name', 'top', 'formation', 'surface', 'marker', 'horizon'],
  // checkshots (PT1, 2026-09-03): the column is a DEPTH in whatever
  // reference the user declares (MD | TVD | TVDSS) and a TIME in whatever
  // kind (OWT | TWT); the convention itself is guessed separately by
  // guessCheckshotConvention, so an "owt" header is never read as TWT
  depth: ['md', 'measured', 'tvdss', 'tvd_ss', 'tvd', 'depth', 'z'],
  time: ['owt', 'twt', 'time', 't_ms', 'ms'],
  // legacy field names kept for the buildCheckshots wrapper
  tvdss: ['tvdss', 'tvd_ss', 'tvd', 'z', 'depth'],
  twt: ['twt', 'time', 'owt', 't_ms', 'ms'],
};

/**
 * Convention hints read off a checkshot header row: only the keys the
 * header states clearly are returned, so the form applies them once and
 * never overrides a user's choice.
 * @returns {{depthRef?: 'md'|'tvd'|'tvdss', time?: 'owt'|'twt', depthUnit?: 'm'|'ft'}}
 */
export function guessCheckshotConvention(header) {
  const out = {};
  // underscores, dashes and brackets are separators in header words
  const joined = ` ${(header || []).map((h) => String(h).toLowerCase()).join(' ').replace(/[_\-()[\]/]/g, ' ')} `;
  if (/\bowt\b|\bone\s?way/.test(joined)) out.time = 'owt';
  else if (/\btwt\b|\btwo\s?way/.test(joined)) out.time = 'twt';
  if (/\btvd\s?ss\b|\btvdss\b|\bss\b|subsea/.test(joined)) out.depthRef = 'tvdss';
  else if (/\btvd\b/.test(joined)) out.depthRef = 'tvd';
  else if (/\bmd\b|measured/.test(joined)) out.depthRef = 'md';
  if (/\bft\b|\bfeet\b|\bf\b/.test(joined)) out.depthUnit = 'ft';
  else if (/\bm\b|metre|meter/.test(joined)) out.depthUnit = 'm';
  return out;
}

const M_PER_FT = 0.3048;
const toM = (v, unit) => (unit === 'ft' ? v * M_PER_FT : v);

/** Best-guess column index per requested field, or -1. */
export function guessMapping(header, fields) {
  const out = {};
  const lower = (header || []).map((h) => String(h).toLowerCase());
  const used = new Set();
  for (const f of fields) {
    out[f] = -1;
    for (const key of GUESSES[f] || []) {
      const idx = lower.findIndex((h, i) => !used.has(i)
        && (h === key || h.startsWith(key)));
      if (idx >= 0) { out[f] = idx; used.add(idx); break; }
    }
  }
  return out;
}

const num = (rows, r, col, what) => {
  const v = Number(rows[r][col]);
  if (!Number.isFinite(v)) {
    throw new Error(`Row ${r + 1}: ${what} "${rows[r][col] ?? ''}" is not a number.`);
  }
  return v;
};

/**
 * Deviation stations from mapped columns. MD converts to metres at the
 * door when `mdUnit` is 'ft'.
 * @param {string[][]} rows data rows (no header)
 * @param {{md:number, inc:number, azi:number}} map column indices
 * @param {{mdUnit?: 'm'|'ft'}} [opts]
 * @returns {{md:number, inc:number, azi:number}[]}
 */
export function buildDeviation(rows, map, { mdUnit = 'm' } = {}) {
  if (map.md < 0 || map.inc < 0 || map.azi < 0) {
    throw new Error('Map the MD, inclination and azimuth columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const md = toM(num(rows, r, map.md, 'MD'), mdUnit);
    const inc = num(rows, r, map.inc, 'inclination');
    const azi = num(rows, r, map.azi, 'azimuth');
    if (inc < 0 || inc > 180) {
      throw new Error(`Row ${r + 1}: inclination ${inc}° is outside 0–180°.`);
    }
    if (azi < -360 || azi > 360) {
      throw new Error(`Row ${r + 1}: azimuth ${azi}° is outside ±360° — check the column mapping and units.`);
    }
    if (out.length && !(md > out[out.length - 1].md)) {
      throw new Error(`Row ${r + 1}: MD ${md} does not increase `
        + `(previous station is at ${out[out.length - 1].md}).`);
    }
    out.push({ md, inc, azi });
  }
  if (out.length < 2) throw new Error('A deviation survey needs at least 2 stations.');
  return out;
}

/**
 * Tops from mapped columns.
 * @param {{name:number, md:number}} map
 * @returns {{name:string, md:number}[]}
 */
export function buildTops(rows, map, { mdUnit = 'm' } = {}) {
  if (map.name < 0 || map.md < 0) {
    throw new Error('Map the top-name and MD columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const name = String(rows[r][map.name] ?? '').trim();
    if (!name) throw new Error(`Row ${r + 1}: the top has no name.`);
    out.push({ name, md: toM(num(rows, r, map.md, 'MD'), mdUnit) });
  }
  if (!out.length) throw new Error('No tops found in the pasted data.');
  return out;
}

/**
 * Checkshot INPUT rows from mapped columns, as typed: `[{depth, time}]`.
 * The convention (MD | TVD | TVDSS, OWT | TWT, m | ft) and the conversion
 * to the stored TVDSS/TWT core happen in the welldata checkshots engine
 * (toStoredCheckshots), where the monotonicity error can name the
 * entered domain. Only numeric parsing lives here.
 * @param {{depth:number, time:number}} map
 */
export function buildCheckshotInputs(rows, map) {
  if (map.depth < 0 || map.time < 0) {
    throw new Error('Map the depth and time columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    out.push({ depth: num(rows, r, map.depth, 'depth'), time: num(rows, r, map.time, 'time') });
  }
  if (out.length < 2) throw new Error('A checkshot table needs at least 2 rows.');
  return out;
}

/**
 * Legacy wrapper: checkshots already in the stored convention (TVDss m,
 * TWT ms) from mapped columns — strictly monotonic in BOTH depth and
 * time (domain rule: reject, never sort silently).
 * @param {{tvdss:number, twt:number}} map
 * @returns {{tvdss_m:number, twt_ms:number}[]}
 */
export function buildCheckshots(rows, map) {
  if (map.tvdss < 0 || map.twt < 0) {
    throw new Error('Map the TVDss and TWT columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const z = num(rows, r, map.tvdss, 'TVDss');
    const t = num(rows, r, map.twt, 'TWT');
    if (out.length) {
      const prev = out[out.length - 1];
      if (!(z > prev.tvdss_m) || !(t > prev.twt_ms)) {
        throw new Error(`Row ${r + 1}: checkshots must strictly increase in both `
          + `depth and time (got ${z} m / ${t} ms after ${prev.tvdss_m} m / `
          + `${prev.twt_ms} ms) — fix the file rather than let the app re-sort it.`);
      }
    }
    out.push({ tvdss_m: z, twt_ms: t });
  }
  if (out.length < 2) throw new Error('A checkshot table needs at least 2 rows.');
  return out;
}

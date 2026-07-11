// Well data import: delimited-text parsing (CSV / tab / whitespace)
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

/** Split delimited text into rows. Detects the delimiter per file
 *  (comma / semicolon / tab / whitespace), skips blank and #-comment
 *  lines, and detects a header row (any non-numeric cell).
 *  @returns {{header: ?string[], rows: string[][], delimiter: string}} */
export function parseDelimited(text) {
  const lines = String(text || '').split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length && !l.startsWith('#') && !l.startsWith('//'));
  if (!lines.length) return { header: null, rows: [], delimiter: 'whitespace' };
  const counts = {
    ',': (lines[0].match(/,/g) || []).length,
    ';': (lines[0].match(/;/g) || []).length,
    '\t': (lines[0].match(/\t/g) || []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delimiter = best[1] > 0 ? best[0] : 'whitespace';
  const split = (l) => (delimiter === 'whitespace'
    ? l.split(/\s+/) : l.split(delimiter).map((c) => c.trim()));
  const rows = lines.map(split);
  const isNumericRow = (r) => r.every((c) => c === '' || Number.isFinite(Number(c)));
  const header = rows.length && !isNumericRow(rows[0]) ? rows[0] : null;
  return { header, rows: header ? rows.slice(1) : rows, delimiter };
}

/** Column-name heuristics per field, matched case-insensitively against
 *  header cells (whole-cell or prefix). First hit wins. */
const GUESSES = {
  md: ['md', 'depth_md', 'measured', 'meas_depth', 'depth'],
  inc: ['inc', 'incl', 'inclination', 'dev', 'angle'],
  azi: ['azi', 'azim', 'azimuth', 'az'],
  name: ['name', 'top', 'formation', 'surface', 'marker', 'horizon'],
  tvdss: ['tvdss', 'tvd_ss', 'tvd', 'z', 'depth'],
  twt: ['twt', 'time', 'owt', 't_ms', 'ms'],
};

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
 * Deviation stations from mapped columns.
 * @param {string[][]} rows data rows (no header)
 * @param {{md:number, inc:number, azi:number}} map column indices
 * @returns {{md:number, inc:number, azi:number}[]}
 */
export function buildDeviation(rows, map) {
  if (map.md < 0 || map.inc < 0 || map.azi < 0) {
    throw new Error('Map the MD, inclination and azimuth columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const md = num(rows, r, map.md, 'MD');
    const inc = num(rows, r, map.inc, 'inclination');
    const azi = num(rows, r, map.azi, 'azimuth');
    if (inc < 0 || inc > 180) {
      throw new Error(`Row ${r + 1}: inclination ${inc}° is outside 0–180°.`);
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
export function buildTops(rows, map) {
  if (map.name < 0 || map.md < 0) {
    throw new Error('Map the top-name and MD columns first.');
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const name = String(rows[r][map.name] ?? '').trim();
    if (!name) throw new Error(`Row ${r + 1}: the top has no name.`);
    out.push({ name, md: num(rows, r, map.md, 'MD') });
  }
  if (!out.length) throw new Error('No tops found in the pasted data.');
  return out;
}

/**
 * Checkshots from mapped columns — strictly monotonic in BOTH depth
 * and time (domain rule: reject, never sort silently).
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

// Area/depth (hypsometry) table as a GRV input and export (ReservoirCalc
// Pro upgrade U2-001, 2026-10-01). Pure.
//
// REP's main GRV route, and the table a reviewer checks: the area enclosed
// by the top of the reservoir at each depth (and, optionally, by its base).
// The gross rock volume above a contact c is
//
//   GRV(c) = integral from the crest to c of [A_top(z) - A_base(z)] dz
//
// with A_base(z) = A_top(z - h) for a constant gross thickness h, or the
// table's own base column. Areas are piecewise linear between rows and the
// integral of a piecewise-linear function is exact, so the only error is
// the table's own spacing. Depths are TVDSS elevations in workspace units
// (ft field, m metric; negative below datum), areas in acres (field) or
// km2 (metric), as everywhere else in RCP.
//
// The result is a hypsometry table (services/hypsometry.js), so the
// deterministic run, the Monte Carlo (contacts sampled) and the worker
// read it exactly as they read a mapped surface.

import { hypsometryFromTable } from './hypsometry';

const M2_PER_KM2 = 1e6;
const N_LEVELS = 1024;

const num = (v) => (typeof v === 'number' ? v : Number(String(v).trim()));

/**
 * Parse a pasted table: two or three numeric columns (depth, top area,
 * optional base area), comma, semicolon, tab or space separated, an
 * optional header line. Refuses with the row and the reason.
 * @returns {{ok: true, rows: Array<{depth:number, areaTop:number, areaBase:?number}>, notes: string[]} | {ok: false, reason: string}}
 */
export function parseAreaDepthText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const rows = [];
  const notes = [];
  let header = false;
  for (let k = 0; k < lines.length; k++) {
    const parts = lines[k].split(/[;,\t ]+/).filter(Boolean);
    const vals = parts.map(num);
    if (vals.some((v) => !Number.isFinite(v))) {
      if (k === 0 && rows.length === 0) { header = true; continue; }
      return { ok: false, reason: `Row ${k + 1} ("${lines[k]}") is not two or three numbers.` };
    }
    if (vals.length < 2 || vals.length > 3) return { ok: false, reason: `Row ${k + 1} has ${vals.length} numbers; give depth, top area and optionally base area.` };
    rows.push({ depth: vals[0], areaTop: vals[1], areaBase: vals.length === 3 ? vals[2] : null });
  }
  if (header) notes.push('The first line was read as a header.');
  return checkAreaDepthRows(rows, notes);
}

/**
 * Check and order rows (shallow first). Positive depths are read as
 * depths below the datum and turned into elevations, and that is said.
 */
export function checkAreaDepthRows(rowsIn, notesIn = []) {
  const notes = [...notesIn];
  let rows = (rowsIn || []).map((r) => ({ depth: num(r.depth), areaTop: num(r.areaTop), areaBase: r.areaBase === null || r.areaBase === undefined || r.areaBase === '' ? null : num(r.areaBase) }));
  if (rows.length < 2) return { ok: false, reason: 'Give at least two rows (the crest and one deeper level).' };
  if (rows.some((r) => !Number.isFinite(r.depth) || !Number.isFinite(r.areaTop))) return { ok: false, reason: 'Every row needs a depth and a top area.' };
  if (rows.every((r) => r.depth > 0)) {
    rows = rows.map((r) => ({ ...r, depth: -r.depth }));
    notes.push('The depths were all positive, so they were read as depths below the datum (TVDSS elevation = minus depth).');
  } else if (rows.some((r) => r.depth > 0)) {
    return { ok: false, reason: 'Some depths are positive and some negative. Give TVDSS elevations (negative below the datum) throughout.' };
  }
  rows.sort((a, b) => b.depth - a.depth);
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].depth === rows[k - 1].depth) return { ok: false, reason: `Two rows are at ${rows[k].depth}; each depth once.` };
  }
  const withBase = rows.filter((r) => r.areaBase !== null).length;
  if (withBase && withBase !== rows.length) return { ok: false, reason: 'Give a base area on every row or on none.' };
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    if (r.areaTop < 0 || (r.areaBase !== null && r.areaBase < 0)) return { ok: false, reason: `The area at ${r.depth} is negative.` };
    if (k > 0 && r.areaTop < rows[k - 1].areaTop) return { ok: false, reason: `The top area falls from ${rows[k - 1].areaTop} to ${r.areaTop} going deeper (at ${r.depth}). The area enclosed by a structure grows with depth.` };
    if (k > 0 && r.areaBase !== null && r.areaBase < rows[k - 1].areaBase) return { ok: false, reason: `The base area falls going deeper (at ${r.depth}).` };
    if (r.areaBase !== null && r.areaBase > r.areaTop) return { ok: false, reason: `At ${r.depth} the base area (${r.areaBase}) is larger than the top area (${r.areaTop}); the base lies below the top.` };
  }
  if (rows[0].areaTop > 0) notes.push(`The shallowest row (${rows[0].depth}) already has an area; the structure is taken as starting there (the crest).`);
  return { ok: true, rows, notes, hasBase: withBase > 0 };
}

/**
 * Exact integral of a piecewise-linear function through (xs, ys) from a
 * to b (a <= b): zero before the first point, flat after the last.
 */
export function plIntegral(xs, ys, a, b) {
  if (!(b > a)) return 0;
  const n = xs.length;
  const f = (x) => {
    if (x <= xs[0]) return x < xs[0] ? 0 : ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0; let hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + (ys[hi] - ys[lo]) * t;
  };
  const pts = [a];
  for (const x of xs) if (x > a && x < b) pts.push(x);
  pts.push(b);
  let s = 0;
  for (let k = 1; k < pts.length; k++) {
    const x0 = pts[k - 1]; const x1 = pts[k];
    // a jump at the crest (area already > 0 there): right limit at the
    // start of a piece, left limit (zero) at its end
    const y0 = x0 === xs[0] ? ys[0] : f(x0);
    const y1 = x1 === xs[0] ? 0 : f(x1);
    s += 0.5 * (y0 + y1) * (x1 - x0);
  }
  return s;
}

/**
 * The hypsometry of an area/depth table.
 * @param {Array} rows checked rows (checkAreaDepthRows), workspace units
 * @param {{unitSystem: 'field'|'metric', thickness?: number, spill?: ?number}} o
 *   thickness: constant gross thickness in workspace length (used when the
 *   table has no base column); none: the column is unlimited below the top
 * @returns {Object} hypsometry (hypsometryFromTable) with `source: 'area-depth'`
 */
export function areaDepthHypsometry(rows, { unitSystem = 'field', thickness = null, spill = null } = {}) {
  const isField = unitSystem === 'field';
  const aK = isField ? 1 : M2_PER_KM2; // acres stay acres (acre-ft); km2 to m2 (m3)
  const zs = rows.map((r) => -r.depth); // depth-down, target units
  const top = rows.map((r) => r.areaTop * aK);
  const hasBase = rows.every((r) => r.areaBase !== null && r.areaBase !== undefined);
  const h = Number(thickness);
  const useThick = !hasBase && h > 0;
  const base = hasBase ? rows.map((r) => r.areaBase * aK) : null;
  const zLo = zs[0];
  const zHi = zs[zs.length - 1] + (useThick ? h : 0);
  const span = Math.max(zHi - zLo, 1e-9);
  const volume = new Float64Array(N_LEVELS);
  const rockTo = (z) => {
    let v = plIntegral(zs, top, zLo, z);
    if (hasBase) v -= plIntegral(zs, base, zLo, z);
    else if (useThick) v -= plIntegral(zs, top, zLo - h, z - h);
    return v;
  };
  for (let k = 0; k < N_LEVELS; k++) volume[k] = rockTo(zLo + (span * k) / (N_LEVELS - 1));
  const deepest = rows[rows.length - 1].depth;
  return hypsometryFromTable({
    kind: 'hypsometry-table',
    zLo, zHi, volume,
    vTotal: volume[N_LEVELS - 1],
    totalArea: top[top.length - 1],
    // a contact below the table's deepest row has no area measured there
    edgeElevation: deepest,
    spillElevation: Number.isFinite(Number(spill)) && spill !== null && spill !== '' ? Number(spill) : null,
    isField,
    volUnit: isField ? 'Ac-ft' : 'm³',
    areaUnit: isField ? 'Acres' : 'km²',
    source: 'area-depth',
    rockToExact: rockTo,
  });
}

/**
 * The area/depth table of built cells (export): at `n` levels from the
 * crest to the deepest base, the area enclosed by the top and by the
 * base, in workspace units.
 * @param {Array<{td:number, bd:number, area:number}>} cells target units (acres or m2)
 */
export function areaDepthFromCells(cells, { unitSystem = 'field', n = 40, deepest = null } = {}) {
  if (!cells?.length) return [];
  const isField = unitSystem === 'field';
  const aK = isField ? 1 : 1 / M2_PER_KM2;
  let zLo = Infinity; let zHi = -Infinity;
  for (const c of cells) { if (c.td < zLo) zLo = c.td; if (c.bd > zHi) zHi = c.bd; }
  if (Number.isFinite(deepest)) zHi = Math.min(zHi, -deepest);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const z = zLo + ((zHi - zLo) * k) / (n - 1);
    let aT = 0; let aB = 0;
    for (const c of cells) { if (c.td <= z) aT += c.area; if (c.bd <= z) aB += c.area; }
    rows.push({ depth: -z, areaTop: aT * aK, areaBase: aB * aK });
  }
  return rows;
}

/** The table as CSV text (workspace units in the header). */
export function areaDepthCsv(rows, unitSystem = 'field') {
  const len = unitSystem === 'field' ? 'ft' : 'm';
  const area = unitSystem === 'field' ? 'acres' : 'km2';
  const fmt = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '');
  const head = `depth_tvdss_${len},area_top_${area},area_base_${area}`;
  return [head, ...rows.map((r) => [fmt(r.depth), fmt(r.areaTop), fmt(r.areaBase)].join(','))].join('\n') + '\n';
}

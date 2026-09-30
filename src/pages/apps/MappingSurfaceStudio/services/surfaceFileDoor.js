// The surface file door (MAP-U1-003, 2026-09-30): what real files look
// like before the byte-golden readers (lib/gridding/surfaceImport) see
// them. Petrel writes a "->" name line into CPS-3; Kingdom and
// spreadsheets put a header row over XYZ; Petrel "points with
// attributes" carry a BEGIN/END HEADER block; European spreadsheets use
// semicolons and comma decimals; columns come in any order with units in
// the header. The door reads those, says what it read (notes, the
// columns it used, the unit and domain the header names) and hands the
// reader clean text. It never guesses silently: every change is a note.

import { parseSurfaceFile, detectSurfaceFormat } from '@/lib/gridding/surfaceImport';

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const isNum = (s) => NUM.test(s);

const X_NAMES = /^(x|east|easting|eastings|x[_ ]?coord\w*|utm[_ ]?e\w*)$/i;
const Y_NAMES = /^(y|north|northing|northings|y[_ ]?coord\w*|utm[_ ]?n\w*)$/i;
const Z_NAMES = /^(z|depth|tvdss|tvd|elev|elevation|twt|time|value|z[_ ]?value|surface|horizon|height)$/i;

/** Name without a unit suffix: "Depth (ft)" -> "Depth", "TWT[ms]" -> "TWT". */
const bareName = (s) => String(s).replace(/[([{].*$/, '').replace(/_(m|ft|ms)$/i, '').trim();
/** Unit written in a header cell. */
function headerUnit(s) {
  const t = String(s).toLowerCase();
  if (/\b(ft|feet|foot)\b|\(ft\)|_ft\b/.test(t)) return 'ft';
  if (/\bms\b|\(ms\)|_ms\b|msec/.test(t)) return 'ms';
  if (/\(m\)|\bmetres?\b|\bmeters?\b|_m\b|\[m\]/.test(t)) return 'm';
  return null;
}

/** Cell splitter for a delimiter: ';' (comma decimals), tab, ',' or runs of spaces. */
const splitter = (delim) => (line) => {
  if (delim === ';') return line.split(';').map((c) => c.trim().replace(/\s+/g, '').replace(',', '.'));
  if (delim === '\t' || delim === ',') return line.split(delim).map((c) => c.trim()).filter((c, i, a) => c || i < a.length - 1);
  return line.trim().split(/\s+/).filter(Boolean);
};
const delimiterOf = (lines) => {
  if (lines.some((l) => l.includes(';'))) return ';';
  if (lines.some((l) => l.includes('\t'))) return '\t';
  if (lines.some((l) => l.includes(','))) return ',';
  return ' ';
};

/** A ZMAP+ lines/polygon file is culture (faults, contours), not a grid. */
const ZMAP_NOT_GRID = /^@[^\n]*HEADER\s*,\s*(POLYGON|POLYGONS|LINE|LINES|CONTOUR|CONTOURS|POINT|POINTS|FAULT|FAULTS)\b/im;

function cleanCps3(text, notes) {
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((l) => !l.trim().startsWith('->'));
  const dropped = lines.length - kept.length;
  if (dropped) notes.push(`Skipped ${dropped} Petrel name line${dropped === 1 ? '' : 's'} ("->...") in the CPS-3 header.`);
  return kept.join('\n');
}

function cleanXyz(text, notes) {
  let lines = text.split(/\r?\n/);
  const hint = { zUnit: null, domain: null };
  let header = null;
  // Petrel "points with attributes": the column names sit one per line
  // between BEGIN HEADER and END HEADER
  const b = lines.findIndex((l) => /^\s*BEGIN HEADER\s*$/i.test(l));
  const e = lines.findIndex((l) => /^\s*END HEADER\s*$/i.test(l));
  if (b >= 0 && e > b) {
    header = lines.slice(b + 1, e).map((l) => l.trim()).filter(Boolean);
    notes.push(`Read a Petrel points header (${header.join(', ')}).`);
    // Petrel states the depth unit in a comment
    const unitLine = lines.slice(0, b).find((l) => /unit in depth/i.test(l));
    if (unitLine) {
      const u = unitLine.split(':').pop().trim().toLowerCase();
      hint.zUnit = u.startsWith('f') ? 'ft' : u === 'm' ? 'm' : null;
    }
    lines = lines.slice(e + 1);
  }
  const content = lines.filter((l) => l.trim() && !/^\s*(#|!|\/\/)/.test(l));
  if (!content.length) throw new Error('The file has no data rows.');
  const delim = delimiterOf(content);
  const split = splitter(delim);
  if (delim === ';') notes.push('Semicolon-separated, comma decimals read as points.');
  // leading non-numeric rows are headers; the last one names the columns
  let first = 0;
  while (first < content.length && !split(content[first]).slice(0, 3).every(isNum)) first += 1;
  if (first === content.length) throw new Error('No numeric rows found: expected rows of x, y and z.');
  if (first > 0) {
    const cells = split(content[first - 1]);
    if (!header && cells.length >= 3) header = cells;
    notes.push(`Skipped ${first} header row${first === 1 ? '' : 's'}.`);
  }
  let ix = 0; let iy = 1; let iz = 2;
  if (header && header.length >= 3) {
    const find = (re, avoid) => header.findIndex((h, i) => !avoid.includes(i) && re.test(bareName(h)));
    const fx = find(X_NAMES, []);
    const fy = find(Y_NAMES, [fx]);
    const fz = find(Z_NAMES, [fx, fy]);
    if (fx >= 0 && fy >= 0 && fz >= 0) {
      [ix, iy, iz] = [fx, fy, fz];
      if (ix !== 0 || iy !== 1 || iz !== 2) notes.push(`Columns in another order: X = ${header[ix]}, Y = ${header[iy]}, Z = ${header[iz]}.`);
      const zu = headerUnit(header[iz]);
      if (zu === 'ms' || /^(twt|time)$/i.test(bareName(header[iz]))) hint.domain = 'time';
      else if (zu) hint.zUnit = zu;
      const xu = headerUnit(header[ix]);
      if (xu === 'ft') notes.push(`The X and Y columns say feet (${header[ix]}): declare the file's CRS so the frame is read in feet.`);
    } else {
      notes.push(`Header ${header.join(', ')} does not name X, Y and Z: the first three columns are read as X, Y, Z.`);
    }
  }
  const rows = [];
  let bad = 0;
  for (let i = first; i < content.length; i++) {
    const c = split(content[i]);
    const v = [c[ix], c[iy], c[iz]];
    if (!v.every(isNum)) { bad += 1; continue; }
    rows.push(v.join(' '));
  }
  if (bad) notes.push(`Skipped ${bad} row${bad === 1 ? '' : 's'} that were not three numbers.`);
  return { text: rows.join('\n'), hint };
}

/**
 * @param {string} text the file
 * @returns {{g:{format,nx,ny,x0,y0,dx,dy,z,rotation_deg?}, notes:string[], hint:{zUnit:?string, domain:?string}}}
 */
export function readSurfaceFile(text) {
  try { return readSurfaceFileRaw(text); } catch (e) {
    // the vendored readers word some errors with a dash; the house copy style has none
    throw new Error(String(e.message).replace(/\s*\u2014\s*/g, ': '));
  }
}

function readSurfaceFileRaw(text) {
  const src = String(text || '').replace(/^﻿/, '');
  if (!src.trim()) throw new Error('The file is empty.');
  if (ZMAP_NOT_GRID.test(src)) {
    throw new Error('This is a ZMAP+ lines file (fault polygons, contours or points), not a grid. Import grids here; bring fault polygons in through Culture layers as GeoJSON or a shapefile.');
  }
  const notes = [];
  const fmt = detectSurfaceFormat(src);
  if (fmt === 'cps3') return { g: parseSurfaceFile(cleanCps3(src, notes), 'cps3'), notes, hint: { zUnit: null, domain: null } };
  if (fmt !== 'xyz') return { g: parseSurfaceFile(src, fmt), notes, hint: { zUnit: null, domain: null } };
  const { text: clean, hint } = cleanXyz(src, notes);
  try {
    return { g: parseSurfaceFile(clean, 'xyz'), notes, hint };
  } catch (e) {
    if (/not regularly spaced|collapse the grid axis/.test(e.message)) {
      throw new Error('The points are not on a regular X/Y grid (a rotated seismic lattice or scattered picks). Export a gridded file (CPS-3, ZMAP+ or Irap classic) from the source tool; gridding scattered points from a file is not in this version.');
    }
    throw e;
  }
}

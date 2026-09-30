// Zone import (AppUpgrade PETRO-U2-004, PETRO-U1-023, 2026-09-29): a
// partner's zonation from Techlog, Interactive Petrophysics, Petrel or a
// spreadsheet, pasted or loaded as a file. Vendors write the same table
// many ways: base before top, units in the headers ("Top (ft)", "[m]",
// "_FT"), a unit column ("ft MD"), comments, tabs or semicolons with comma
// decimals, a well column in a multi-well file, a thickness instead of a
// base, no header at all. This parser reads all of those, shows what it
// read (delimiter, columns, unit, rows kept and every row skipped with its
// reason) and lets the caller correct the unit and the column picks.
//
// Zones are stored as MD in metres. A file in TVD or TVDSS is refused with
// the reason (the zone rows would sit at the wrong depth in a deviated well),
// never converted silently.

const M_PER_FT = 0.3048;

const NAME_KEYS = ['zone', 'zone name', 'zonename', 'zone_name', 'name', 'interval', 'unit name', 'formation', 'layer', 'surface', 'zone id'];
const TOP_KEYS = ['top', 'top md', 'top depth', 'topdepth', 'top_md', 'ztop', 'from', 'start', 'top (md)', 'md top', 'top md depth', 'depth top', 'md'];
const BASE_KEYS = ['base', 'bottom', 'base md', 'bottom md', 'base depth', 'bottom depth', 'base_md', 'bottom_md', 'zbase', 'zbottom', 'to', 'end', 'bot', 'md base', 'md bottom', 'depth base', 'depth bottom'];
const THICK_KEYS = ['thickness', 'thick', 'h', 'gross', 'isochore', 'interval thickness'];
const WELL_KEYS = ['well', 'well name', 'wellname', 'well_name', 'uwi', 'borehole', 'wellbore'];
const UNIT_KEYS = ['unit', 'units', 'depth unit', 'depth units', 'uom'];

/** Strip units and reference words from a header, and read them. */
export function readHeader(raw) {
  const text = String(raw || '').replace(/^﻿/, '').trim().replace(/^"|"$/g, '');
  const lower = text.toLowerCase();
  let unit = null;
  const unitHit = lower.match(/[([]\s*(ft|feet|foot|m|metres?|meters?)\s*[)\]]|[_\s](ft|feet|m)$/);
  if (unitHit) unit = /^f/.test(unitHit[1] || unitHit[2]) ? 'ft' : 'm';
  let ref = null;
  if (/tvdss|tvd\s*ss|subsea/.test(lower)) ref = 'TVDSS';
  else if (/\btvd\b|true vertical/.test(lower)) ref = 'TVD';
  else if (/\bmd\b|measured/.test(lower)) ref = 'MD';
  const bare = lower
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/[_\s](ft|feet|m)$/, ' ')
    .replace(/\b(tvdss|tvd|ss)\b/g, ' md ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, bare, unit, ref };
}

const is = (bare, keys) => keys.includes(bare) || keys.includes(bare.replace(/\s*md$/, '').trim());

function splitLine(line, delim) {
  if (delim === 'ws') return line.trim().split(/\s+/);
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (c === delim && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 20);
  const score = (d) => {
    const counts = sample.map((l) => splitLine(l, d).length);
    const n = counts[0];
    return n > 1 && counts.every((c) => c === n) ? n : n > 1 ? n / 2 : 0;
  };
  let best = 'ws';
  let bestScore = 0;
  for (const d of ['\t', ';', '|', ',']) {
    const s = score(d);
    if (s > bestScore) { best = d; bestScore = s; }
  }
  return bestScore ? best : 'ws';
}

/** A number as written: comma decimals accepted when the delimiter is not a comma. */
function parseNum(s, delim) {
  let t = String(s ?? '').trim().replace(/^"|"$/g, '');
  if (!t) return NaN;
  if (delim !== ',' && /^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

const unitFromCell = (s) => {
  const t = String(s || '').toLowerCase();
  if (/\b(ft|feet|foot)\b/.test(t)) return 'ft';
  if (/\bm\b|metre|meter/.test(t)) return 'm';
  return null;
};
const refFromCell = (s) => {
  const t = String(s || '').toLowerCase();
  if (/tvdss|subsea/.test(t)) return 'TVDSS';
  if (/\btvd\b/.test(t)) return 'TVD';
  return null;
};

/**
 * Read a zonation table.
 * @param {string} text file or pasted text
 * @param {Object} [opts]
 * @param {'m'|'ft'} [opts.defaultUnit='m'] unit when neither headers nor a unit column say
 * @param {?('m'|'ft')} [opts.unit] the user's override (wins over everything)
 * @param {{name?: number, top?: number, base?: number}} [opts.columns] the user's column picks
 * @param {{name?: string, uwi?: string}} [opts.well] the well the zones are for (multi-well files)
 * @param {Array<{name: string}>} [opts.existingZones] zones already on the well (skipped by name)
 * @param {?[number, number]} [opts.logRange] logged MD interval in m (zones outside are kept and noted)
 * @returns {{rows: Array<{name, topMdM, baseMdM, line}>, skipped: Array<{line, reason}>, notes: string[],
 *   delimiter: string, header: ?string[], columns: {name, top, base, thickness, well, unit}, unit: 'm'|'ft',
 *   unitSource: string, refused: ?string}}
 */
export function parseZoneTable(text, opts = {}) {
  const { defaultUnit = 'm', unit: unitOverride = null, columns: picks = {}, well = null, existingZones = [], logRange = null } = opts;
  const all = String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const lines = [];
  all.forEach((l, i) => {
    const t = l.trim();
    if (!t || /^(#|\/\/|~|!|;;)/.test(t)) return;
    lines.push({ text: l, line: i + 1 });
  });
  const empty = {
    rows: [], skipped: [], notes: [], delimiter: ',', header: null, columns: {}, unit: unitOverride || defaultUnit, unitSource: 'default', refused: null,
  };
  if (!lines.length) return { ...empty, refused: 'The file has no rows (only blanks or comments).' };

  const delim = detectDelimiter(lines.map((l) => l.text));
  const cells0 = splitLine(lines[0].text, delim);
  const numericCount = cells0.filter((c) => Number.isFinite(parseNum(c, delim))).length;
  const hasHeader = numericCount === 0;
  const header = hasHeader ? cells0 : null;
  const heads = hasHeader ? cells0.map(readHeader) : [];
  const notes = [];

  const find = (keys) => heads.findIndex((h) => is(h.bare, keys));
  const cols = {
    name: picks.name ?? (hasHeader ? find(NAME_KEYS) : 0),
    top: picks.top ?? (hasHeader ? find(TOP_KEYS) : 1),
    base: picks.base ?? (hasHeader ? find(BASE_KEYS) : 2),
    thickness: hasHeader ? find(THICK_KEYS) : -1,
    well: hasHeader ? find(WELL_KEYS) : -1,
    unit: hasHeader ? find(UNIT_KEYS) : -1,
  };
  if (!hasHeader) notes.push('No header row: read as name, top, base.');
  if (hasHeader && cols.name < 0) {
    // a header with a text column we could not name: the first non-depth column
    cols.name = heads.findIndex((h, i) => i !== cols.top && i !== cols.base && i !== cols.well && i !== cols.unit && i !== cols.thickness);
  }
  const base = { ...empty, delimiter: delim === 'ws' ? 'spaces' : delim, header, columns: cols, notes };
  if (cols.top < 0 || (cols.base < 0 && cols.thickness < 0)) {
    return { ...base, refused: `Could not find ${cols.top < 0 ? 'a top' : 'a base or thickness'} column in the header (${(header || []).join(', ')}). Pick the columns below.` };
  }

  // depth reference: headers first, then a unit column
  const refs = [cols.top, cols.base].filter((c) => c >= 0 && heads[c]).map((c) => heads[c].ref).filter(Boolean);
  let ref = refs.find((r) => r !== 'MD') || null;
  // unit: override, then headers, then the unit column, then the default
  let unit = unitOverride;
  let unitSource = unitOverride ? 'your choice' : null;
  if (!unit) {
    const hu = [cols.top, cols.base, cols.thickness].filter((c) => c >= 0 && heads[c]?.unit).map((c) => heads[c].unit);
    if (hu.length) {
      if (new Set(hu).size > 1) notes.push(`Headers disagree on the unit (${hu.join(', ')}); using ${hu[0]}.`);
      unit = hu[0];
      unitSource = 'the header';
    }
  }
  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (!unit && cols.unit >= 0) {
    const us = dataLines.map((l) => unitFromCell(splitLine(l.text, delim)[cols.unit])).filter(Boolean);
    if (us.length) { unit = us[0]; unitSource = 'the unit column'; }
  }
  if (!ref && cols.unit >= 0) {
    ref = dataLines.map((l) => refFromCell(splitLine(l.text, delim)[cols.unit])).find(Boolean) || null;
  }
  if (!unit) { unit = defaultUnit; unitSource = 'the session unit (nothing in the file says)'; }
  if (ref === 'TVD' || ref === 'TVDSS') {
    return {
      ...base, unit, unitSource,
      refused: `The depths are ${ref}. Zones are stored as measured depth (MD) below KB; in a deviated well ${ref} rows would sit at the wrong depth. Export the zonation in MD from the source and import that.`,
    };
  }
  const toM = (v) => (unit === 'ft' ? v * M_PER_FT : v);

  const wantWell = well ? [well.name, well.uwi].filter(Boolean).map((s) => String(s).trim().toLowerCase()) : [];
  const existing = new Set((existingZones || []).map((z) => String(z.name).trim().toLowerCase()));
  const seen = new Set();
  const rows = [];
  const skipped = [];
  for (const l of dataLines) {
    const c = splitLine(l.text, delim);
    const name = String(c[cols.name] ?? '').trim().replace(/^"|"$/g, '');
    if (cols.well >= 0 && wantWell.length) {
      const w = String(c[cols.well] ?? '').trim().toLowerCase();
      if (w && !wantWell.includes(w)) { skipped.push({ line: l.line, reason: `another well (${c[cols.well]})` }); continue; }
    }
    if (!name) { skipped.push({ line: l.line, reason: 'no zone name' }); continue; }
    const top = parseNum(c[cols.top], delim);
    let bottom = cols.base >= 0 ? parseNum(c[cols.base], delim) : NaN;
    if (!Number.isFinite(bottom) && cols.thickness >= 0) {
      const h = parseNum(c[cols.thickness], delim);
      if (Number.isFinite(h)) bottom = top + h;
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) { skipped.push({ line: l.line, reason: `${name}: top or base is not a number` }); continue; }
    if (top < 0 || bottom < 0) { skipped.push({ line: l.line, reason: `${name}: negative depth (not MD below KB)` }); continue; }
    if (!(bottom > top)) { skipped.push({ line: l.line, reason: `${name}: base ${bottom} is not below top ${top}` }); continue; }
    const key = name.toLowerCase();
    if (existing.has(key)) { skipped.push({ line: l.line, reason: `${name}: a zone with this name already exists on the well` }); continue; }
    if (seen.has(key)) { skipped.push({ line: l.line, reason: `${name}: repeated in the file (first kept)` }); continue; }
    seen.add(key);
    rows.push({ name, topMdM: toM(top), baseMdM: toM(bottom), line: l.line });
  }
  if (cols.base < 0 && cols.thickness >= 0) notes.push('Base = top + thickness (no base column).');
  const sorted = [...rows].sort((a, b) => a.topMdM - b.topMdM);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].topMdM < sorted[i - 1].baseMdM - 1e-9) notes.push(`${sorted[i - 1].name} and ${sorted[i].name} overlap; where zone overrides apply, the shallower zone wins in the overlap.`);
  }
  if (logRange) {
    const out = rows.filter((r) => r.baseMdM < logRange[0] || r.topMdM > logRange[1]).map((r) => r.name);
    if (out.length) notes.push(`Outside the logged interval, kept but empty: ${out.join(', ')}.`);
  }
  return { ...base, rows, skipped, notes, unit, unitSource, refused: null };
}

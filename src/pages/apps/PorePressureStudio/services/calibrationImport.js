// Calibration imports (AppUpgrade PP-U2-002, PL2 and PL3). A pore pressure
// specialist overlays three kinds of measured data on the prognosis:
// pressure points (RFT/MDT, and kicks), leak-off and formation integrity
// tests (LOT/FIT/XLOT, compared with the fracture pressure) and the mud
// weights actually used. They arrive as service-company tables in any
// order, with units in the header or in a second header line, depths in MD,
// TVD or TVDSS, pressures in psi, kPa, bar or as an equivalent mud weight,
// comma decimals, vendor nulls, and sometimes no header at all.
//
// This is the door: parseCalibrationTable reads the text and guesses the
// columns and units from the headers; convertCalibration turns the rows
// into points on the engine's frame (depth below mudline, MPa) with the
// units and the depth reference the user DECLARED (a guess is only a
// pre-filled choice; an unknown unit is refused). Every row not read is
// returned with its reason. Pressures and mud weights convert through the
// one Suite door, src/lib/ppfgUnits.js. Pure, no I/O.

import { ppfgUnit } from '../../../../lib/ppfgUnits';
import { tvdFromTvdss, datumFromElevation } from '../../../../lib/wellDatum';

export const CAL_KINDS = Object.freeze([
  { key: 'rft', label: 'RFT/MDT pressure', compare: 'pp' },
  { key: 'kick', label: 'Kick (pore pressure)', compare: 'pp' },
  { key: 'lot', label: 'LOT', compare: 'fg' },
  { key: 'fit', label: 'FIT', compare: 'fg' },
  { key: 'xlot', label: 'XLOT', compare: 'fg' },
  { key: 'mw', label: 'Mud weight used', compare: 'mw' },
  // 2026-10-14: a mud weight row whose outcome says it took an influx (the
  // pore pressure was above it there) or lost returns (the fracture pressure
  // was below it); drawn and checked against the prognosis, never fitted
  { key: 'mwkick', label: 'Mud weight that took an influx', compare: 'mwkick' },
  { key: 'mwloss', label: 'Mud weight with losses', compare: 'mwloss' },
]);
export const kindOf = (p) => (CAL_KINDS.some((k) => k.key === p?.kind) ? p.kind : 'rft');
export const kindLabel = (key) => CAL_KINDS.find((k) => k.key === key)?.label || key;
export const comparesTo = (p) => CAL_KINDS.find((k) => k.key === kindOf(p))?.compare || 'pp';

export const DEPTH_REFS = Object.freeze([
  { key: 'md', label: 'MD below RKB' },
  { key: 'tvd', label: 'TVD below RKB' },
  { key: 'tvdss', label: 'TVDSS (below sea level)' },
  { key: 'bml', label: 'Depth below mudline' },
]);
export const VALUE_UNITS = Object.freeze(['psi', 'psia', 'psig', 'kPa', 'bar', 'MPa', 'ppg', 'sg', 'g/cc', 'kg/m3', 'psi/ft', 'kPa/m']);
const NULLS = [-999, -999.25, -9999, -99999];
const FT = 0.3048;

const DEPTH_NAMES = /^(depth|dept|md|tvd|tvdss|tvd ?ss|z|measured depth|true vertical depth)\b/i;
// 2026-10-14: header words are read after headerWords(): snake_case and
// kebab-case become spaces and a trailing unit (md_m, pressure_psia,
// mud_weight_ppg) is taken off, so "shoe md", "from md" and "tvdss" are found
const DEPTH_WORDS = /(^|\s)(depth|dept|md|tvd|tvdss|tvd ss|z|measured depth|true vertical depth)(\s|$)/i;
const VALUE_NAMES = /(pressure|pres\b|^p\b|formation|pore|lot|fit|xlot|leak|emw|mud ?weight|^mw\b|density|gradient|integrity)/i;
const KIND_NAMES = /^(type|test|kind|test type|event)$/i;
const WELL_NAMES = /^(well|well name|wellname|wellbore|well id|uwi|hole)$/i;
const OUTCOME_NAMES = /^(outcome|result|status|what happened)$/i;
const NOTE_NAMES = /^(note|notes|comment|comments|remark|remarks|description)$/i;
const BASE_WORDS = /(^|\s)(to|base|bottom|btm|end)(\s|$)/i;

// a unit written as the last word of a snake_case header
const SUFFIX_UNITS = [
  ['psi per ft', 'psi/ft'], ['psi ft', 'psi/ft'], ['kpa per m', 'kPa/m'], ['kpa m', 'kPa/m'], ['g cc', 'g/cc'], ['g cm3', 'g/cc'], ['kg m3', 'kg/m3'],
  ['psia', 'psia'], ['psig', 'psig'], ['psi', 'psi'], ['kpa', 'kPa'], ['bar', 'bar'], ['mpa', 'MPa'], ['ppg', 'ppg'], ['sg', 'sg'],
  ['ft', 'ft'], ['feet', 'ft'], ['m', 'm'],
];

/** A header as words, with the unit taken off: {name: 'shoe md', unit: 'm'}. */
export function headerWords(h) {
  const raw = String(h || '').replace(/[([].*$/, '').trim();
  const words = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const [suffix, unit] of SUFFIX_UNITS) {
    if (words.endsWith(` ${suffix}`) && words.length > suffix.length + 1) return { name: words.slice(0, -suffix.length - 1).trim(), unit };
  }
  return { name: words, unit: null };
}

/** A unit found in a header ("Pressure (psi)", "MW [ppg]", "Depth ft", "md_m", "pressure_psia"). */
export function unitFromHeader(h) {
  const s = String(h || '');
  const m = s.match(/[([]\s*([^)\]]+?)\s*[)\]]/) || s.match(/\b(psia|psig|psi\/ft|psi|kpa\/m|kpa|bar|mpa|ppg|sg|g\/cc|g\/cm3|kg\/m3|ft|m)\s*$/i);
  if (m) return m[1].trim();
  return headerWords(s).unit;
}

const canonValueUnit = (u) => {
  if (!u) return null;
  const k = u.trim().toLowerCase().replace(/\s+/g, '');
  const map = {
    psi: 'psi', psia: 'psia', psig: 'psig', kpa: 'kPa', bar: 'bar', mpa: 'MPa', ppg: 'ppg', 'lb/gal': 'ppg', sg: 'sg',
    'g/cc': 'g/cc', 'g/cm3': 'g/cc', 'kg/m3': 'kg/m3', 'psi/ft': 'psi/ft', 'kpa/m': 'kPa/m',
  };
  return map[k] || null;
};
const canonDepthUnit = (u) => {
  const k = String(u || '').trim().toLowerCase();
  if (['ft', 'feet', 'f'].includes(k)) return 'ft';
  if (['m', 'metre', 'meter', 'metres', 'meters'].includes(k)) return 'm';
  return null;
};

function splitLine(line, delim) {
  if (delim === 'ws') return line.trim().split(/\s+/);
  return line.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
}

const isNumberish = (c) => /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/.test(String(c).trim());

/**
 * Read a pasted or uploaded table.
 * @returns {{delim: string, columns: string[], units: (string|null)[], rows: {line: number, cells: string[]}[],
 *   commaDecimal: boolean, guess: {depthCol: ?number, valueCol: ?number, kindCol: ?number, depthRef: ?string,
 *   depthUnit: ?string, valueUnit: ?string, kind: ?string}, headerLines: number}}
 */
export function parseCalibrationTable(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
    .map((l, i) => ({ text: l, line: i + 1 }))
    .filter((l) => l.text.trim() && !/^\s*(#|~|\/\/)/.test(l.text));
  if (!lines.length) throw new Error('The file is empty.');
  const sample = lines.slice(0, 10).map((l) => l.text);
  const count = (re) => sample.reduce((a, l) => a + (l.match(re) || []).length, 0);
  const delim = count(/\t/g) >= sample.length ? '\t' : count(/;/g) >= sample.length ? ';' : count(/,/g) >= sample.length ? ',' : 'ws';
  // comma decimals only when the comma is not the separator
  const commaDecimal = delim !== ',' && sample.some((l) => /\d,\d/.test(l));
  const first = splitLine(lines[0].text, delim);
  // a header has fewer numbers than the row under it (a data row may carry text, a Type column)
  const numeric = (cells) => cells.filter(isNumberish).length;
  const hasHeader = numeric(first) === 0 || (lines[1] ? numeric(first) < numeric(splitLine(lines[1].text, delim)) : false);
  let columns = hasHeader ? first : first.map((_, i) => `Column ${i + 1}`);
  let units = columns.map(unitFromHeader);
  let headerLines = hasHeader ? 1 : 0;
  // a second header line of units (Techlog and Petrel exports)
  if (hasHeader && lines[1]) {
    const second = splitLine(lines[1].text, delim);
    if (second.length && !second.some(isNumberish) && second.some((c) => canonValueUnit(c.replace(/[()[\]]/g, '')) || canonDepthUnit(c.replace(/[()[\]]/g, '')))) {
      units = second.map((c) => c.replace(/[()[\]]/g, '').trim() || null);
      headerLines = 2;
    }
  }
  columns = columns.map((c) => String(c).trim());
  const rows = lines.slice(headerLines).map((l) => ({ line: l.line, cells: splitLine(l.text, delim) }));

  const words = columns.map((c) => headerWords(c).name);
  const findCol = (re, not = -1) => words.findIndex((c, i) => i !== not && re.test(c));
  // the depth: MD before TVD before TVDSS; a from/to pair is an interval (its top here)
  let depthCol = null; let baseCol = null;
  if (hasHeader) {
    const cands = words.map((w, i) => ({ w, i })).filter(({ w }) => DEPTH_WORDS.test(w) || DEPTH_NAMES.test(w));
    const rank = ({ w }) => (/(^|\s)md(\s|$)|measured/.test(w) ? 0 : /tvd ?ss|subsea/.test(w) ? 2 : /tvd|true vertical/.test(w) ? 1 : 3);
    const tops = cands.filter((c) => !BASE_WORDS.test(c.w)).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
    if (tops.length) {
      depthCol = tops[0].i;
      const base = cands.find((c) => BASE_WORDS.test(c.w) && rank(c) === rank(tops[0]));
      if (base && /(^|\s)(from|top)(\s|$)/.test(tops[0].w)) baseCol = base.i;
    }
  } else depthCol = 0;
  let valueCol = hasHeader ? findCol(VALUE_NAMES, depthCol ?? -1) : 1;
  if (valueCol < 0 || valueCol === baseCol) valueCol = hasHeader ? words.findIndex((w, i) => i !== depthCol && i !== baseCol && VALUE_NAMES.test(w)) : valueCol;
  if (valueCol < 0) valueCol = null;
  let kindCol = hasHeader ? words.findIndex((c) => KIND_NAMES.test(c)) : -1;
  if (kindCol < 0) kindCol = null;
  const opt = (re) => { const i = hasHeader ? words.findIndex((c) => re.test(c)) : -1; return i < 0 ? null : i; };
  const wellCol = opt(WELL_NAMES);
  const outcomeCol = opt(OUTCOME_NAMES);
  const noteCol = opt(NOTE_NAMES);
  const dName = depthCol != null ? words[depthCol] : '';
  const vName = valueCol != null ? words[valueCol] : '';
  const depthRef = /tvd ?ss|subsea/.test(dName) ? 'tvdss' : /tvd|true vertical/.test(dName) ? 'tvd' : /(^|\s)md(\s|$)|measured/.test(dName) ? 'md'
    : /below mudline|bml|below seabed/.test(dName) ? 'bml' : null;
  const kind = /\bxlot\b/.test(vName) ? 'xlot' : /\blot\b|leak/.test(vName) ? 'lot' : /\bfit\b|integrity/.test(vName) ? 'fit'
    : /mud ?weight|\bmw\b/.test(vName) ? 'mw' : /kick/.test(vName) ? 'kick' : /pressure|pres|formation|pore|rft|mdt/.test(vName) ? 'rft' : null;
  const wells = wellCol != null ? [...new Set(rows.map((r) => String(r.cells[wellCol] ?? '').trim()).filter(Boolean))] : [];
  return {
    delim: delim === '\t' ? 'tab' : delim === 'ws' ? 'spaces' : delim,
    columns,
    units,
    rows,
    commaDecimal,
    headerLines,
    wells,
    guess: {
      depthCol,
      baseCol,
      valueCol,
      kindCol,
      wellCol,
      outcomeCol,
      noteCol,
      well: wells.length === 1 ? wells[0] : null,
      depthRef,
      depthUnit: depthCol != null ? canonDepthUnit(units[depthCol]) : null,
      valueUnit: valueCol != null ? canonValueUnit(units[valueCol]) : null,
      kind,
    },
  };
}

const num = (c, commaDecimal) => {
  let s = String(c ?? '').trim();
  if (commaDecimal) s = s.replace(',', '.');
  if (!isNumberish(s.replace(',', '.')) || (s.includes(',') && !commaDecimal)) return NaN;
  return Number(s);
};

const kindFromCell = (c) => {
  const s = String(c || '').trim().toLowerCase();
  if (/xlot/.test(s)) return 'xlot';
  if (/lot|leak/.test(s)) return 'lot';
  if (/fit|integrity/.test(s)) return 'fit';
  if (/kick|influx/.test(s)) return 'kick';
  if (/mud|mw/.test(s)) return 'mw';
  if (/rft|mdt|pressure|xpt|fpt|pretest/.test(s)) return 'rft';
  return null;
};

/**
 * The declared choices that are still missing, as sentences (empty when the
 * import can run). Units are declared at the door: nothing is assumed.
 */
export function missingChoices(mapping, ctx = {}) {
  const out = [];
  if (mapping.depthCol == null) out.push('choose the depth column');
  if (mapping.valueCol == null) out.push('choose the pressure or mud weight column');
  if (!DEPTH_REFS.some((r) => r.key === mapping.depthRef)) out.push('declare the depth reference (MD, TVD, TVDSS or below mudline)');
  if (!['m', 'ft'].includes(mapping.depthUnit)) out.push('declare the depth unit');
  if (!VALUE_UNITS.includes(mapping.valueUnit)) out.push('declare the pressure unit');
  if (mapping.kindCol == null && !CAL_KINDS.some((k) => k.key === mapping.kind)) out.push('choose what the values are (RFT/MDT, kick, LOT, FIT, XLOT or mud weight)');
  if (mapping.depthRef === 'tvdss' && !Number.isFinite(ctx.kbM)) out.push("TVDSS needs the well's KB elevation, and this source has none");
  if (mapping.wellCol != null && (mapping.well == null || mapping.well === '')) out.push('choose whose rows to import (the file names more than one well)');
  return out;
}

/**
 * The value of a well column that the selected registry well's name
 * contains, longest first ("PPS demo: Ekene-1" picks "Ekene-1", never
 * "Ekene-10"); a file with one well picks it. Null when none matches.
 */
export function guessWell(wells, wellName) {
  const list = (wells || []).filter(Boolean);
  if (!list.length) return null;
  const name = String(wellName || '').toLowerCase();
  const hits = list.filter((w) => {
    const v = String(w).toLowerCase();
    let at = name.indexOf(v);
    while (at >= 0) {
      const before = name[at - 1]; const after = name[at + v.length];
      if (!(before && /[a-z0-9]/.test(before)) && !(after && /[a-z0-9]/.test(after))) return true;
      at = name.indexOf(v, at + 1);
    }
    return false;
  }).sort((a, b) => b.length - a.length);
  if (hits.length) return hits[0];
  return list.length === 1 ? list[0] : null;
}

/** The kind a mud weight row's outcome makes it: an influx, losses, or held. */
export function mudWeightOutcome(text) {
  // "no losses, no influx" is a mud weight that held
  const s = String(text || '').toLowerCase().replace(/\bno (influx|kick|flow|gains?|loss(es)?|lost returns)\b/g, '');
  if (/\b(influx|kick|flowed|flow|gain|gained|took gas)\b/.test(s)) return 'mwkick';
  if (/\b(losses|loss|lost returns|lost circulation)\b/.test(s)) return 'mwloss';
  return 'mw';
}

/** The depth an outcome names ("influx at 1418 m", "losses at 4,650 ft"), or null. */
export function outcomeDepth(text) {
  const m = String(text || '').match(/(?:influx|kick|flow|gain|loss(?:es)?|lost returns)[^0-9]{0,24}?(\d[\d,]*(?:\.\d+)?)\s*(m|ft|feet|metres?|meters?)\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(v) ? { value: v, unit: /^f/i.test(m[2]) ? 'ft' : 'm' } : null;
}

/**
 * Rows -> calibration points on the engine frame.
 * @param {ReturnType<typeof parseCalibrationTable>} table
 * @param {{depthCol: number, valueCol: number, kindCol?: ?number, kind?: string, depthRef: string,
 *   depthUnit: 'm'|'ft', valueUnit: string}} mapping
 * @param {{frame?: ?{mdToPosition: Function}, kbM?: ?number, mudlineMdM?: number, waterDepthM?: number,
 *   source?: string}} ctx frame: the well's depth frame (null = vertical); kbM: KB elevation above sea level
 * @returns {{points: {z: number, pMpa: number, kind: string, source: string, raw: string}[],
 *   skipped: {line: number, text: string, reason: string}[]}}
 */
export function convertCalibration(table, mapping, ctx = {}) {
  const missing = missingChoices(mapping, ctx);
  if (missing.length) throw new Error(`Before import: ${missing.join('; ')}.`);
  const conv = ppfgUnit(mapping.valueUnit === 'g/cc' ? 'G/CC' : mapping.valueUnit === 'kg/m3' ? 'KG/M3' : mapping.valueUnit);
  if (!conv) throw new Error(`${mapping.valueUnit} is not a pressure, a gradient or a mud weight.`);
  const toMpa = (v, tvd) => conv.toMpa(v, tvd);
  // 2026-10-14: a mud weight given as EMW keeps the file's value, so the
  // evidence line quotes 9.80 ppg as written (the pressure converts through
  // the exact-density door, which the drilling 0.052 rule reads 0.1% lower)
  const emwOf = (v) => (mapping.valueUnit === 'ppg' ? v : mapping.valueUnit === 'sg' || mapping.valueUnit === 'g/cc' ? v * 8.345404 : null);
  const frame = ctx.frame || null;
  const tvdAt = (md) => (frame ? frame.mdToPosition(md).tvd : md);
  const mudMd = Number(ctx.mudlineMdM) || 0;
  let mudTvd = mudMd;
  if (frame && mudMd > 0) { try { mudTvd = tvdAt(mudMd); } catch { mudTvd = mudMd; } }
  // without a mudline MD the rotary-table datum is unknown: TVD below RKB is
  // then the depth below mudline plus the water column (the EMW datum rule)
  const rkbOffset = mudMd > 0 ? mudTvd : (Number(ctx.waterDepthM) || 0);
  const points = []; const skipped = [];
  const f = mapping.depthUnit === 'ft' ? FT : 1;
  const wantWell = mapping.wellCol != null && mapping.well && mapping.well !== '*' ? String(mapping.well).trim() : null;
  // a depth (in the file's unit and reference) to {z below mudline, tvd below RKB}
  const place = (dm) => {
    let tvd; let z;
    if (mapping.depthRef === 'bml') { z = dm; tvd = z + rkbOffset; } else {
      if (mapping.depthRef === 'md') tvd = tvdAt(dm);
      else if (mapping.depthRef === 'tvd') tvd = dm;
      else tvd = tvdFromTvdss(dm, datumFromElevation(ctx.kbM)); // TVDSS to TVD below the reference, shared datum module
      z = tvd - rkbOffset;
    }
    return { z, tvd };
  };
  for (const { line, cells } of table.rows) {
    const text = cells.join(' | ');
    if (wantWell) {
      const w = String(cells[mapping.wellCol] ?? '').trim();
      if (w !== wantWell) { skipped.push({ line, text, reason: `another well (${w || 'blank'})` }); continue; }
    }
    const d = num(cells[mapping.depthCol], table.commaDecimal);
    const v = num(cells[mapping.valueCol], table.commaDecimal);
    if (!Number.isFinite(d) || !Number.isFinite(v)) { skipped.push({ line, text, reason: 'not a number' }); continue; }
    if (NULLS.includes(d) || NULLS.includes(v)) { skipped.push({ line, text, reason: 'vendor null (-999)' }); continue; }
    let kind = mapping.kindCol != null ? (kindFromCell(cells[mapping.kindCol]) || mapping.kind) : mapping.kind;
    if (!CAL_KINDS.some((k) => k.key === kind)) { skipped.push({ line, text, reason: `type "${cells[mapping.kindCol] ?? ''}" not known` }); continue; }
    // 2026-10-14: a mud weight's outcome (or its note when there is no outcome column)
    const said = mapping.outcomeCol != null ? cells[mapping.outcomeCol] : (mapping.noteCol != null ? cells[mapping.noteCol] : '');
    if (kind === 'mw') kind = mudWeightOutcome(said);
    const b = mapping.baseCol != null ? num(cells[mapping.baseCol], table.commaDecimal) : NaN;
    const hasBase = Number.isFinite(b) && !NULLS.includes(b) && b > d;
    let at = d * f;
    if (kind === 'mwkick' || kind === 'mwloss') {
      const named = outcomeDepth(`${cells[mapping.outcomeCol] ?? ''} ${cells[mapping.noteCol] ?? ''}`);
      at = named ? named.value * (named.unit === 'ft' ? FT : 1) : (hasBase ? b * f : d * f);
    }
    let top;
    try { top = place(at); } catch (e) { skipped.push({ line, text, reason: e.message }); continue; }
    if (!(top.z >= 0)) { skipped.push({ line, text, reason: 'above the mudline' }); continue; }
    const pMpa = toMpa(v, top.tvd);
    if (!Number.isFinite(pMpa) || !(pMpa > 0)) { skipped.push({ line, text, reason: 'no positive pressure' }); continue; }
    const raw = `${kind === 'mwkick' || kind === 'mwloss' ? +(at / f).toFixed(2) : cells[mapping.depthCol]} ${mapping.depthUnit} ${mapping.depthRef.toUpperCase()}, ${cells[mapping.valueCol]} ${mapping.valueUnit}`;
    if (kind === 'mw' && hasBase) {
      // a mud weight held over an interval: its top and its base, drawn as one step
      let base;
      try { base = place(b * f); } catch (e) { skipped.push({ line, text, reason: e.message }); continue; }
      const pBase = toMpa(v, base.tvd);
      const interval = `${ctx.source || 'import'}:${line}`;
      const e = emwOf(v);
      points.push({ z: top.z, pMpa, kind, source: ctx.source || 'import', raw: `${cells[mapping.depthCol]} to ${cells[mapping.baseCol]} ${mapping.depthUnit} ${mapping.depthRef.toUpperCase()}, ${cells[mapping.valueCol]} ${mapping.valueUnit}`, interval, end: 'top', ...(e != null ? { emwPpg: e } : {}) });
      points.push({ z: base.z, pMpa: pBase, kind, source: ctx.source || 'import', raw: '', interval, end: 'base', ...(e != null ? { emwPpg: e } : {}) });
      continue;
    }
    const e = kind === 'mw' || kind === 'mwkick' || kind === 'mwloss' ? emwOf(v) : null;
    points.push({ z: top.z, pMpa, kind, source: ctx.source || 'import', raw, ...(e != null ? { emwPpg: e } : {}) });
  }
  return { points, skipped };
}

/** A workbook sheet's rows (string cells) as tab-separated text for parseCalibrationTable. */
export function sheetToText(rows) {
  return (rows || []).map((r) => r.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
}

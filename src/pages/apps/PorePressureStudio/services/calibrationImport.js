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

export const CAL_KINDS = Object.freeze([
  { key: 'rft', label: 'RFT/MDT pressure', compare: 'pp' },
  { key: 'kick', label: 'Kick (pore pressure)', compare: 'pp' },
  { key: 'lot', label: 'LOT', compare: 'fg' },
  { key: 'fit', label: 'FIT', compare: 'fg' },
  { key: 'xlot', label: 'XLOT', compare: 'fg' },
  { key: 'mw', label: 'Mud weight used', compare: 'mw' },
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
const VALUE_NAMES = /(pressure|pres\b|^p\b|formation|pore|lot|fit|xlot|leak|emw|mud ?weight|^mw\b|density|gradient|integrity)/i;
const KIND_NAMES = /^(type|test|kind|test type|event)$/i;

/** A unit found in a header ("Pressure (psi)", "MW [ppg]", "Depth ft"). */
export function unitFromHeader(h) {
  const s = String(h || '');
  const m = s.match(/[([]\s*([^)\]]+?)\s*[)\]]/) || s.match(/\b(psia|psig|psi\/ft|psi|kpa\/m|kpa|bar|mpa|ppg|sg|g\/cc|g\/cm3|kg\/m3|ft|m)\s*$/i);
  return m ? m[1].trim() : null;
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

  const findCol = (re, not = -1) => columns.findIndex((c, i) => i !== not && re.test(c.replace(/[([].*$/, '').trim()));
  let depthCol = hasHeader ? findCol(DEPTH_NAMES) : 0;
  let valueCol = hasHeader ? findCol(VALUE_NAMES, depthCol) : 1;
  if (depthCol < 0) depthCol = null;
  if (valueCol < 0) valueCol = null;
  let kindCol = hasHeader ? columns.findIndex((c) => KIND_NAMES.test(c.trim())) : -1;
  if (kindCol < 0) kindCol = null;
  const dName = depthCol != null ? columns[depthCol].toLowerCase() : '';
  const vName = valueCol != null ? columns[valueCol].toLowerCase() : '';
  const depthRef = /tvd ?ss|subsea/.test(dName) ? 'tvdss' : /tvd|true vertical/.test(dName) ? 'tvd' : /\bmd\b|measured/.test(dName) ? 'md' : null;
  const kind = /\bxlot\b/.test(vName) ? 'xlot' : /\blot\b|leak/.test(vName) ? 'lot' : /\bfit\b|integrity/.test(vName) ? 'fit'
    : /mud ?weight|\bmw\b/.test(vName) ? 'mw' : /kick/.test(vName) ? 'kick' : /pressure|pres|formation|pore|rft|mdt/.test(vName) ? 'rft' : null;
  return {
    delim: delim === '\t' ? 'tab' : delim === 'ws' ? 'spaces' : delim,
    columns,
    units,
    rows,
    commaDecimal,
    headerLines,
    guess: {
      depthCol,
      valueCol,
      kindCol,
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
  return out;
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
  for (const { line, cells } of table.rows) {
    const text = cells.join(' | ');
    const d = num(cells[mapping.depthCol], table.commaDecimal);
    const v = num(cells[mapping.valueCol], table.commaDecimal);
    if (!Number.isFinite(d) || !Number.isFinite(v)) { skipped.push({ line, text, reason: 'not a number' }); continue; }
    if (NULLS.includes(d) || NULLS.includes(v)) { skipped.push({ line, text, reason: 'vendor null (-999)' }); continue; }
    const kind = mapping.kindCol != null ? (kindFromCell(cells[mapping.kindCol]) || mapping.kind) : mapping.kind;
    if (!CAL_KINDS.some((k) => k.key === kind)) { skipped.push({ line, text, reason: `type "${cells[mapping.kindCol] ?? ''}" not known` }); continue; }
    const dm = d * f;
    let tvd; let z;
    try {
      if (mapping.depthRef === 'bml') { z = dm; tvd = z + rkbOffset; } else {
        if (mapping.depthRef === 'md') tvd = tvdAt(dm);
        else if (mapping.depthRef === 'tvd') tvd = dm;
        else tvd = dm + Number(ctx.kbM);
        z = tvd - rkbOffset;
      }
    } catch (e) { skipped.push({ line, text, reason: e.message }); continue; }
    if (!(z >= 0)) { skipped.push({ line, text, reason: 'above the mudline' }); continue; }
    const pMpa = conv.toMpa(v, tvd);
    if (!Number.isFinite(pMpa) || !(pMpa > 0)) { skipped.push({ line, text, reason: 'no positive pressure' }); continue; }
    points.push({ z, pMpa, kind, source: ctx.source || 'import', raw: `${cells[mapping.depthCol]} ${mapping.depthUnit} ${mapping.depthRef.toUpperCase()}, ${cells[mapping.valueCol]} ${mapping.valueUnit}` });
  }
  return { points, skipped };
}

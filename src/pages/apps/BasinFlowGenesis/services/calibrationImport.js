// Calibration and formation-top imports (BF2, 2026-09-06). Pure parsers
// on the shared delimited-text reader (src/lib/tabularFile.js): a
// calibration file carries depth with a vitrinite reflectance column, a
// temperature column, or both; a tops file carries a name and a depth.
// Every row that cannot be read is reported, never silently dropped.

import { parseDelimitedText } from '@/lib/tabularFile';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, '');
// BF-U1-010: header cells are read as words. Matching by prefix read a TVD
// or TOC column as temperature (both start with "t") and ignored the unit
// in "Depth (ft)" or "BHT (degF)", so Fahrenheit was taken as Celsius.
const tokens = (s) => String(s || '').toLowerCase().replace(/°/g, ' deg').split(/[^a-z0-9%]+/).filter(Boolean);
const findCol = (header, names) => {
  if (!header) return -1;
  for (const n of names) {
    const i = header.findIndex((c) => { const t = tokens(c); return t[0] === n || norm(c) === n; });
    if (i >= 0) return i;
  }
  return -1;
};
const DEPTH_FT = ['ft', 'feet', 'foot'];
const DEPTH_M = ['m', 'metre', 'meter', 'metres', 'meters'];
const TEMP_F = ['f', 'degf', 'fahrenheit', 'degreesf'];
const TEMP_C = ['c', 'degc', 'celsius', 'degreesc'];
/** The unit a header cell states, or null. */
export function headerUnit(cell, kind) {
  const t = tokens(cell).slice(1);
  const j = norm(cell);
  if (kind === 'depth') {
    if (t.some((x) => DEPTH_FT.includes(x)) || /(ft|feet)$/.test(j)) return 'ft';
    if (t.some((x) => DEPTH_M.includes(x)) || /m$/.test(j.replace(/^(md|tvd|tvdss|depth|z)$/, ''))) return 'm';
    return null;
  }
  if (tokens(cell)[0] === 'tf') return 'F';
  if (tokens(cell)[0] === 'tc') return 'C';
  if (t.some((x) => TEMP_F.includes(x)) || /(degf|fahrenheit)$/.test(j)) return 'F';
  if (t.some((x) => TEMP_C.includes(x)) || /(degc|celsius)$/.test(j)) return 'C';
  return null;
}
const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

const DEPTH_NAMES = ['tvd', 'depth', 'tvdkb', 'md', 'dept', 'z'];
const RO_NAMES = ['ro', '%ro', 'ro%', 'vro', 'vr', 'vitrinite', 'reflectance', 'maturity', 'r0'];
const TEMP_NAMES = ['temp', 'temperature', 'bht', 't', 'tc', 'tf', 'dst', 'formationtemperature'];

/**
 * Calibration text -> { ro, temp, problems, units, columns }.
 * Values are returned in the FILE's units: `units.depth` ('m' | 'ft' | null)
 * and `units.temp` ('C' | 'F' | null) are what the header states, null when
 * it says nothing (the caller then uses the unit the user picked, and C).
 * Ro in % (a value above 10 is taken as a mistake). A TVD column is
 * preferred to an MD one (a 1D basin model is vertical) and that is said.
 */
export function parseCalibrationText(text) {
  const { header, rows } = parseDelimitedText(text);
  const problems = [];
  const iDepth = findCol(header, DEPTH_NAMES);
  const iRo = findCol(header, RO_NAMES);
  const iT = findCol(header, TEMP_NAMES.filter(Boolean));
  // BF-U2-006: Horner needs each run's time since circulation stopped (hours);
  // a kind column marks DST or static temperatures (never corrected)
  const iTs = findCol(header, ['shutin', 'shut', 'tsc', 'ts', 'timesincecirculation', 'hourssincecirculation', 'sincecirc', 'elapsed']);
  const iKind = findCol(header, ['kind', 'type', 'source', 'test']);
  if (!header) problems.push('No header row found; expected columns such as depth, Ro, temperature.');
  else if (iDepth < 0) problems.push('No depth column found (depth, TVD, MD or z).');
  else if (iRo < 0 && iT < 0) problems.push('No Ro or temperature column found.');
  const units = { depth: iDepth >= 0 ? headerUnit(header[iDepth], 'depth') : null, temp: iT >= 0 ? headerUnit(header[iT], 'temp') : null };
  const columns = { depth: iDepth >= 0 ? header[iDepth] : null, ro: iRo >= 0 ? header[iRo] : null, temp: iT >= 0 ? header[iT] : null, shutIn: iTs >= 0 ? header[iTs] : null, kind: iKind >= 0 ? header[iKind] : null };
  if (header && iDepth >= 0 && findCol(header, ['md']) >= 0 && findCol(header, ['tvd', 'tvdkb']) === iDepth) problems.push(`Depth read from "${header[iDepth]}" (vertical); the MD column is not used.`);
  if (header && iDepth >= 0 && /tvdss|ss$/.test(norm(header[iDepth]))) problems.push(`"${header[iDepth]}" is below sea level; the model's depths are below its surface, so add the surface elevation or water depth if they differ.`);
  const tMax = units.temp === 'F' ? 750 : 400; const tMin = units.temp === 'F' ? 14 : -10;
  const ro = []; const temp = [];
  if (header && iDepth >= 0 && (iRo >= 0 || iT >= 0)) {
    rows.forEach((r, k) => {
      const depth = num(r[iDepth]);
      if (!Number.isFinite(depth)) { problems.push(`Row ${k + 2}: depth "${r[iDepth]}" is not a number.`); return; }
      if (depth < 0) { problems.push(`Row ${k + 2}: depth ${depth} is negative (an elevation?); depths are positive downward.`); return; }
      let any = false;
      if (iRo >= 0 && String(r[iRo] ?? '').trim() !== '') {
        const v = num(r[iRo]);
        if (!Number.isFinite(v) || v <= 0 || v > 10) problems.push(`Row ${k + 2}: Ro "${r[iRo]}" is not a reflectance in percent.`);
        else { ro.push({ depth, value: v }); any = true; }
      }
      if (iT >= 0 && String(r[iT] ?? '').trim() !== '') {
        const v = num(r[iT]);
        if (!Number.isFinite(v) || v < tMin || v > tMax) problems.push(`Row ${k + 2}: temperature "${r[iT]}" is not in degrees ${units.temp || 'C'}.`);
        else {
          const pt = { depth, value: v };
          if (iTs >= 0 && String(r[iTs] ?? '').trim() !== '') {
            const h = num(r[iTs]);
            if (Number.isFinite(h) && h > 0) pt.shutInH = h; else problems.push(`Row ${k + 2}: time since circulation "${r[iTs]}" is not a number of hours.`);
          }
          if (iKind >= 0 && /dst|static|equilib/i.test(String(r[iKind] ?? ''))) pt.kind = 'DST';
          temp.push(pt); any = true;
        }
      }
      if (!any) problems.push(`Row ${k + 2}: no Ro or temperature value.`);
    });
  }
  ro.sort((a, b) => a.depth - b.depth); temp.sort((a, b) => a.depth - b.depth);
  return { ro, temp, problems, units, columns };
}

/** Tops text -> { tops: [{name, depth}], problems } sorted by depth. */
export function parseTopsText(text) {
  const { header, rows } = parseDelimitedText(text);
  const problems = [];
  let iName = findCol(header, ['name', 'top', 'formation', 'surface', 'marker', 'horizon', 'layer']);
  let iDepth = findCol(header, ['depth', 'md', 'tvd', 'top', 'z']);
  const body = header ? rows : rows;
  if (!header) {
    // two columns, name then depth (or depth then name)
    const first = body[0] || [];
    iName = Number.isFinite(num(first[0])) ? 1 : 0;
    iDepth = iName === 0 ? 1 : 0;
  } else {
    if (iName < 0) problems.push('No name column found (name, formation, top, marker).');
    if (iDepth < 0 || iDepth === iName) problems.push('No depth column found (depth, MD, TVD).');
  }
  const tops = [];
  if (iName >= 0 && iDepth >= 0 && iDepth !== iName) {
    body.forEach((r, k) => {
      const name = String(r[iName] ?? '').trim();
      const depth = num(r[iDepth]);
      if (!name) { problems.push(`Row ${k + (header ? 2 : 1)}: no name.`); return; }
      if (!Number.isFinite(depth)) { problems.push(`Row ${k + (header ? 2 : 1)}: depth "${r[iDepth]}" is not a number.`); return; }
      tops.push({ name, depth });
    });
  }
  tops.sort((a, b) => a.depth - b.depth);
  return { tops, problems };
}

/**
 * Tops (sorted by depth) -> layers for the stratigraphy, youngest first
 * as the panel lists them. Thickness is the gap to the next top; the
 * last layer needs a base (total depth) or a default thickness. Ages
 * are placeholders (10 Ma per layer, youngest at 0) that the user must
 * type; the flag says so.
 */
export function layersFromTops(tops, { baseDepth = null, defaultThickness = 500, idFor = (i) => `top-${i}` } = {}) {
  const sorted = [...tops].sort((a, b) => a.depth - b.depth);
  const n = sorted.length;
  const layers = sorted.map((t, i) => {
    const next = i + 1 < n ? sorted[i + 1].depth : (Number.isFinite(baseDepth) && baseDepth > t.depth ? baseDepth : t.depth + defaultThickness);
    const thickness = Math.max(1, next - t.depth);
    return {
      id: idFor(i),
      name: t.name,
      thickness,
      lithology: /sand|sst|reservoir/i.test(t.name) ? 'sandstone' : /lime|carb|chalk|dolo/i.test(t.name) ? 'limestone' : /salt|halite|evap/i.test(t.name) ? 'salt' : 'shale',
      ageStart: 10 * (i + 1),
      ageEnd: 10 * i,
      sourceRock: { isSource: false, toc: 0, hi: 0, kerogen: 'type2' },
      agesGuessed: true,
    };
  });
  return layers; // youngest (shallowest) first, matching the stratigraphy panel
}

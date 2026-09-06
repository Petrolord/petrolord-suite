// Calibration and formation-top imports (BF2, 2026-09-06). Pure parsers
// on the shared delimited-text reader (src/lib/tabularFile.js): a
// calibration file carries depth with a vitrinite reflectance column, a
// temperature column, or both; a tops file carries a name and a depth.
// Every row that cannot be read is reported, never silently dropped.

import { parseDelimitedText } from '@/lib/tabularFile';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, '');
const findCol = (header, names) => {
  if (!header) return -1;
  const h = header.map(norm);
  for (const n of names) {
    const i = h.findIndex((c) => c === n || c.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
};
const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

/**
 * Calibration text -> { ro: [{depth, value}], temp: [{depth, value}], problems: string[] }.
 * Depth in metres (the caller converts display units before this if it
 * ever accepts them); Ro in % (a value above 10 is taken as a mistake),
 * temperature in degrees C.
 */
export function parseCalibrationText(text) {
  const { header, rows } = parseDelimitedText(text);
  const problems = [];
  const iDepth = findCol(header, ['depth', 'md', 'tvd', 'z']);
  const iRo = findCol(header, ['ro', '%ro', 'vr', 'vitrinite', 'reflectance', 'maturity']);
  const iT = findCol(header, ['temp', 'bht', 'tc', 't', 'temperature']);
  if (!header) problems.push('No header row found; expected columns such as depth, Ro, temperature.');
  else if (iDepth < 0) problems.push('No depth column found (depth, MD, TVD or z).');
  else if (iRo < 0 && iT < 0) problems.push('No Ro or temperature column found.');
  const ro = []; const temp = [];
  if (header && iDepth >= 0 && (iRo >= 0 || iT >= 0)) {
    rows.forEach((r, k) => {
      const depth = num(r[iDepth]);
      if (!Number.isFinite(depth)) { problems.push(`Row ${k + 2}: depth "${r[iDepth]}" is not a number.`); return; }
      let any = false;
      if (iRo >= 0 && String(r[iRo] ?? '').trim() !== '') {
        const v = num(r[iRo]);
        if (!Number.isFinite(v) || v <= 0 || v > 10) problems.push(`Row ${k + 2}: Ro "${r[iRo]}" is not a reflectance in percent.`);
        else { ro.push({ depth, value: v }); any = true; }
      }
      if (iT >= 0 && String(r[iT] ?? '').trim() !== '') {
        const v = num(r[iT]);
        if (!Number.isFinite(v) || v < -10 || v > 400) problems.push(`Row ${k + 2}: temperature "${r[iT]}" is not in degrees C.`);
        else { temp.push({ depth, value: v }); any = true; }
      }
      if (!any) problems.push(`Row ${k + 2}: no Ro or temperature value.`);
    });
  }
  ro.sort((a, b) => a.depth - b.depth); temp.sort((a, b) => a.depth - b.depth);
  return { ro, temp, problems };
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

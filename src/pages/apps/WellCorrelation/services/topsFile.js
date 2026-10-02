// Tops files in and out of Well Correlation (AppUpgrade WC-U2-004, PL2/PL3).
//
// In: a tops file as Petrel, Kingdom or Petra writes it (CSV, tab or
// semicolon; any column order; a unit in the header or chosen). The depth
// may be MD, TVD, TVDSS or an elevation (Z): TVD, TVDSS and Z are converted
// to MD through each well's own survey and KB (the registry depth frame), so
// the pick lands at the depth the file meant. The rules of the Suite's tops
// door are reused (Well Data Manager's paste plan: wells by UWI then name,
// shared wells read-only, spelling variants matched, duplicates named).
// Times are refused (a time pick needs a velocity model; import depths).
// Every row that is not applied says why; every conversion that rests on an
// assumption (no survey, no KB, past the last station) is named.
//
// Out: the section's tops with MD, TVD and TVDSS in the display unit and TWT
// from the checkshots where the well has them, with a commented header (the
// reference, the datum, the unit, the build) that this importer skips.

import { parseDelimited, guessDepthUnit } from '@/lib/wellImport';
import { pasteMapping, nonMdDepthHeader } from '@/pages/apps/WellDataManager/components/TopsSheetView';
import { planTopsPaste } from '@/pages/apps/WellDataManager/engine/topsSheet';
import { makeWellFrame, readWellDatum, tvdssFromTvd, tvdssFromElevation } from '@/lib/wellDatum';
import { wellNameKey } from '@/lib/wellNames';
import { buildLabel } from '@/lib/platformBuild';
import { twtAtTvdss } from '@/components/wells/section/timeDepth';

const M_PER_FT = 0.3048;
export const TOPS_FILE_REFS = ['md', 'tvd', 'tvdss', 'z'];
export const TOPS_FILE_REF_LABEL = { md: 'MD', tvd: 'TVD (below KB)', tvdss: 'TVDSS (below sea level)', z: 'Z elevation (negative down)' };
const REF_OF_KIND = { TVDSS: 'tvdss', TVD: 'tvd', 'an elevation (Z)': 'z', 'a time': 'time' };
const uwiKey = (s) => String(s ?? '').trim().replace(/[\s-]+/g, '').toLowerCase();

/**
 * Columns of a tops file: well, top name, and the depth column with the
 * reference and unit its header states (null when it states none).
 * MD is preferred when several depth columns are present (a Petrel export
 * carries MD, TWT and Z).
 * @returns {{well: number, name: number, depth: number, ref: ?string, unit: ?string, header: ?string[]}}
 */
export function detectTopsColumns(header) {
  const map = pasteMapping(header);
  if (!header) return { well: map.well, name: map.name, depth: map.md, ref: null, unit: null, header: null };
  const refOf = (i) => (i < 0 ? null : REF_OF_KIND[nonMdDepthHeader(header[i])] || 'md');
  let depth = map.md >= 0 && refOf(map.md) === 'md' ? map.md : -1;
  if (depth < 0) {
    for (const want of ['tvdss', 'tvd', 'z', 'time']) {
      depth = header.findIndex((h, i) => i !== map.well && i !== map.name && REF_OF_KIND[nonMdDepthHeader(h)] === want);
      if (depth >= 0) break;
    }
  }
  if (depth < 0) depth = map.md;
  const explicitMd = depth >= 0 && /\b(md|measured)\b/i.test(String(header[depth]).replace(/[_\-()[\]/,.]/g, ' '));
  const ref = depth < 0 ? null : refOf(depth) === 'md' ? (explicitMd ? 'md' : null) : refOf(depth);
  return { well: map.well, name: map.name, depth, ref, unit: depth >= 0 ? guessDepthUnit(header[depth]) : null, header };
}

/**
 * The whole import as one pure step.
 * @param {string} text file contents
 * @param {{wells: Object[], rows: Object[], unit?: 'm'|'ft', ref?: ?string}} ctx registry wells (deviation, kb_m),
 *   current sheet rows (sheetRows), the unit and depth reference chosen by the user (they override the header)
 * @returns {{error?: string, creates, updates, unchanged, problems, notes: string[], columns, ref, unit, refFromHeader: boolean, unitFromHeader: boolean, rowsRead: number}}
 */
export function planTopsFile(text, { wells = [], rows = [], unit = null, ref = null } = {}) {
  let p;
  // semicolon or tab files from a comma-decimal locale ("1990,5"): the comma
  // is the decimal point, or the header row is not recognised
  const first = String(text ?? '').split(/\r?\n/).find((l) => l.trim() && !/^\s*(#|\/\/)/.test(l)) || '';
  const src = /[;\t]/.test(first) ? String(text).replace(/(\d),(\d)/g, '$1.$2') : text;
  try { p = parseDelimited(src); } catch (e) { return { error: e.message }; }
  const cols = detectTopsColumns(p.header);
  const useRef = ref || cols.ref || 'md';
  const useUnit = unit || cols.unit || 'm';
  const base = { columns: cols, ref: useRef, unit: useUnit, refFromHeader: !ref && !!cols.ref, unitFromHeader: !unit && !!cols.unit, rowsRead: p.rows.length };
  if (cols.well < 0 || cols.name < 0 || cols.depth < 0) {
    return { ...base, error: 'Could not find the well, top-name and depth columns. The file needs a header such as Well, Top, MD (m).' };
  }
  if (useRef === 'time') {
    return { ...base, error: `The depth column "${p.header[cols.depth]}" is a time. A pick in time needs a velocity model; export the tops in MD, TVD or TVDSS from the other tool.` };
  }
  const byName = new Map(wells.map((w) => [wellNameKey(w.name), w]));
  const byUwi = new Map(wells.filter((w) => w.uwi).map((w) => [uwiKey(w.uwi), w]));
  const frames = new Map();
  const frameOf = (w) => {
    if (!frames.has(w.id)) {
      let f = null;
      try { f = makeWellFrame(w); } catch { f = null; }
      frames.set(w.id, f);
    }
    return frames.get(w.id);
  };
  const problems = [];
  const notes = new Map(); // note -> wells
  const addNote = (w, note) => notes.set(note, [...new Set([...(notes.get(note) || []), w.name])]);
  const converted = p.rows.map((cells, i) => {
    const line = i + 1;
    const wellCell = String(cells[cols.well] ?? '').trim();
    const name = String(cells[cols.name] ?? '').trim();
    const raw = String(cells[cols.depth] ?? '').trim().replace(/,(\d+)$/, '.$1');
    if (useRef === 'md') return [wellCell, name, raw === '' || !Number.isFinite(Number(raw)) ? raw : String(Number(raw) * (useUnit === 'ft' ? M_PER_FT : 1))];
    const w = byUwi.get(uwiKey(wellCell)) || byName.get(wellNameKey(wellCell));
    const v = Number(raw);
    if (!w || !name || raw === '' || !Number.isFinite(v)) return [wellCell, name, raw]; // the door names these
    const vM = v * (useUnit === 'ft' ? M_PER_FT : 1);
    const f = frameOf(w);
    if (!f) { problems.push({ line, reason: `${w.name}: its survey cannot be read, so ${TOPS_FILE_REF_LABEL[useRef]} cannot be converted to MD` }); return ['', '', '']; }
    // WDM-U2-007: a TVD pick needs no datum; a TVDSS or elevation pick needs
    // the well's reference elevation and is refused without one
    if (useRef !== 'tvd' && !f.datum.tvdssOk) { problems.push({ line, reason: `${w.name}, ${name}: the well has no depth reference elevation, so a ${TOPS_FILE_REF_LABEL[useRef]} pick cannot be turned into MD. Set it in Well Data Manager (Header tab), or load the tops in MD` }); return ['', '', '']; }
    if (f.isVertical) addNote(w, 'no survey: drawn vertical, MD = TVD');
    if (f.datum.state === 'legacy-zero' && useRef !== 'tvd') addNote(w, 'no KB: TVDSS read as TVD');
    const hit = useRef === 'tvd' ? f.tvdToMd(vM) : f.tvdssToMd(useRef === 'tvdss' ? vM : tvdssFromElevation(vM));
    if (!hit || !Number.isFinite(hit.md)) { problems.push({ line, reason: `${w.name}, ${name}: ${raw} ${useUnit} ${TOPS_FILE_REF_LABEL[useRef]} is above the depth reference or outside the survey` }); return ['', '', '']; }
    if (hit.ambiguous) { problems.push({ line, reason: `${w.name}, ${name}: that depth is reached twice along the well (it climbs); pick it in MD` }); return ['', '', '']; }
    if (hit.extrapolated) addNote(w, 'below the last survey station: continued on the last tangent');
    return [wellCell, name, String(hit.md)];
  });
  const door = planTopsPaste(converted, { well: 0, name: 1, md: 2 }, wells, rows, { mdUnit: 'm' });
  // a move smaller than half the last printed digit (0.005 of the file unit)
  // is the rounding of a file this app or another tool wrote: unchanged
  const tol = 0.005 * (useUnit === 'ft' ? M_PER_FT : 1) + 1e-9;
  const kept = door.updates.filter((u) => Math.abs(u.mdM - u.fromM) > tol);
  const plan = { ...door, updates: kept, unchanged: door.unchanged + (door.updates.length - kept.length) };
  // the door says "MD" in its reasons; say what the file held
  const refWord = TOPS_FILE_REF_LABEL[useRef].split(' ')[0];
  const doorProblems = plan.problems.map((q) => ({ ...q, reason: q.reason.replace(/^MD "/, `${refWord} "`) }));
  const allProblems = [...problems, ...doorProblems].sort((a, b) => a.line - b.line);
  return {
    ...base, creates: plan.creates, updates: plan.updates, unchanged: plan.unchanged, problems: allProblems,
    notes: [...notes.entries()].map(([note, names]) => `${names.join(', ')}: ${note}`),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmt = (v, f, dp) => (Number.isFinite(v) ? (v * f).toFixed(dp) : '');

/**
 * The section's tops as CSV: one row per top on each section well, MD, TVD
 * and TVDSS in the display unit, TWT (ms) from the well's checkshots.
 * @param {Object[]} wells section wells (name, uwi, tops, frame, kb_m, checkshots)
 * @param {{unit?: 'm'|'ft', names?: ?string[], now?: Date, build?: string, sectionName?: string}} [opts]
 */
export function topsCsv(wells, { unit = 'm', names = null, now = new Date(), build = buildLabel(), sectionName = '' } = {}) {
  const u = unit === 'ft' ? 'ft' : 'm';
  const F = unit === 'ft' ? 1 / M_PER_FT : 1;
  const lines = [
    `# Petrolord Suite Well Correlation tops${sectionName ? `: ${sectionName}` : ''}`,
    `# Depths in ${u}. MD along hole from KB; TVD below KB through the survey (minimum curvature); TVDSS below mean sea level (TVD minus KB).`,
    '# TWT (ms) from each well\'s checkshots, blank where the well has none or the top is outside them. A well with no survey is vertical.',
    `# ${now.toISOString().slice(0, 10)} · ${build}`,
    ['Well', 'UWI', 'Top', 'Surface type', `MD (${u})`, `TVD (${u})`, `TVDSS (${u})`, 'TWT (ms)', 'Interpreter', 'Confidence', 'Notes'].join(','),
  ];
  let n = 0;
  for (const w of wells) {
    const frame = w.frame || null;
    for (const t of [...(w.tops || [])].sort((a, b) => a.md_m - b.md_m)) {
      if (names && !names.includes(t.name)) continue;
      let tvd = NaN; let tvdss = NaN;
      try {
        if (frame) { const r = frame.mdToTvdss(t.md_m); tvd = r.tvd; tvdss = r.tvdss; } else { tvd = t.md_m; tvdss = tvdssFromTvd(t.md_m, readWellDatum(w)); }
      } catch { /* above the first station: blank */ }
      const twt = twtAtTvdss(w.checkshots, tvdss);
      lines.push([w.name, w.uwi || '', t.name, t.surface_type || 'formation_top', fmt(t.md_m, F, 2), fmt(tvd, F, 2), fmt(tvdss, F, 2),
        Number.isFinite(twt) ? twt.toFixed(1) : '', t.interpreter || '', t.confidence || '', t.notes || ''].map(csvCell).join(','));
      n += 1;
    }
  }
  return { text: `${lines.join('\n')}\n`, count: n };
}

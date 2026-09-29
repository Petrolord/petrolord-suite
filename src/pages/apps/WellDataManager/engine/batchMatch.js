// Batch LAS import planning (AppUpgrade WDM-U2-004): many LAS files in one
// pass, each matched to a registry well by UWI, then by name, the way
// Petra and Petrel batch loaders do. Pure planning, no I/O: the dialog
// feeds it the parse results and the visible wells, shows the review
// table, and the runner (services/batchImport.js) executes the rows.
//
// Rules (PL2, PL4: every file ends up imported or with its reason):
//   match     UWI first (spaces and dashes ignored, case-folded), then the
//             well name (case and spacing ignored, wellNameKey). When the
//             UWI points at one well and the name at another, the UWI wins
//             and the row says so.
//   own       a match on a well shared with you read-only is skipped with
//             the reason; a new well with that name would clash anyway.
//   new       an unmatched file creates a well named from ~Well (or the
//             file name when ~Well has none, said in the row). Two files
//             naming the same new well land in ONE new well: the first
//             creates it, the next merge into it.
//   refused   a file the door refused (TVDSS index, comma decimals, not a
//             LAS file) is listed with the door's own message.
//   repeats   the same file name twice: the second is skipped.

import { wellNameKey } from '@/lib/wellNames';

export const uwiKey = (s) => String(s ?? '').trim().replace(/[\s-]+/g, '').toLowerCase();
const stem = (f) => String(f || '').replace(/\.[^.]+$/, '').trim();

/**
 * @param {Array<{fileName: string, parsed?: {meta: Object, prep: Object}, error?: string}>} files
 * @param {Object[]} wells visible registry rows (is_own)
 * @returns {Object[]} one plan row per file:
 *   {i, fileName, wellName, uwi, nameFromFile, action: 'into'|'new'|'skip',
 *    wellId, newKey, reason, note, nCurves, xy: {x, y, unit}|null, kbM, tdMdM}
 */
export function planBatch(files, wells) {
  const byUwi = new Map();
  const byName = new Map();
  for (const w of wells || []) {
    if (w.uwi) byUwi.set(uwiKey(w.uwi), w);
    byName.set(wellNameKey(w.name), w);
  }
  const seenFiles = new Map();
  const newOwner = new Map(); // newKey -> row index that creates it
  return (files || []).map((f, i) => {
    const row = {
      i, fileName: f.fileName, wellName: '', uwi: null, nameFromFile: false, action: 'skip', wellId: null, newKey: null,
      reason: null, note: null, nCurves: 0, xy: null, kbM: null, tdMdM: null,
    };
    const dupOf = seenFiles.get(String(f.fileName).toLowerCase());
    if (dupOf !== undefined) { row.reason = `the same file name as row ${dupOf + 1}`; return row; }
    seenFiles.set(String(f.fileName).toLowerCase(), i);
    if (f.error || !f.parsed) { row.reason = f.error || 'not read'; return row; }
    const s = f.parsed.meta?.suggestedHeader || {};
    row.nCurves = Math.max(0, (f.parsed.prep?.logs?.length || 1) - 1);
    if (!row.nCurves) { row.reason = 'no curves besides depth'; return row; }
    row.uwi = s.uwi ? String(s.uwi).trim() : null;
    row.wellName = String(s.name || '').trim();
    if (!row.wellName) { row.wellName = stem(f.fileName); row.nameFromFile = true; }
    if (s.surfaceX != null && s.surfaceY != null) row.xy = { x: s.surfaceX, y: s.surfaceY, unit: s.xyUnit || null };
    row.kbM = Number.isFinite(s.kbM) ? s.kbM : null;
    row.tdMdM = Number.isFinite(s.tdMdM) ? s.tdMdM : null;

    const byU = row.uwi ? byUwi.get(uwiKey(row.uwi)) : null;
    const byN = byName.get(wellNameKey(row.wellName));
    const match = byU || byN;
    if (byU && byN && byU.id !== byN.id) row.note = `UWI ${row.uwi} is ${byU.name}; the name matches ${byN.name}. The UWI is used.`;
    if (match) {
      if (!match.is_own) { row.reason = `${match.name} is shared with you read-only`; return row; }
      row.action = 'into';
      row.wellId = match.id;
      row.note = row.note || `matched by ${byU ? 'UWI' : 'name'} to ${match.name}`;
      return row;
    }
    row.action = 'new';
    row.newKey = wellNameKey(row.wellName);
    if (newOwner.has(row.newKey)) row.note = `goes into the new well from row ${newOwner.get(row.newKey) + 1}`;
    else {
      newOwner.set(row.newKey, i);
      row.note = row.nameFromFile ? 'new well, named from the file name (the file has no WELL)' : 'new well';
    }
    return row;
  });
}

/** Rows that will create a well (the first of each new name). */
export const creatorRows = (rows) => {
  const seen = new Set();
  return rows.filter((r) => {
    if (r.action !== 'new' || seen.has(r.newKey)) return false;
    seen.add(r.newKey);
    return true;
  });
};

/**
 * Check the plan before anything is written: every new well needs a surface
 * location (the registry requires one) from the file or typed in the row.
 * @param {Object[]} rows @param {Object<number, {x: string, y: string}>} typedXy by row index
 * @returns {string[]} problems, empty when the plan can run
 */
export function checkBatch(rows, typedXy = {}) {
  const problems = [];
  for (const r of creatorRows(rows)) {
    const t = typedXy[r.i];
    const x = t && String(t.x).trim() !== '' ? Number(t.x) : r.xy?.x;
    const y = t && String(t.y).trim() !== '' ? Number(t.y) : r.xy?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) problems.push(`Row ${r.i + 1} (${r.wellName}): a new well needs its surface X and Y.`);
  }
  if (!rows.some((r) => r.action !== 'skip')) problems.push('Nothing to import: every file is skipped.');
  return problems;
}

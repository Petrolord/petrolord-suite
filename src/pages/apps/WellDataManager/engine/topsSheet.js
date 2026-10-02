// Cross-well tops sheet (AppUpgrade WDM-U2-005): Petrel's well tops
// spreadsheet on the shared registry. One row per top across every well
// the user can see, with MD, TVD and TVDSS; edits, a bulk rename and a
// paste from Excel all resolve to plain per-top writes (updateTop keeps
// the top's id, so Well Correlation keeps its picks).
//
// Pure planning, no I/O. Every plan reports what it will NOT do and why
// (read-only well, no such well, a name the well already has), so nothing
// is dropped silently (PL4).

import { makeWellFrame } from '@/lib/wellDatum';
import { wellNameKey } from '@/lib/wellNames';
import { fromDisp } from './displayUnits';

const nameKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const uwiKey = (s) => String(s ?? '').trim().replace(/[\s-]+/g, '').toLowerCase();

/**
 * Flat, sorted sheet rows (well name, then MD).
 * @param {Object[]} wells registry rows (with is_own)
 * @param {Object[]} tops every top row (well_id)
 */
export function sheetRows(wells, tops) {
  const byId = new Map((wells || []).map((w) => [w.id, w]));
  const frames = new Map();
  const frameOf = (w) => {
    if (!frames.has(w.id)) frames.set(w.id, makeWellFrame(w));
    return frames.get(w.id);
  };
  const rows = [];
  for (const t of tops || []) {
    const w = byId.get(t.well_id);
    if (!w) continue;
    let pos = null;
    try { pos = frameOf(w).mdToPosition(Number(t.md_m)); } catch (e) { pos = null; }
    rows.push({
      topId: t.id, wellId: w.id, wellName: w.name, uwi: w.uwi || null, isOwn: !!w.is_own,
      name: t.name, md_m: Number(t.md_m), tvd: pos ? pos.tvd : null, tvdss: pos && Number.isFinite(pos.tvdss) ? pos.tvdss : null,
      extrapolated: !!pos?.extrapolated, surface_type: t.surface_type || null, interpreter: t.interpreter || null,
      // WDM-U2-007: null when the datum gives a TVDSS; 'unset' when the well
      // has no reference elevation (TVDSS withheld); 'zero' before the
      // registry upgrade, when a KB of 0 may mean not entered
      datumFlag: (() => { const d = frameOf(w).datum; return !d.tvdssOk ? 'unset' : d.state === 'legacy-zero' ? 'zero' : null; })(),
    });
  }
  rows.sort((a, b) => a.wellName.localeCompare(b.wellName) || a.md_m - b.md_m);
  return rows;
}

/** Per top name: how many wells carry it and which do not. */
export function topNameSummary(rows, wells) {
  const all = (wells || []).map((w) => w.name);
  const by = new Map();
  for (const r of rows) {
    const k = nameKey(r.name);
    if (!by.has(k)) by.set(k, { name: r.name, wells: new Set() });
    by.get(k).wells.add(r.wellName);
  }
  return [...by.values()]
    .map((e) => ({ name: e.name, count: e.wells.size, total: all.length, missing: all.filter((n) => !e.wells.has(n)) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Rename a top across wells. Own wells only; a well that already has the
 * new name keeps both tops untouched and is reported.
 * @returns {{updates: {topId: string, name: string}[], readOnly: string[], conflicts: string[]}}
 */
export function planBulkRename(rows, from, to) {
  const f = nameKey(from);
  const newName = String(to ?? '').trim();
  if (!f) throw new Error('Choose the top name to rename.');
  if (!newName) throw new Error('Type the new name.');
  const updates = [];
  const readOnly = [];
  const conflicts = [];
  for (const r of rows) {
    if (nameKey(r.name) !== f || r.name === newName) continue;
    if (!r.isOwn) { readOnly.push(r.wellName); continue; }
    const clash = nameKey(newName) !== f && rows.some((x) => x.wellId === r.wellId && x.topId !== r.topId && nameKey(x.name) === nameKey(newName));
    if (clash) { conflicts.push(r.wellName); continue; }
    updates.push({ topId: r.topId, name: newName });
  }
  return { updates, readOnly, conflicts };
}

/**
 * Plan a paste of (well, top, MD) rows from Excel or a Petrel export.
 * Wells match by UWI first, then by name (case and spacing ignored).
 * @param {string[][]} dataRows parsed rows (no header)
 * @param {{well: number, name: number, md: number}} map column indices
 * @param {Object[]} wells @param {Object[]} rows current sheet rows
 * @param {{mdUnit?: 'm'|'ft'}} [opts]
 * @returns {{creates: Object[], updates: Object[], unchanged: number, problems: {line: number, reason: string}[]}}
 */
export function planTopsPaste(dataRows, map, wells, rows, { mdUnit = 'm' } = {}) {
  if (map.well < 0 || map.name < 0 || map.md < 0) throw new Error('Map the well, top-name and MD columns first.');
  const byName = new Map((wells || []).map((w) => [wellNameKey(w.name), w]));
  const byUwi = new Map((wells || []).filter((w) => w.uwi).map((w) => [uwiKey(w.uwi), w]));
  const creates = [];
  const updates = [];
  const problems = [];
  let unchanged = 0;
  const seen = new Map();
  dataRows.forEach((cells, i) => {
    const line = i + 1;
    const wellCell = String(cells[map.well] ?? '').trim();
    const name = String(cells[map.name] ?? '').trim();
    const raw = String(cells[map.md] ?? '').trim();
    if (!wellCell && !name && !raw) return;
    const w = byUwi.get(uwiKey(wellCell)) || byName.get(wellNameKey(wellCell));
    if (!w) { problems.push({ line, reason: `no well named or with UWI "${wellCell}"` }); return; }
    if (!w.is_own) { problems.push({ line, reason: `${w.name} is shared with you read-only` }); return; }
    if (!name) { problems.push({ line, reason: 'the top has no name' }); return; }
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v)) { problems.push({ line, reason: `MD "${raw}" is not a number` }); return; }
    const key = `${w.id}|${nameKey(name)}`;
    if (seen.has(key)) { problems.push({ line, reason: `${name} in ${w.name} also appears on line ${seen.get(key)}; only the first is used` }); return; }
    seen.set(key, line);
    const mdM = fromDisp(v, mdUnit);
    const existing = rows.find((r) => r.wellId === w.id && nameKey(r.name) === nameKey(name));
    if (!existing) creates.push({ wellId: w.id, wellName: w.name, name, mdM });
    else if (Math.abs(existing.md_m - mdM) > 1e-9) updates.push({ topId: existing.topId, wellName: w.name, name: existing.name, mdM, fromM: existing.md_m });
    else unchanged += 1;
  });
  return { creates, updates, unchanged, problems };
}

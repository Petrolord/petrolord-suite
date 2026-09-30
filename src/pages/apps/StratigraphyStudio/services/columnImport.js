// Stratigraphic column import (AppUpgrade STRAT-U1-016, 2026-09-30). The
// column editor could only be typed row by row; a Petrel zone hierarchy, a
// StrataBugs chart or the company spreadsheet had no door. This reads a
// delimited file (comma, semicolon with comma decimals, tab) with a header
// naming each unit, its rank, its parent (by name), top and base ages (Ma,
// or ka when the header says so) and a colour, in any column order and any
// row order (a child may come before its parent). It returns rows for the
// editor, never saves: the editor's engine validation (validateColumn)
// still refuses a column with problems as a whole. Pure.

import { parseDelimitedText } from '@/lib/tabularFile';
import { RANKS } from '@/lib/stratigraphy/column';

const norm = (h) => String(h || '').toLowerCase().replace(/[_\-()[\]/,.]/g, ' ').replace(/\s+/g, ' ').trim();
const COLS = {
  name: ['name', 'unit', 'unit name', 'formation name', 'zone', 'zone name', 'stratigraphic unit'],
  rank: ['rank', 'level', 'type', 'unit rank', 'hierarchy'],
  parent: ['parent', 'parent unit', 'inside', 'group', 'parent name', 'belongs to'],
  top: ['top ma', 'top ka', 'top age', 'top age ma', 'top age ka', 'age top', 'age top ma', 'age top ka', 'top'],
  base: ['base ma', 'base ka', 'base age', 'base age ma', 'base age ka', 'age base', 'age base ma', 'age base ka', 'base', 'bottom age'],
  colour: ['colour', 'color', 'hex', 'rgb', 'colour hex', 'color hex'],
};
const RANK_OF = { group: 'group', gp: 'group', grp: 'group', formation: 'formation', fm: 'formation', fmn: 'formation', member: 'member', mbr: 'member', mb: 'member', bed: 'bed', bd: 'bed' };
const findCol = (head, names) => head.findIndex((h) => names.includes(h));
const kaOf = (cell) => /\bka\b|\bkyr\b|\bky\b/.test(norm(cell));
const num = (v, dc) => { const raw = String(v ?? '').trim(); return raw === '' ? null : Number(dc ? raw.replace(',', '.') : raw); };
const fmt = (v) => String(Number(Number(v).toFixed(6)));

/**
 * @param {string} text the file
 * @param {Array} existing the column's current units (names already there are left as they are)
 * @returns {{ rows: Array<{id, name, rank, parentName: ?string, age_top_ma: ?number, age_base_ma: ?number, colour: ?string}>, problems: string[], notes: string[] }}
 */
export function parseColumnFile(text, existing = []) {
  const body = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  if (!body) throw new Error('The column file is empty.');
  const parsed = parseDelimitedText(body);
  const header = parsed.header || [];
  const head = header.map(norm);
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, findCol(head, names)]));
  if (col.name < 0) throw new Error('The column file needs a unit name column (name, unit or zone). Other columns read: rank or level, parent, top and base age (Ma or ka), colour.');
  const dc = parsed.delimiter === ';';
  const kTop = col.top >= 0 && kaOf(header[col.top]) ? 0.001 : 1;
  const kBase = col.base >= 0 && kaOf(header[col.base]) ? 0.001 : 1;
  const problems = []; const notes = [];
  if (kTop !== 1 || kBase !== 1) notes.push('ages read in ka and converted to Ma');
  const have = new Set((existing || []).map((u) => String(u.name || '').trim().toLowerCase()));
  const seen = new Map();
  const rows = [];
  parsed.rows.forEach((c, i) => {
    const line = i + 2;
    const name = String(c[col.name] ?? '').trim();
    if (!name) { problems.push(`Row ${line}: no unit name.`); return; }
    const rawRank = col.rank >= 0 ? norm(c[col.rank]) : 'formation';
    const rank = RANK_OF[rawRank] || null;
    if (!rank) { problems.push(`Row ${line}: ${name} has the rank "${c[col.rank]}"; the column takes ${RANKS.join(', ')}.`); return; }
    const top = col.top >= 0 ? num(c[col.top], dc) : null;
    const base = col.base >= 0 ? num(c[col.base], dc) : null;
    if ((top != null && !Number.isFinite(top)) || (base != null && !Number.isFinite(base))) { problems.push(`Row ${line}: ${name} ages must be numbers.`); return; }
    const row = {
      name, rank,
      parentName: col.parent >= 0 ? String(c[col.parent] ?? '').trim() || null : null,
      age_top_ma: top == null ? null : Number((top * kTop).toFixed(9)),
      age_base_ma: base == null ? null : Number((base * kBase).toFixed(9)),
      colour: col.colour >= 0 && /^#?[0-9a-f]{6}$/i.test(String(c[col.colour] ?? '').trim()) ? `#${String(c[col.colour]).trim().replace('#', '')}` : null,
    };
    const key = name.toLowerCase();
    if (have.has(key)) { notes.push(`${name} is already in the column and was left as it is`); return; }
    if (seen.has(key)) {
      const a = seen.get(key);
      const same = a.rank === row.rank && a.parentName === row.parentName && a.age_top_ma === row.age_top_ma && a.age_base_ma === row.age_base_ma;
      if (!same) problems.push(`Row ${line}: ${name} is listed twice with different ranks, parents or ages; the first row (row ${a.line}) was kept.`);
      else notes.push(`${name} repeated on row ${line} was read once`);
      return;
    }
    const r = { ...row, id: `import-${i}`, line };
    seen.set(key, r);
    rows.push(r);
  });
  // parents by name, in the file or already in the column
  const known = new Set([...have, ...rows.map((r) => r.name.toLowerCase())]);
  for (const r of rows) {
    if (r.parentName && !known.has(r.parentName.toLowerCase())) {
      notes.push(`${r.name}: parent "${r.parentName}" is not in the file or the column, so it goes in at the top level`);
      r.parentName = null;
    }
  }
  // siblings whose ages overlap (units of one rank inside one parent should not)
  const groups = new Map();
  for (const r of rows) {
    if (r.age_top_ma == null || r.age_base_ma == null) continue;
    const k = `${(r.parentName || '').toLowerCase()}|${r.rank}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.age_top_ma - b.age_top_ma);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]; const b = sorted[i + 1];
      if (b.age_top_ma < a.age_base_ma - 1e-9) notes.push(`${a.name} and ${b.name} overlap in age (${fmt(b.age_top_ma)} to ${fmt(Math.min(a.age_base_ma, b.age_base_ma))} Ma)`);
    }
  }
  return { rows: rows.map(({ line, ...r }) => r), problems, notes };
}

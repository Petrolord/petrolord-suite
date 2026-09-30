// Biozone schemes (Stratigraphy T1 ST-T1-001, 2026-09-26). The Studio
// ships no zone ages of its own: zone calibrations differ between
// timescales and operators (planktonic foraminifera, calcareous
// nannofossils, the Niger Delta palynological and foraminiferal zones), so
// the user imports the scheme their company uses as a CSV with its source,
// and the Studio dates biozone intervals from it. Pure, no I/O except the
// remembered schemes in this browser.

export const ZONE_SCHEMES_KEY = 'strat.zoneSchemes';

// AppUpgrade STRAT-U1-006/007 (2026-09-30): the file is read with the Suite's
// delimited reader (comma, semicolon with comma decimals, tab), vendor column
// names are recognised, ages in ka convert to Ma, zones that disagree with
// themselves are refused, and overlaps inside one scheme are noted.
import { parseDelimitedText } from '@/lib/tabularFile';

const norm = (h) => String(h || '').toLowerCase().replace(/[_\-()[\]/,.]/g, ' ').replace(/\s+/g, ' ').trim();
const COLS = {
  scheme: ['scheme', 'zonation', 'zonation scheme', 'scheme name', 'biozonation', 'zone scheme'],
  zone: ['zone', 'biozone', 'zone name', 'zone code', 'code'],
  top: ['top ma', 'top ka', 'top age', 'top age ma', 'top age ka', 'age top', 'age top ma', 'age top ka', 'top', 'younger age', 'young age', 'top age my'],
  base: ['base ma', 'base ka', 'base age', 'base age ma', 'base age ka', 'age base', 'age base ma', 'age base ka', 'base', 'bottom age', 'older age', 'old age', 'base age my'],
  source: ['source', 'reference', 'ref', 'citation', 'calibration', 'authority'],
};
const findCol = (head, names) => head.findIndex((h) => names.includes(h));
const ageUnitOf = (cell) => (/\bka\b|\bkyr\b|\bky\b/.test(norm(cell)) ? 'ka' : 'Ma');
const numOf = (v, decimalComma) => {
  const raw = String(v ?? '').trim();
  if (raw === '') return NaN;
  return Number(decimalComma ? raw.replace(',', '.') : raw);
};
const fmt = (v) => String(Number(v.toFixed(6)));

/**
 * A zone scheme file: a header naming the scheme, zone, top and base ages
 * and a source, in any order, with vendor names accepted (Zonation, Top
 * Age, Base Age, Reference). Ages in Ma unless the header says ka; base
 * older than top.
 * @returns {{zones: Array<{scheme, zone, top_ma, base_ma, source}>, problems: string[], notes: string[]}}
 */
export function parseZoneSchemeCsv(text) {
  const body = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  if (!body) throw new Error('The zone scheme file is empty.');
  const parsed = parseDelimitedText(body);
  const header = parsed.header || [];
  const head = header.map(norm);
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, findCol(head, names)]));
  for (const [need, label] of [['scheme', 'scheme'], ['zone', 'zone'], ['top', 'top_ma'], ['base', 'base_ma'], ['source', 'source']]) {
    if (col[need] < 0) throw new Error(`The zone scheme needs a "${label}" column (header: scheme, zone, top_ma, base_ma, source; Zonation, Top Age, Base Age and Reference are read too).`);
  }
  const unitTop = ageUnitOf(header[col.top]); const unitBase = ageUnitOf(header[col.base]);
  const k = (u) => (u === 'ka' ? 0.001 : 1);
  const dc = parsed.delimiter === ';';
  const problems = []; const notes = [];
  if (unitTop === 'ka' || unitBase === 'ka') notes.push('ages read in ka and converted to Ma');
  const rows = [];
  parsed.rows.forEach((c, i) => {
    const row = i + 2;
    const z = { scheme: String(c[col.scheme] ?? '').trim(), zone: String(c[col.zone] ?? '').trim(), top_ma: numOf(c[col.top], dc) * k(unitTop), base_ma: numOf(c[col.base], dc) * k(unitBase), source: String(c[col.source] ?? '').trim() };
    if (!z.scheme || !z.zone) { problems.push(`Row ${row}: scheme and zone are required.`); return; }
    if (!Number.isFinite(z.top_ma) || !Number.isFinite(z.base_ma)) { problems.push(`Row ${row}: ${z.zone} ages must be numbers.`); return; }
    z.top_ma = Number(z.top_ma.toFixed(9)); z.base_ma = Number(z.base_ma.toFixed(9));
    if (!(z.base_ma > z.top_ma)) { problems.push(`Row ${row}: ${z.zone} base (${fmt(z.base_ma)} Ma) must be older than its top (${fmt(z.top_ma)} Ma).`); return; }
    if (!z.source) { problems.push(`Row ${row}: ${z.zone} needs a source (the chart or paper the ages come from).`); return; }
    rows.push(z);
  });
  // one zone, one age range: identical repeats collapse; rows that disagree date nothing
  const groups = new Map();
  for (const z of rows) {
    const key = `${z.scheme.toLowerCase()}|${z.zone.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(z);
  }
  const zones = [];
  for (const list of groups.values()) {
    const ranges = [...new Set(list.map((z) => `${z.top_ma}|${z.base_ma}`))];
    if (ranges.length > 1) {
      problems.push(`${list[0].zone} appears ${list.length} times with different ages (${list.map((z) => `${fmt(z.top_ma)} to ${fmt(z.base_ma)} Ma`).join(', ')}); not imported. Keep one calibration per scheme.`);
      continue;
    }
    zones.push(list[0]);
  }
  // overlaps inside one scheme (consecutive zones of one scheme should tile)
  const byScheme = new Map();
  for (const z of zones) { const s = z.scheme.toLowerCase(); if (!byScheme.has(s)) byScheme.set(s, []); byScheme.get(s).push(z); }
  for (const list of byScheme.values()) {
    const sorted = [...list].sort((a, b) => a.top_ma - b.top_ma);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]; const b = sorted[i + 1];
      if (b.top_ma < a.base_ma - 1e-9) notes.push(`${a.scheme}: ${a.zone} and ${b.zone} overlap (${fmt(b.top_ma)} to ${fmt(Math.min(a.base_ma, b.base_ma))} Ma)`);
    }
  }
  return { zones, problems, notes };
}

/**
 * Zones already remembered plus a newly imported file: the schemes the file
 * names replace their old zones, every other scheme is kept.
 * @returns {{zones: Array, replaced: Array<{scheme: string, before: number}>}}
 */
export function mergeZoneSchemes(existing, incoming) {
  const incomingSchemes = new Set((incoming || []).map((z) => z.scheme.toLowerCase()));
  const replaced = [];
  const counts = new Map();
  for (const z of existing || []) {
    const s = z.scheme.toLowerCase();
    if (incomingSchemes.has(s)) counts.set(s, { scheme: z.scheme, before: (counts.get(s)?.before || 0) + 1 });
  }
  for (const v of counts.values()) replaced.push(v);
  return { zones: [...(existing || []).filter((z) => !incomingSchemes.has(z.scheme.toLowerCase())), ...(incoming || [])], replaced };
}

const key = (s) => String(s || '').trim().toLowerCase();

/**
 * Date biozone intervals from the scheme: an interval whose scheme and code
 * match a zone takes the zone's top and base ages; intervals already dated
 * keep their ages unless `overwrite`.
 * @param {Array} intervals registry interval rows (kind biozone_interval)
 * @returns {{rows: Array, filled: number, unmatched: string[]}}
 */
export function fillBiozoneAges(intervals, zones, { overwrite = false } = {}) {
  const idx = new Map(zones.map((z) => [`${key(z.scheme)}|${key(z.zone)}`, z]));
  let filled = 0; const unmatched = [];
  const rows = (intervals || []).map((iv) => {
    const p = iv.properties || {};
    const z = idx.get(`${key(p.scheme)}|${key(iv.code)}`);
    if (!z) { unmatched.push(`${p.scheme ? `${p.scheme} ` : ''}${iv.code || '(no code)'}`); return iv; }
    if (!overwrite && Number.isFinite(p.age_top_ma) && Number.isFinite(p.age_base_ma)) return iv;
    filled += 1;
    return { ...iv, properties: { ...p, age_top_ma: z.top_ma, age_base_ma: z.base_ma, age_source: z.source } };
  });
  return { rows, filled, unmatched };
}

export function loadZoneSchemes() {
  try { const v = JSON.parse(localStorage.getItem(ZONE_SCHEMES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveZoneSchemes(zones) {
  try { localStorage.setItem(ZONE_SCHEMES_KEY, JSON.stringify(zones)); } catch { /* private mode */ }
}

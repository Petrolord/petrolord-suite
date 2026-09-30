// Biostratigraphic event files (AppUpgrade STRAT-U2-009): the events of a
// well (depth, event, taxon) and the event dictionary a biostratigrapher
// dates them from (taxon, event, age). Read with the Suite's delimited
// reader (comma, tab, semicolon with comma decimals), headers in any order
// with vendor names, events by code or common alias (T, B, HO, LO, top acme
// ...), depths in m or ft (from the header or chosen), ages in Ma or ka.
// Every row that is not read is named with its reason. Pure.

import { parseDelimitedText } from '@/lib/tabularFile';
import { bioEvent, eventTopName, BIO_EVENT_CODES } from '@/lib/stratigraphy/biostrat';
import { intervalDepthProblem } from '@/lib/wellImport';

const norm = (h) => ` ${String(h || '').toLowerCase().replace(/[_\-()[\]/,.:]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const find = (head, names) => head.findIndex((h) => names.some((n) => h.includes(` ${n} `)));
const num = (v, dc) => { const s = String(v ?? '').trim(); if (!s) return NaN; return Number(dc ? s.replace(',', '.') : s); };
const clean = (text) => String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');

/**
 * Events of one well from pasted or file text.
 * @param {string} text
 * @param {{ unit?: 'm'|'ft' }} [opts] depth unit when the header does not say
 * @returns {{ rows: Array<{name, event, taxon, md_m}>, problems: string[], notes: string[], unit: 'm'|'ft' }}
 */
export function parseEventRows(text, { unit = 'm' } = {}) {
  const body = clean(text);
  if (!body) throw new Error('Paste the events first: depth, event and taxon.');
  const parsed = parseDelimitedText(body);
  const header = parsed.header || [];
  const head = header.map(norm);
  const col = {
    depth: find(head, ['md', 'depth', 'measured depth', 'sample depth']),
    event: find(head, ['event', 'datum type', 'type', 'occurrence']),
    taxon: find(head, ['taxon', 'species', 'fossil', 'marker', 'name']),
  };
  if (!parsed.header) { col.depth = 0; col.event = 1; col.taxon = 2; }
  if (col.depth < 0) {
    // a time, TVDSS or elevation column is refused with its reason (the interval door's rule)
    const other = header.map((h) => intervalDepthProblem(h)).find(Boolean);
    if (other) throw new Error(other.replace('Intervals are stored', 'Events are stored'));
  }
  if (col.depth < 0 || col.event < 0 || col.taxon < 0) throw new Error('The events need depth, event and taxon columns (MD or Depth; Event or Type; Taxon or Species).');
  const why = parsed.header ? intervalDepthProblem(header[col.depth]) : null;
  if (why) throw new Error(why.replace('Intervals are stored', 'Events are stored'));
  const hdrUnit = parsed.header && /\b(ft|feet|foot)\b/.test(norm(header[col.depth])) ? 'ft' : parsed.header && /\b(m|metres?|meters?)\b/.test(norm(header[col.depth])) ? 'm' : null;
  const u = hdrUnit || unit;
  const k = u === 'ft' ? 0.3048 : 1;
  const dc = parsed.delimiter === ';';
  const rows = []; const problems = []; const notes = [];
  if (hdrUnit) notes.push(`depths read in ${hdrUnit} from the header`);
  parsed.rows.forEach((c, i) => {
    const r = i + (parsed.header ? 2 : 1);
    const d = num(c[col.depth], dc);
    const e = bioEvent(c[col.event]);
    const taxon = String(c[col.taxon] ?? '').trim();
    if (!Number.isFinite(d)) { problems.push(`Row ${r}: the depth "${c[col.depth] ?? ''}" is not a number.`); return; }
    if (!e) { problems.push(`Row ${r}: "${c[col.event] ?? ''}" is not an event (${BIO_EVENT_CODES.join(', ')}, or T, B, HO, LO).`); return; }
    if (!taxon) { problems.push(`Row ${r}: no taxon.`); return; }
    rows.push({ name: eventTopName(e.code, taxon), event: e.code, taxon, md_m: Number((d * k).toFixed(6)) });
  });
  const seen = new Map();
  for (const row of rows) {
    const prev = seen.get(row.name);
    if (prev && prev.md_m !== row.md_m) problems.push(`${row.name} is given twice (${prev.md_m} and ${row.md_m} m); the first is kept.`);
    if (!prev) seen.set(row.name, row);
  }
  return { rows: [...seen.values()], problems, notes, unit: u };
}

/**
 * The event dictionary: calibrated ages of events by taxon.
 * @returns {{ rows: Array<{taxon, event, age_ma, reference}>, problems: string[], notes: string[] }}
 */
export function parseEventDictionary(text) {
  const body = clean(text);
  if (!body) throw new Error('The event dictionary is empty.');
  const parsed = parseDelimitedText(body);
  const header = parsed.header || [];
  const head = header.map(norm);
  const col = {
    taxon: find(head, ['taxon', 'species', 'fossil', 'marker']),
    event: find(head, ['event', 'datum type', 'type']),
    age: find(head, ['age', 'age ma', 'ma', 'ka', 'calibrated age']),
    reference: find(head, ['reference', 'source', 'calibration', 'citation']),
  };
  if (col.taxon < 0 || col.event < 0 || col.age < 0) throw new Error('The dictionary needs taxon, event and age columns (a reference column is read too).');
  const ka = /\bka\b/.test(norm(header[col.age]));
  const dc = parsed.delimiter === ';';
  const rows = []; const problems = []; const notes = ka ? ['ages read in ka and converted to Ma'] : [];
  const seen = new Map();
  parsed.rows.forEach((c, i) => {
    const r = i + 2;
    const e = bioEvent(c[col.event]);
    const taxon = String(c[col.taxon] ?? '').trim();
    const a = num(c[col.age], dc) * (ka ? 0.001 : 1);
    if (!taxon) { problems.push(`Row ${r}: no taxon.`); return; }
    if (!e) { problems.push(`Row ${r}: "${c[col.event] ?? ''}" is not an event.`); return; }
    if (!Number.isFinite(a) || a < 0) { problems.push(`Row ${r}: the age "${c[col.age] ?? ''}" is not an age in Ma.`); return; }
    const key = `${taxon.toLowerCase()}|${e.code}`;
    const prev = seen.get(key);
    if (prev) {
      if (prev.age_ma !== a) problems.push(`${e.code} ${taxon} is dated twice (${prev.age_ma} and ${a} Ma); neither is used.`);
      if (prev.age_ma !== a) prev.conflict = true;
      return;
    }
    const row = { taxon, event: e.code, age_ma: Number(a.toFixed(6)), reference: col.reference >= 0 ? String(c[col.reference] ?? '').trim() : '' };
    seen.set(key, row); rows.push(row);
  });
  return { rows: rows.filter((x) => !x.conflict), problems, notes };
}

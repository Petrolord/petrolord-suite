/**
 * What a deck says about itself, read from its text (SIM-U1; RL5, RL7): the
 * unit system, the phases, the grid size, the start date, the
 * equilibration, the wells and the schedule, which property tables it
 * carries, the files it includes and the comment lines a generated deck
 * opens with (the provenance of its PVT and saturation tables).
 *
 * A reader of the deck as written, for the report and the Results tab:
 * nothing is computed and the simulator stays the judge of what the deck
 * means. What sits in an INCLUDE file is not read, and the summary says so.
 *
 * Pure.
 */

const KEYWORD = /^([A-Z][A-Z0-9_-]{0,7})\s*$/;
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, JLY: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/** Comment-free lines; `--` starts a comment anywhere outside quotes. */
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length - 1; i += 1) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '\'' || c === '"') { q = c; continue; }
    if (c === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}

/** "3*30.4" -> [30.4, 30.4, 30.4]; a bare "3*" -> three defaults (null). */
function expand(tokens) {
  const out = [];
  for (const t of tokens) {
    const m = /^(\d+)\*(.*)$/.exec(t);
    if (m) {
      const n = Number(m[1]);
      const v = m[2] === '' ? null : m[2];
      for (let i = 0; i < n; i += 1) out.push(v);
    } else out.push(t);
  }
  return out;
}

const tokenize = (s) => (s.match(/'[^']*'|"[^"]*"|\S+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));
const num = (t) => {
  if (t == null || t === '') return null;
  const v = Number(String(t).replace(/[dD]/, 'e'));
  return Number.isFinite(v) ? v : null;
};

function eclDate(tokens) {
  const [d, mon, y] = tokens;
  const m = MONTHS[String(mon || '').toUpperCase().slice(0, 3)];
  const day = Number(d);
  const year = Number(y);
  if (!m || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Split a deck into keyword blocks: [{ keyword, records: string[][] }], each
 * record the tokens up to its closing slash. Keywords with no data (OIL,
 * FIELD, END) have no records.
 */
export function deckBlocks(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  let buf = [];
  for (const raw of lines) {
    const line = stripComment(raw).replace(/\s+$/, '');
    const km = KEYWORD.exec(line);
    if (km && !/^\d/.test(line)) {
      cur = { keyword: km[1], records: [] };
      blocks.push(cur);
      buf = [];
      continue;
    }
    if (!cur || !line.trim()) continue;
    // a record ends at '/'; several can share a line
    let rest = line;
    while (rest.length) {
      const slash = rest.indexOf('/');
      if (slash < 0) { buf.push(...tokenize(rest)); break; }
      buf.push(...tokenize(rest.slice(0, slash)));
      cur.records.push(buf);
      buf = [];
      rest = rest.slice(slash + 1);
    }
  }
  return blocks;
}

/** The comment lines the deck opens with (before its first keyword), without the dashes. */
export function deckHeaderNotes(text) {
  const out = [];
  for (const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (!t.startsWith('--')) break;
    out.push(t.replace(/^--\s?/, ''));
  }
  return out;
}

/**
 * @param {string} text the main deck
 * @returns {object} the summary; every field is null when the deck does not say
 */
export function summarizeDeck(text) {
  const blocks = deckBlocks(text);
  const has = (k) => blocks.some((b) => b.keyword === k);
  const first = (k) => blocks.find((b) => b.keyword === k) || null;
  const all = (k) => blocks.filter((b) => b.keyword === k);

  const systems = ['FIELD', 'METRIC', 'LAB', 'PVT-M'].filter((k) => has(k));
  const unitSystem = systems[0] || null;

  const dimens = first('DIMENS')?.records?.[0];
  const dims = dimens ? dimens.slice(0, 3).map(num) : null;
  const startRec = first('START')?.records?.[0];
  const start = startRec ? eclDate(startRec) : null;

  const equilRec = first('EQUIL')?.records?.[0];
  const equil = equilRec ? (() => {
    const v = expand(equilRec).map(num);
    return { datumDepth: v[0], datumPressure: v[1], owc: v[2], pcowAtOwc: v[3], goc: v[4], pcgoAtGoc: v[5] };
  })() : null;

  const wells = [];
  for (const b of all('WELSPECS')) {
    for (const r of b.records) {
      if (!r.length) continue;
      const v = expand(r);
      if (!wells.some((w) => w.name === v[0])) {
        wells.push({ name: v[0], group: v[1] || null, i: num(v[2]), j: num(v[3]), refDepth: num(v[4]), phase: v[5] || null });
      }
    }
  }
  const injectors = new Set();
  for (const k of ['WCONINJE', 'WCONINJH']) all(k).forEach((b) => b.records.forEach((r) => { if (r[0]) injectors.add(r[0]); }));
  const producers = new Set();
  for (const k of ['WCONPROD', 'WCONHIST']) all(k).forEach((b) => b.records.forEach((r) => { if (r[0]) producers.add(r[0]); }));
  // a well name in a control keyword may be a template ending in '*'
  const named = (set, name) => [...set].some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name));
  wells.forEach((w) => {
    const inj = named(injectors, w.name);
    const prod = named(producers, w.name);
    w.role = inj && !prod ? 'injector' : prod ? 'producer' : 'not controlled in the main deck';
  });

  // schedule: TSTEP lengths and DATES, in deck order
  let tstepCount = 0;
  let tstepDays = 0;
  const dates = [];
  for (const b of blocks) {
    if (b.keyword === 'TSTEP') {
      b.records.forEach((r) => expand(r).forEach((t) => { const v = num(t); if (v != null) { tstepCount += 1; tstepDays += v; } }));
    } else if (b.keyword === 'DATES') {
      b.records.forEach((r) => { const d = eclDate(r); if (d) dates.push(d); });
    }
  }
  const historyControls = has('WCONHIST') || has('WCONINJH');

  const includes = [];
  for (const k of ['INCLUDE', 'IMPORT', 'GDFILE']) all(k).forEach((b) => b.records.forEach((r) => { if (r[0]) includes.push(r[0]); }));

  const rptsol = all('RPTSOL').some((b) => b.records.some((r) => r.some((t) => /^FIP/i.test(t))));
  const rptsched = all('RPTSCHED').flatMap((b) => b.records.flat());
  const fipEachStep = rptsched.some((t) => /^FIP/i.test(t));
  const wellsReport = rptsched.some((t) => /^WELLS/i.test(t));

  const tables = ['PVTO', 'PVDO', 'PVCDO', 'PVDG', 'PVTG', 'PVTW', 'SWOF', 'SGOF', 'SOF3', 'SWFN', 'SGFN', 'SLGOF', 'ROCK', 'DENSITY', 'GRAVITY']
    .filter((k) => has(k));
  const aquifers = ['AQUCT', 'AQUFETP', 'AQUNUM', 'AQUANCON', 'AQUCON'].filter((k) => has(k));
  const gridKeywords = ['DX', 'DY', 'DZ', 'TOPS', 'COORD', 'ZCORN', 'ACTNUM', 'PORO', 'PERMX', 'NTG', 'FAULTS', 'MULTFLT', 'CARFIN'].filter((k) => has(k));

  return {
    unitSystem,
    unitSystemStated: !!unitSystem,
    phases: ['OIL', 'WATER', 'GAS', 'DISGAS', 'VAPOIL'].filter((k) => has(k)),
    dims: dims && dims.every((d) => Number.isFinite(d)) ? { nx: dims[0], ny: dims[1], nz: dims[2], cells: dims[0] * dims[1] * dims[2] } : null,
    cornerPoint: has('ZCORN') || has('COORD'),
    gridKeywords,
    start,
    equil,
    wells,
    schedule: {
      tstepCount,
      tstepDays: tstepCount ? tstepDays : null,
      dates: dates.length,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      historyControls,
    },
    tables,
    aquifers,
    includes,
    report: { fipAtStart: rptsol, fipEachStep, wellsReport },
    headerNotes: deckHeaderNotes(text),
  };
}

/** Plain words for the deck's unit system. */
export function deckSystemText(summary) {
  if (!summary?.unitSystem) return 'not stated in the deck (the Eclipse default is METRIC)';
  return summary.unitSystem;
}

/** The unit system to read a run's numbers in: the deck's, METRIC when it states none. */
export const deckSystemOf = (summary) => summary?.unitSystem || (summary ? 'METRIC' : 'FIELD');

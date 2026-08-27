// Per-well production-history import (S5): rate CSVs measured PER WELL
// -> the deck builder's history periods, with no field allocation at all
// (the S4 MBAL path splits one field signal by fractions; this path uses
// each well's own metered rates). Pure shaping with explicit unit seams:
// oil/water are STB/d, gas is Mscf/d by default with an scf/d option
// (÷1000 seam). Producers become WCONHIST rows; injector wells feed
// WCONINJH from their phase column.
//
// Eclipse semantics the periods rely on: a schedule keyword persists
// until re-declared, so a well absent from a period simply keeps its
// previous observed rate, and a well whose first row is mid-history
// stays undeclared (shut) until that date.

const isoDate = (v) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '').trim());
  return m ? m[1] : null;
};

const addDays = (iso, days) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
};

const dayDiff = (a, b) => Math.round(
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
);

const round3 = (v) => Math.round(v * 1000) / 1000;

const COLUMN_ALIASES = {
  date: ['date', 'day', 'obs_date', 'observation_date', 'report_date'],
  well: ['well', 'well_name', 'wellname', 'name'],
  oil: ['oil', 'oil_rate', 'orat', 'oil_stb', 'oil_stbd', 'qo'],
  water: ['water', 'water_rate', 'wrat', 'water_stb', 'water_stbd', 'qw'],
  gas: ['gas', 'gas_rate', 'grat', 'gas_mscf', 'gas_scf', 'qg'],
};

/**
 * Per-well rate CSV text -> { rows, columns, errors }. The header line is
 * required and must name a date and a well column plus at least one rate
 * column (aliases above, case-insensitive; comma/semicolon/tab separated;
 * # or -- comments). Blank rate cells parse as null (column absent for
 * that row); non-numeric rate cells are per-line errors.
 */
export function parseWellRateCsv(text) {
  const errors = [];
  const lines = String(text || '').split(/\r?\n/)
    .map((raw, lineNo) => ({ line: raw.replace(/(#|--).*$/, '').trim(), lineNo: lineNo + 1 }))
    .filter((l) => l.line);
  if (!lines.length) return { rows: [], columns: [], errors: ['The CSV is empty.'] };

  const split = (s) => s.split(/[\t;,]+/).map((c) => c.trim());
  const header = split(lines[0].line).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const colOf = (key) => header.findIndex((h) => COLUMN_ALIASES[key].includes(h));
  const idx = {
    date: colOf('date'), well: colOf('well'), oil: colOf('oil'), water: colOf('water'), gas: colOf('gas'),
  };
  if (idx.date < 0 || idx.well < 0) {
    return { rows: [], columns: [], errors: ['The header line must name a date column and a well column (e.g. "date, well, oil, water, gas").'] };
  }
  if (idx.oil < 0 && idx.water < 0 && idx.gas < 0) {
    return { rows: [], columns: [], errors: ['The header line needs at least one rate column: oil, water or gas.'] };
  }

  const rows = [];
  lines.slice(1).forEach(({ line, lineNo }) => {
    const cells = split(line);
    const date = isoDate(cells[idx.date]);
    const well = String(cells[idx.well] || '').trim().toUpperCase();
    if (!date || !well) {
      errors.push(`Line ${lineNo}: needs an ISO date (YYYY-MM-DD) and a well name.`);
      return;
    }
    const num = (key) => {
      if (idx[key] < 0) return null;
      const cell = cells[idx[key]];
      if (cell == null || cell === '') return null;
      const n = Number(cell);
      if (!Number.isFinite(n)) {
        errors.push(`Line ${lineNo}: ${key} value '${cell}' is not a number.`);
        return null;
      }
      return n;
    };
    rows.push({ date, well, oil: num('oil'), water: num('water'), gas: num('gas') });
  });

  const columns = ['date', 'well', ...['oil', 'water', 'gas'].filter((k) => idx[k] >= 0)];
  return { rows, columns, errors };
}

/**
 * Parsed per-well rows -> spec.schedule.history periods.
 *
 * modelWells: [{name, type}] from the builder form (types producer /
 * water_injector / gas_injector). Every CSV well must be in the model.
 *
 * opts:
 *   mode:    'rates'   — values are daily rates already (STB/d, gas unit below)
 *            'volumes' — values are interval volumes booked AT the row's
 *                        date, spread over the days to the next date
 *   gasUnit: 'mscf' (default) | 'scf' (÷1000 seam)
 *
 * The last date has no successor, so its period lasts the median interval
 * (warned). Returns { startDate, endDate, periods, wellSummary, warnings }
 * or throws with an actionable message.
 */
export function historyFromWellRows(rows, modelWells, { mode = 'rates', gasUnit = 'mscf' } = {}) {
  const warnings = [];
  const wells = (modelWells || []).map((w) => ({ name: String(w.name || '').trim().toUpperCase(), type: w.type }));
  const typeOf = new Map(wells.map((w) => [w.name, w.type]));
  if (!wells.length) throw new Error('Add the model wells first — history rows attach to them by name.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('No usable data rows in the CSV.');

  const unknown = [...new Set(rows.map((r) => r.well).filter((w) => !typeOf.has(w)))];
  if (unknown.length) {
    throw new Error(`The CSV names wells not in the model: ${unknown.join(', ')} (model wells: ${wells.map((w) => w.name).join(', ')}).`);
  }

  const seen = new Set();
  rows.forEach((r) => {
    const key = `${r.date}|${r.well}`;
    if (seen.has(key)) throw new Error(`Duplicate row for ${r.well} on ${r.date} — one row per well per date.`);
    seen.add(key);
  });

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  if (dates.length < 2) throw new Error('Per-well history needs rows on at least two dates.');
  const intervals = dates.slice(1).map((d, i) => dayDiff(dates[i], d));
  const median = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  const endDate = addDays(dates[dates.length - 1], median);
  warnings.push(`The last period (${dates[dates.length - 1]}) has no closing date — it runs ${median} days, the median interval.`);

  const byDate = new Map(dates.map((d) => [d, []]));
  rows.forEach((r) => byDate.get(r.date).push(r));

  let clampedNeg = 0;
  const gasScale = gasUnit === 'scf' ? 1 / 1000 : 1;
  const rate = (v, days, scale = 1) => {
    if (v == null) return 0;
    const r = (mode === 'volumes' ? v / days : v) * scale;
    if (r < 0) { clampedNeg += 1; return 0; }
    return round3(r);
  };

  const stats = new Map(wells.map((w) => [w.name, { n: 0, oil: 0, water: 0, gas: 0 }]));
  const everSeen = new Set();
  let carried = 0;
  const periods = dates.map((date, i) => {
    const next = i + 1 < dates.length ? dates[i + 1] : endDate;
    const days = dayDiff(date, next);
    const prod = [];
    const inj = [];
    const present = new Set();
    byDate.get(date).forEach((r) => {
      present.add(r.well);
      everSeen.add(r.well);
      const type = typeOf.get(r.well);
      const s = stats.get(r.well);
      s.n += 1;
      if (type === 'producer') {
        const entry = {
          name: r.well,
          orat: rate(r.oil, days),
          wrat: rate(r.water, days),
          grat: rate(r.gas, days, gasScale),
        };
        s.oil += entry.orat; s.water += entry.wrat; s.gas += entry.grat;
        prod.push(entry);
      } else {
        const phase = type === 'gas_injector' ? 'GAS' : 'WATER';
        const v = phase === 'GAS' ? rate(r.gas, days, gasScale) : rate(r.water, days);
        s.oil += 0; s.water += phase === 'WATER' ? v : 0; s.gas += phase === 'GAS' ? v : 0;
        if (v > 0) inj.push({ name: r.well, phase, rate: v });
      }
    });
    everSeen.forEach((w) => { if (!present.has(w)) carried += 1; });
    return { date, prod, inj };
  });

  if (clampedNeg > 0) warnings.push(`${clampedNeg} negative rate(s) were clamped to zero.`);
  if (carried > 0) {
    warnings.push(`${carried} well-period(s) have no row — those wells keep their previous declared rate (schedule keywords persist until changed).`);
  }
  const silent = wells.filter((w) => !everSeen.has(w.name)).map((w) => w.name);
  if (silent.length) {
    warnings.push(`No history rows for ${silent.join(', ')} — they stay shut through the history phase.`);
  }
  if (!periods.some((p) => p.prod.length)) {
    throw new Error('No producer rows found — per-well history needs at least one producing well with rates.');
  }

  const wellSummary = wells
    .filter((w) => everSeen.has(w.name))
    .map((w) => {
      const s = stats.get(w.name);
      return {
        name: w.name,
        type: w.type,
        periods: s.n,
        avgOil: round3(s.oil / s.n),
        avgWater: round3(s.water / s.n),
        avgGas: round3(s.gas / s.n),
      };
    });

  return { startDate: dates[0], endDate, periods, wellSummary, warnings };
}

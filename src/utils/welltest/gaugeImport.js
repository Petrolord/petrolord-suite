/**
 * Gauge CSV import for the Well Test Analysis Studio (tester round
 * 2026-09-28).
 *
 * A gauge file is read as a table, the time and pressure columns are found
 * from the header text (either order, any position), and the units are
 * detected from the headers or chosen by the user. Every row that reaches
 * state is oilfield: elapsed hours and ABSOLUTE psi, because the engines
 * compare gauge pressure with the initial pressure pi (psia) and gas
 * pseudo-pressure needs absolute pressure. Gauge readings (psig, kPa g,
 * bar g) add one standard atmosphere.
 *
 * Tester round 2 (2026-10-02): an optional temperature column is read too,
 * found from its header (Temperature, Temp, BHT, degF, degC) and never
 * guessed from position. Its unit comes from the header or the user; rows
 * carry it as T in degF, and a file without one carries no T at all.
 *
 * Reservoir round, Step 0a (2026-10-02, gap matrix H12): numbers are read by
 * the shared table reader (src/lib/tabularParse.js) with the file's own
 * decimal mark, and the column delimiter is found by the same reader. A
 * European export (semicolon or tab columns, decimal commas) used to read
 * 250,75 as 25075. The table now carries `decimal` { mark, certain }; when
 * the file cannot settle the mark (every marked number looks like 3,250) it
 * is read as a decimal comma in a semicolon file and as thousands elsewhere
 * (the historical reading), and `certain` is false.
 */
import Papa from 'papaparse';
import {
  detectTableDelimiter, detectDecimalMark, parseNumber, splitRows, detectDateOrder, parseDate, looksLikeDate,
} from '@/lib/tabularParse';

export const ATM_PSI = 14.695948775513449; // 101.325 kPa
const PSI_PER_KPA = 1 / 6.894757293168361;

// Pressure units a gauge file can carry: psi per unit and whether the
// reading is gauge (relative to one atmosphere).
export const PRESSURE_UNITS = {
  psia: { label: 'psia', psiPer: 1, gauge: false },
  psig: { label: 'psig', psiPer: 1, gauge: true },
  kpaa: { label: 'kPa (abs)', psiPer: PSI_PER_KPA, gauge: false },
  kpag: { label: 'kPa (gauge)', psiPer: PSI_PER_KPA, gauge: true },
  bara: { label: 'bar (abs)', psiPer: 100 * PSI_PER_KPA, gauge: false },
  barg: { label: 'bar (gauge)', psiPer: 100 * PSI_PER_KPA, gauge: true },
  mpaa: { label: 'MPa (abs)', psiPer: 1000 * PSI_PER_KPA, gauge: false },
  mpag: { label: 'MPa (gauge)', psiPer: 1000 * PSI_PER_KPA, gauge: true },
};

// Time units: hours per unit. 'datetime' reads date/time stamps and counts
// elapsed hours from the first reading.
export const TIME_UNITS = {
  hr: { label: 'hours', hrPer: 1 },
  min: { label: 'minutes', hrPer: 1 / 60 },
  sec: { label: 'seconds', hrPer: 1 / 3600 },
  day: { label: 'days', hrPer: 24 },
  datetime: { label: 'date/time stamps', hrPer: null },
};

// Temperature units a gauge file can carry, to degF.
export const TEMPERATURE_UNITS = {
  degF: { label: 'degF', toF: (v) => v },
  degC: { label: 'degC', toF: (v) => v * 1.8 + 32 },
};

// One number, read with the file's decimal mark ('.' unless the table says ',').
const num = (v, decimal = '.') => parseNumber(v, { decimal });

/** The decimal mark of a table's cells: the one it carries, or found from its rows. */
function decimalOf(table) {
  if (table?.decimal?.mark === ',' || table?.decimal?.mark === '.') return table.decimal.mark;
  return findDecimal(table?.rows).mark;
}
function findDecimal(rows, delimiter = ',') {
  const cells = [];
  for (const r of rows || []) if (Array.isArray(r)) for (const c of r) cells.push(c);
  // undecided (every marked number looks like 3,250): the shared reader's
  // rule, a decimal comma in a semicolon file and thousands elsewhere (the
  // reading this importer always had), with `certain` false
  return detectDecimalMark(cells, { delimiter });
}

// WTA-U1-009: date stamps are read by the shared reader, never Date.parse
// (which read 03/09/2026 as 9 March and dropped 13/09/2026). A numeric
// day/month needs the column's order unless its own numbers settle it.
const isStamp = (v, decimal = '.') => {
  if (v == null) return false;
  const s = String(v).trim();
  // a plain number is not a date stamp
  if (s === '' || Number.isFinite(Number(s)) || Number.isFinite(num(s, decimal))) return false;
  return looksLikeDate(s);
};
const stamp = (v, decimal = '.', order = null) => {
  if (!isStamp(v, decimal)) return NaN;
  const d = parseDate(String(v).trim(), { order });
  return d && Number.isFinite(d.ms) ? d.ms : NaN;
};

/**
 * Parse the raw file into { headers, rows }. The first row is a header when
 * it carries text in a column whose later rows are numbers or dates.
 */
export function readGaugeTable(text) {
  const src = String(text || '').trim();
  const delimiter = detectTableDelimiter(src);
  const data = delimiter === ' '
    ? splitRows(src, ' ').map((r) => r.cells)
    : Papa.parse(src, { skipEmptyLines: true, delimiter }).data;
  const table = (data || []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (!table.length) return { headers: null, rows: [], columnCount: 0, decimal: { mark: '.', certain: true } };
  // WTA-U1-018 (PL10): a loop, never Math.max(...rows): a 1-second gauge
  // over a few days (300,000 readings and more) overflowed the call stack
  let columnCount = 0;
  for (const r of table) if (r.length > columnCount) columnCount = r.length;
  const first = table[0];
  const found = findDecimal(table, delimiter);
  const decimal = { mark: found.mark, certain: found.certain, reason: found.reason };
  const looksLikeData = (c) => Number.isFinite(num(c, decimal.mark)) || isStamp(c, decimal.mark);
  const isHeader = first.some((c) => String(c).trim() !== '' && !looksLikeData(c));
  const headers = isHeader
    ? Array.from({ length: columnCount }, (_, i) => String(first[i] ?? '').trim() || `Column ${i + 1}`)
    : null;
  return { headers, rows: isHeader ? table.slice(1) : table, columnCount, decimal };
}

// Header words. Temperature, rate and depth columns are never time or
// gauge pressure, whatever else the header says.
const OTHER_HINT = /temp|deg ?[fc]|°|rate|stb|bbl|mscf|m3|choke|depth|tvd|(^|[^a-z])md([^a-z]|$)/i;
const PRESSURE_HINT = /press|pws|pwf|bhp|psi|kpa|mpa|(^|[^a-z])(p|bar|barg|bara)([^a-z]|$)/i;
const TIME_HINT = /time|elapsed|hour|minute|second|date|clock|duration|Δt|delta ?t|(^|[^a-z])(t|dt|hr|hrs|h|min|mins|sec|secs|s|day|days|d)([^a-z]|$)/i;

const TEMPERATURE_HINT = /temp|bht|deg ?[fc]|°\s?[fc]|fahrenheit|celsius/i;

/** Temperature unit implied by a header, or null. */
export function temperatureUnitFromHeader(h) {
  const s = String(h || '').toLowerCase();
  if (/deg ?c|°\s?c|celsius|\(\s?c\s?\)|\[\s?c\s?\]|[_ ]c$/.test(s)) return 'degC';
  if (/deg ?f|°\s?f|fahrenheit|\(\s?f\s?\)|\[\s?f\s?\]|[_ ]f$/.test(s)) return 'degF';
  return null;
}

/** Unit implied by a header, or null. */
export function pressureUnitFromHeader(h) {
  const s = String(h || '').toLowerCase();
  if (/psig/.test(s)) return 'psig';
  if (/psia/.test(s)) return 'psia';
  if (/kpa\s*\(?g|kpag/.test(s)) return 'kpag';
  if (/kpa/.test(s)) return 'kpaa';
  if (/mpa\s*\(?g|mpag/.test(s)) return 'mpag';
  if (/mpa/.test(s)) return 'mpaa';
  if (/barg|bar\s*\(?g/.test(s)) return 'barg';
  if (/bar/.test(s)) return 'bara';
  if (/psi/.test(s)) return 'psia';
  return null;
}

export function timeUnitFromHeader(h) {
  const s = String(h || '').toLowerCase();
  if (/date|clock|timestamp/.test(s)) return 'datetime';
  if (/(^|[^a-z])(min|mins|minutes?)([^a-z]|$)/.test(s)) return 'min';
  if (/(^|[^a-z])(s|sec|secs|seconds?)([^a-z]|$)/.test(s)) return 'sec';
  if (/(^|[^a-z])(d|day|days)([^a-z]|$)/.test(s)) return 'day';
  if (/(^|[^a-z])(h|hr|hrs|hours?)([^a-z]|$)/.test(s)) return 'hr';
  return null;
}

/**
 * Choose the time and pressure columns and their units. Headers win; with
 * no header, or headers that name neither, the first two numeric columns
 * are read as time then pressure (the historical layout). defaultPressure
 * is the unit assumed when nothing in the file names one.
 */
export function detectGaugeMapping({ headers, rows, decimal }, { defaultPressure = 'psia', defaultTemperature = 'degF' } = {}) {
  const mark = decimalOf({ rows, decimal });
  const sample = rows.slice(0, 50);
  const columnCount = Math.max(headers?.length || 0, ...sample.map((r) => r.length), 0);
  const numericCol = (i) => sample.filter((r) => Number.isFinite(num(r[i], mark))).length >= Math.max(1, sample.length / 2);
  const stampCol = (i) => sample.filter((r) => isStamp(r[i], mark)).length >= Math.max(1, sample.length / 2);

  let timeCol = -1;
  let pressureCol = -1;
  const detectedFrom = { time: false, pressure: false };
  if (headers) {
    const candidates = headers.map((h, i) => ({ h, i })).filter(({ h }) => !OTHER_HINT.test(h));
    pressureCol = candidates.find(({ h, i }) => PRESSURE_HINT.test(h) && numericCol(i))?.i ?? -1;
    timeCol = candidates.find(({ h, i }) => i !== pressureCol && TIME_HINT.test(h) && (numericCol(i) || stampCol(i)))?.i ?? -1;
    detectedFrom.time = timeCol >= 0;
    detectedFrom.pressure = pressureCol >= 0;
  }
  const usable = Array.from({ length: columnCount }, (_, i) => i).filter((i) => numericCol(i) || stampCol(i));
  if (timeCol < 0) timeCol = usable.find((i) => i !== pressureCol) ?? 0;
  if (pressureCol < 0) pressureCol = usable.find((i) => i !== timeCol && numericCol(i)) ?? (timeCol === 0 ? 1 : 0);

  // temperature: only from a header that names it, and never the time or
  // pressure column; -1 means the file has none
  let temperatureCol = -1;
  if (headers) {
    temperatureCol = headers.findIndex((h, i) => i !== timeCol && i !== pressureCol && TEMPERATURE_HINT.test(h) && numericCol(i));
  }
  const temperatureUnit = (temperatureCol >= 0 && temperatureUnitFromHeader(headers[temperatureCol])) || defaultTemperature;

  const timeUnit = (headers && timeUnitFromHeader(headers[timeCol]))
    || (stampCol(timeCol) && !numericCol(timeCol) ? 'datetime' : 'hr');
  const pressureUnit = (headers && pressureUnitFromHeader(headers[pressureCol])) || defaultPressure;
  // the order of a numeric date column, settled by the whole column or left
  // open (null) for the user to choose
  const dates = timeUnit === 'datetime' ? detectDateOrder(rows.map((r) => r[timeCol])) : null;
  return {
    timeCol, pressureCol, timeUnit, pressureUnit,
    dateOrder: dates ? dates.order : null,
    dateCheck: dates,
    temperatureCol, temperatureUnit,
    detectedFrom,
    unitsFromHeader: {
      time: !!(headers && timeUnitFromHeader(headers[timeCol])),
      pressure: !!(headers && pressureUnitFromHeader(headers[pressureCol])),
      temperature: !!(temperatureCol >= 0 && temperatureUnitFromHeader(headers[temperatureCol])),
    },
  };
}

/**
 * Convert the chosen columns to oilfield rows { t (hr), p (psia) }, plus
 * T (degF) on the rows that carry a temperature reading when a temperature
 * column is mapped (temperatureCol >= 0). A missing or unreadable
 * temperature never drops the pressure reading beside it.
 * Rows at or before time zero are kept: a reading at t = 0 is the pressure
 * at shut-in, and readings before a shut-in time set on the gauge clock are
 * the flowing period (prepareTestData separates them).
 */
export function convertGaugeRows({ rows, decimal }, {
  timeCol, pressureCol, timeUnit = 'hr', pressureUnit = 'psia', temperatureCol = -1, temperatureUnit = 'degF', dateOrder = null,
}, { onProgress = null, progressEvery = 25000 } = {}) {
  const mark = decimalOf({ rows, decimal });
  const pu = PRESSURE_UNITS[pressureUnit] || PRESSURE_UNITS.psia;
  const tempU = TEMPERATURE_UNITS[temperatureUnit] || TEMPERATURE_UNITS.degF;
  const hasTemp = Number.isInteger(temperatureCol) && temperatureCol >= 0;
  let temperatureCount = 0;
  const tu = TIME_UNITS[timeUnit] || TIME_UNITS.hr;
  const out = [];
  let skipped = 0;
  let t0 = NaN;
  // numeric dates no value settles are not guessed: nothing is read until
  // the order is chosen (WTA-U1-009)
  if (tu.hrPer == null && !dateOrder) {
    const check = detectDateOrder(rows.map((r) => r[timeCol]));
    if (check.ambiguous || check.conflict) {
      return { rows: [], skipped: rows.length, temperatureCount: 0, dateQuestion: check };
    }
  }
  // WTA-U2-010: progress for the worker (the reading itself is unchanged)
  let seen = 0;
  for (const raw of rows) {
    seen += 1;
    if (onProgress && seen % progressEvery === 0) onProgress(seen, rows.length);
    const pRaw = num(raw[pressureCol], mark);
    let t;
    if (tu.hrPer == null) {
      const ms = stamp(raw[timeCol], mark, dateOrder);
      if (Number.isFinite(ms) && !Number.isFinite(t0)) t0 = ms;
      t = Number.isFinite(ms) ? (ms - t0) / 3.6e6 : NaN;
    } else {
      t = num(raw[timeCol], mark) * tu.hrPer;
    }
    if (!Number.isFinite(t) || !Number.isFinite(pRaw)) { skipped += 1; continue; }
    const p = pRaw * pu.psiPer + (pu.gauge ? ATM_PSI : 0);
    const tempRaw = hasTemp ? num(raw[temperatureCol], mark) : NaN;
    if (Number.isFinite(tempRaw)) {
      temperatureCount += 1;
      out.push({ t, p, T: tempU.toF(tempRaw) });
    } else {
      out.push({ t, p });
    }
  }
  return { rows: out, skipped, temperatureCount };
}

/** One-call import with automatic detection. */
export function importGaugeCsv(text, opts = {}) {
  const table = readGaugeTable(text);
  const mapping = { ...detectGaugeMapping(table, opts), ...(opts.mapping || {}) };
  const { rows, skipped, temperatureCount, dateQuestion = null } = convertGaugeRows(table, mapping);
  return { table, mapping, rows, skipped, temperatureCount, dateQuestion };
}

/** Gauge-clock time for display (shut-in / start of flow), hours. */
export const gaugeTime = (t) => String(Number.isFinite(t) ? Number(t.toPrecision(6)) : 0);

/** Where the pressure at shut-in (dt = 0) came from (prepareTestData pwfSource.kind). */
export const PWF_SOURCE_TEXT = {
  entered: 'entered',
  gauge: 'gauge reading at the shut-in',
  'gauge-before': 'last flowing reading before the shut-in',
  'first-buildup': 'first buildup reading, skin withheld',
};

/**
 * Where the well was shut in (buildup, falloff) or opened (drawdown,
 * injection) on the gauge clock (2026-10-14): the steepest pressure change
 * between consecutive readings (psi per hour) in the test's direction,
 * returned as the time of the reading BEFORE it, so that reading is the
 * pressure at the instant of the change. The rate of change, not the step:
 * a gauge reads every few seconds after a shut-in and every few minutes in
 * flow, so an earlier clean-up shut-in can show a bigger step on a coarser
 * clock. Refused when the steepest change is not clearly the largest (less
 * than three times the next), so a smooth record is not cut at random.
 * @param {Array<{t:number,p:number}>} rows gauge readings, hr and psi
 * @param {'up'|'down'} direction up: buildup and injection; down: drawdown and falloff
 * @returns {{ ok: true, t: number, dp: number, dtNext: number } | { ok: false, reason: string }}
 */
export function findTestStart(rows, direction = 'up') {
  const pts = (rows || [])
    .map((r) => ({ t: Number(r.t), p: Number(r.p) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return { ok: false, reason: 'Load a gauge file first.' };
  const sign = direction === 'down' ? -1 : 1;
  // rate of change over each interval i (between readings i-1 and i)
  const rates = pts.map((r, i) => {
    if (i === 0) return -Infinity;
    const dt = r.t - pts[i - 1].t;
    return dt > 0 ? (sign * (r.p - pts[i - 1].p)) / dt : -Infinity;
  });
  let best = -1;
  for (let i = 1; i < rates.length; i += 1) if (best < 0 || rates[i] > rates[best]) best = i;
  if (best < 0 || !(rates[best] > 0)) return { ok: false, reason: `The pressure never ${direction === 'down' ? 'falls' : 'rises'} between two readings.` };
  const peak = rates[best];
  // the change must stand out from the record's ordinary movement
  const typical = rates.slice(1).filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const median = typical[Math.floor(typical.length / 2)] || 0;
  if (!(peak >= 3 * median) || !(peak > 0)) {
    return { ok: false, reason: `No change stands out: the steepest ${direction === 'down' ? 'fall' : 'rise'} (${peak.toFixed(1)} psi/hr) is less than three times the typical movement (${median.toFixed(1)} psi/hr). Type the time instead.` };
  }
  // runs of steep change (storage keeps a shut-in steep for a while); a test
  // can hold several (a clean-up shut-in, a rate cut). A buildup or a
  // drawdown follows the LAST one, so of the runs reaching half the peak the
  // latest is taken.
  const runs = [];
  for (let i = 1; i < rates.length; i += 1) {
    if (rates[i] > 0.3 * peak && (i === 1 || !(rates[i - 1] > 0.3 * peak))) runs.push({ first: i, max: rates[i] });
    else if (rates[i] > 0.3 * peak && runs.length) runs[runs.length - 1].max = Math.max(runs[runs.length - 1].max, rates[i]);
  }
  const strong = runs.filter((r) => r.max >= 0.5 * peak);
  const chosen = strong[strong.length - 1];
  const first = chosen.first;
  if (first === 1) {
    return { ok: false, reason: 'The record starts inside the change: the first readings already move fastest, so the shut-in (or the start of flow) came before the file starts. Leave the time blank.' };
  }
  return { ok: true, t: pts[first - 1].t, dp: sign * (pts[first].p - pts[first - 1].p), rate: chosen.max, dtNext: pts[first].t - pts[first - 1].t, candidates: strong.length };
}

/**
 * A rate history file (2026-10-14): a start-time column and a rate column
 * found by their headers (start, time, elapsed, hr / rate, q, oil, gas,
 * stb, mscf), any other columns ignored. Times in hours, rates as written
 * (the studio's rate unit). Returns rows as the Data tab keeps them.
 * @returns {{ ok: true, rows: Array<{t:string,q:string}>, timeCol: string, rateCol: string } | { ok: false, reason: string }}
 */
export function readRateHistoryCsv(text) {
  const table = readGaugeTable(text);
  if (!table.rows.length) return { ok: false, reason: 'The file has no rows.' };
  const h = table.headers || [];
  const timeIdx = h.findIndex((x) => /start|time|elapsed|(^|[^a-z])hr|hour|(^|[^a-z])t([^a-z]|$)/i.test(x) && !/rate/i.test(x));
  const rateIdx = h.findIndex((x, i) => i !== timeIdx && /rate|(^|[^a-z])q([^a-z]|$)|oil|gas|stb|mscf|bbl/i.test(x));
  const ti = table.headers ? timeIdx : 0;
  const ri = table.headers ? rateIdx : 1;
  if (ti < 0 || ri < 0) return { ok: false, reason: 'No start-time and rate columns were found from the headers (for example start_hr and oil_rate_stbd).' };
  const rows = [];
  for (const r of table.rows) {
    const t = num(r[ti], table.decimal.mark);
    const q = num(r[ri], table.decimal.mark);
    if (Number.isFinite(t) && Number.isFinite(q)) rows.push({ t: String(t), q: String(q) });
  }
  if (!rows.length) return { ok: false, reason: 'No row held a number in both columns.' };
  return { ok: true, rows, timeCol: h[ti] || 'Column 1', rateCol: h[ri] || 'Column 2' };
}

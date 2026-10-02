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
 */
import Papa from 'papaparse';

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

const num = (v) => {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const stamp = (v) => {
  if (v == null) return NaN;
  const s = String(v).trim();
  // a plain number is not a date stamp
  if (s === '' || Number.isFinite(Number(s))) return NaN;
  const ms = Date.parse(s.includes(' ') && !s.includes('T') && /^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(' ', 'T') : s);
  return Number.isFinite(ms) ? ms : NaN;
};

/**
 * Parse the raw file into { headers, rows }. The first row is a header when
 * it carries text in a column whose later rows are numbers or dates.
 */
export function readGaugeTable(text) {
  const { data } = Papa.parse(String(text || '').trim(), { skipEmptyLines: true });
  const table = (data || []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
  if (!table.length) return { headers: null, rows: [], columnCount: 0 };
  const columnCount = Math.max(...table.map((r) => r.length));
  const first = table[0];
  const looksLikeData = (c) => Number.isFinite(num(c)) || Number.isFinite(stamp(c));
  const isHeader = first.some((c) => String(c).trim() !== '' && !looksLikeData(c));
  const headers = isHeader
    ? Array.from({ length: columnCount }, (_, i) => String(first[i] ?? '').trim() || `Column ${i + 1}`)
    : null;
  return { headers, rows: isHeader ? table.slice(1) : table, columnCount };
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
export function detectGaugeMapping({ headers, rows }, { defaultPressure = 'psia', defaultTemperature = 'degF' } = {}) {
  const sample = rows.slice(0, 50);
  const columnCount = Math.max(headers?.length || 0, ...sample.map((r) => r.length), 0);
  const numericCol = (i) => sample.filter((r) => Number.isFinite(num(r[i]))).length >= Math.max(1, sample.length / 2);
  const stampCol = (i) => sample.filter((r) => Number.isFinite(stamp(r[i]))).length >= Math.max(1, sample.length / 2);

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
  return {
    timeCol, pressureCol, timeUnit, pressureUnit,
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
export function convertGaugeRows({ rows }, {
  timeCol, pressureCol, timeUnit = 'hr', pressureUnit = 'psia', temperatureCol = -1, temperatureUnit = 'degF',
}) {
  const pu = PRESSURE_UNITS[pressureUnit] || PRESSURE_UNITS.psia;
  const tempU = TEMPERATURE_UNITS[temperatureUnit] || TEMPERATURE_UNITS.degF;
  const hasTemp = Number.isInteger(temperatureCol) && temperatureCol >= 0;
  let temperatureCount = 0;
  const tu = TIME_UNITS[timeUnit] || TIME_UNITS.hr;
  const out = [];
  let skipped = 0;
  let t0 = NaN;
  for (const raw of rows) {
    const pRaw = num(raw[pressureCol]);
    let t;
    if (tu.hrPer == null) {
      const ms = stamp(raw[timeCol]);
      if (Number.isFinite(ms) && !Number.isFinite(t0)) t0 = ms;
      t = Number.isFinite(ms) ? (ms - t0) / 3.6e6 : NaN;
    } else {
      t = num(raw[timeCol]) * tu.hrPer;
    }
    if (!Number.isFinite(t) || !Number.isFinite(pRaw)) { skipped += 1; continue; }
    const p = pRaw * pu.psiPer + (pu.gauge ? ATM_PSI : 0);
    const tempRaw = hasTemp ? num(raw[temperatureCol]) : NaN;
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
  const { rows, skipped, temperatureCount } = convertGaugeRows(table, mapping);
  return { table, mapping, rows, skipped, temperatureCount };
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

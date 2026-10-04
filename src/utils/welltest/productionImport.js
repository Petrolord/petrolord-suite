/**
 * Production history import for the RTA tab (WTA-U1-010).
 *
 * The RTA door read three columns by position with parseFloat and the
 * display system's units: a header in another order swapped rate and
 * pressure, "450,5" in a semicolon file became 450 or was dropped, psig was
 * taken as psia, m3/d as STB/D under oilfield, and a date column was
 * dropped row by row. It now reads through the gauge reader (the shared
 * table reader underneath: delimiter, decimal mark, header detection) and:
 *   - finds the time, rate and flowing pressure columns by header in any
 *     order, and falls back to time, rate, pressure by position only when
 *     the file has no header (the historical layout), saying so;
 *   - takes each unit from its header, or states the display unit it
 *     assumed; gauge pressures add one standard atmosphere;
 *   - reads a date column with the shared date reader (day first, month
 *     first, or asks), counting days from the first date as day 1;
 *   - refuses a gas rate unit on an oil test and the reverse;
 *   - returns what it read, so the panel shows it.
 * Rows come back oilfield: t (days), q (STB/D or Mscf/D), pwf (psia).
 */
import { detectDateOrder, parseDate, parseNumber } from '@/lib/tabularParse';
import {
  readGaugeTable, pressureUnitFromHeader, timeUnitFromHeader, PRESSURE_UNITS, ATM_PSI,
} from './gaugeImport.js';

const BBL_M3 = 0.158987294928;
const SCF_M3 = 0.028316846592;

// rate units: to STB/D (oil) or Mscf/D (gas)
export const RATE_UNITS = Object.freeze({
  'STB/D': { fluid: 'oil', toOil: (v) => v, label: 'STB/D' },
  'm3/d': { fluid: 'oil', toOil: (v) => v / BBL_M3, label: 'm3/d' },
  'Mscf/D': { fluid: 'gas', toOil: (v) => v, label: 'Mscf/D' },
  'MMscf/D': { fluid: 'gas', toOil: (v) => v * 1000, label: 'MMscf/D' },
  // 1 sm3 = 1/0.028316846592 scf; 1 Mscf = 1,000 scf
  'sm3/d': { fluid: 'gas', toOil: (v) => v / (SCF_M3 * 1000), label: 'sm3/d' },
  'e3m3/d': { fluid: 'gas', toOil: (v) => v / SCF_M3, label: '10^3 m3/d' },
});

/** The rate unit a header names, or null. Gas words win over oil words. */
export function rateUnitFromHeader(h) {
  const s = String(h || '').toLowerCase().replace(/\s+/g, '');
  if (/mmscf/.test(s)) return 'MMscf/D';
  if (/mscf|mcf/.test(s)) return 'Mscf/D';
  if (/(e3m3|10\^?3m3|10³m³|km3|1000m3|thousandm3)/.test(s)) return 'e3m3/d';
  if (/(sm3|m3)/.test(s) && /gas/.test(s)) return 'sm3/d';
  if (/(sm3|m3|m³)/.test(s)) return 'm3/d';
  if (/stb|bbl|bopd|bpd/.test(s)) return 'STB/D';
  return null;
}

const TIME_WORD = /time|day|days|date|elapsed|(^|[^a-z])(t|d|hr|hrs|h)([^a-z]|$)/i;
const RATE_WORD = /rate|(^|[^a-z])(q|qo|qg)([^a-z]|$)|oil|gas|stb|bbl|bopd|bpd|mscf|mcf|m3|m³/i;
const PRESS_WORD = /press|pwf|bhp|fbhp|psi|kpa|mpa|(^|[^a-z])(p|bar|barg|bara)([^a-z]|$)/i;

const num = (v, mark) => parseNumber(v, { decimal: mark });

/**
 * @param {string} text the file
 * @param {{unitSystem?: 'oilfield'|'si', fluid?: 'oil'|'gas', mapping?: object}} [o]
 * @returns {{rows: Array<{t:number,q:number,pwf:number}>, skipped: number, read: object, error: ?string, dateQuestion: ?object}}
 */
export function importProductionCsv(text, { unitSystem = 'oilfield', fluid = 'oil', mapping = null } = {}) {
  const table = readGaugeTable(text);
  const none = (error, extra = {}) => ({ rows: [], skipped: table.rows.length, read: null, error, dateQuestion: null, ...extra });
  if (!table.rows.length) return none('The file has no data rows.');
  const mark = table.decimal?.mark === ',' ? ',' : '.';
  const headers = table.headers;
  const cols = Array.from({ length: table.columnCount }, (_, i) => i);
  const sample = table.rows.slice(0, 50);
  const numeric = (i) => sample.filter((r) => Number.isFinite(num(r[i], mark))).length >= Math.max(1, sample.length / 2);

  let timeCol = -1; let rateCol = -1; let pCol = -1;
  let byHeader = false;
  if (headers) {
    pCol = cols.find((i) => PRESS_WORD.test(headers[i]) && !RATE_WORD.test(headers[i].replace(/pressure/i, ''))) ?? -1;
    rateCol = cols.find((i) => i !== pCol && RATE_WORD.test(headers[i]) && !PRESS_WORD.test(headers[i])) ?? -1;
    timeCol = cols.find((i) => i !== pCol && i !== rateCol && TIME_WORD.test(headers[i])) ?? -1;
    // rate and pressure named, time not (a header in another language,
    // "Datum", "Fecha"): the one column left is the time
    if (timeCol < 0 && rateCol >= 0 && pCol >= 0 && table.columnCount === 3) timeCol = cols.find((i) => i !== pCol && i !== rateCol);
    byHeader = timeCol >= 0 && rateCol >= 0 && pCol >= 0;
  }
  if (!byHeader) {
    // the historical layout: time, rate, flowing pressure
    [timeCol, rateCol, pCol] = [0, 1, 2];
  }
  if (mapping) ({ timeCol = timeCol, rateCol = rateCol, pCol = pCol } = mapping);
  if (table.columnCount < 3) return none('Three columns are needed: time, rate and flowing pressure.');

  const assumed = [];
  // time
  let timeUnit = (headers && timeUnitFromHeader(headers[timeCol])) || null;
  if (!timeUnit && !numeric(timeCol)) timeUnit = 'datetime';
  if (!timeUnit) { timeUnit = 'day'; if (!headers || !/day|(^|[^a-z])d([^a-z]|$)/i.test(headers[timeCol] || '')) assumed.push('time in days'); }
  if (timeUnit === 'datetime' && /date|clock|time ?stamp/i.test(headers?.[timeCol] || '') === false && numeric(timeCol)) timeUnit = 'day';
  // rate
  let rateUnit = mapping?.rateUnit || (headers && rateUnitFromHeader(headers[rateCol])) || null;
  if (rateUnit && RATE_UNITS[rateUnit].fluid !== fluid) {
    return none(`The rate column "${headers[rateCol]}" is in ${RATE_UNITS[rateUnit].label}, a ${RATE_UNITS[rateUnit].fluid} rate, and this test is ${fluid}. Nothing was loaded: set the fluid on the Data tab first, or check the file.`);
  }
  if (!rateUnit) {
    rateUnit = fluid === 'gas' ? (unitSystem === 'si' ? 'e3m3/d' : 'Mscf/D') : (unitSystem === 'si' ? 'm3/d' : 'STB/D');
    assumed.push(`rate in ${RATE_UNITS[rateUnit].label}`);
  }
  // pressure
  let pressureUnit = mapping?.pressureUnit || (headers && pressureUnitFromHeader(headers[pCol])) || null;
  if (!pressureUnit) { pressureUnit = unitSystem === 'si' ? 'kpaa' : 'psia'; assumed.push(`pressure in ${PRESSURE_UNITS[pressureUnit].label}`); }
  const pu = PRESSURE_UNITS[pressureUnit];

  // dates: the order from the column itself, or the user's choice
  let dateOrder = mapping?.dateOrder || null;
  if (timeUnit === 'datetime' && !dateOrder) {
    const check = detectDateOrder(table.rows.map((r) => r[timeCol]));
    if (check.ambiguous || check.conflict) {
      return none('The dates could be day first or month first: choose the order.', { dateQuestion: check, read: { timeCol, rateCol, pCol, headers, timeUnit, rateUnit, pressureUnit } });
    }
    dateOrder = check.order;
  }

  const rows = [];
  let skipped = 0;
  let d0 = NaN;
  const hrPer = { hr: 1 / 24, min: 1 / 1440, sec: 1 / 86400, day: 1 }[timeUnit] ?? 1;
  for (const raw of table.rows) {
    let t;
    if (timeUnit === 'datetime') {
      const d = parseDate(String(raw[timeCol] ?? '').trim(), { order: dateOrder });
      if (d && Number.isFinite(d.ms)) {
        if (!Number.isFinite(d0)) d0 = d.ms;
        t = (d.ms - d0) / 86400000 + 1; // the first date is day 1
      } else t = NaN;
    } else {
      t = num(raw[timeCol], mark) * hrPer;
    }
    const q = num(raw[rateCol], mark);
    const p = num(raw[pCol], mark);
    if (!(t > 0) || !Number.isFinite(q) || !Number.isFinite(p)) { skipped += 1; continue; }
    rows.push({ t, q: RATE_UNITS[rateUnit].toOil(q), pwf: p * pu.psiPer + (pu.gauge ? ATM_PSI : 0) });
  }
  const name = (i) => (headers ? headers[i] : `column ${i + 1}`);
  return {
    rows,
    skipped,
    error: null,
    dateQuestion: null,
    read: {
      byHeader,
      columns: { time: name(timeCol), rate: name(rateCol), pressure: name(pCol) },
      timeUnit, rateUnit, pressureUnit, dateOrder,
      assumed,
      decimal: mark,
      text: [
        `${rows.length} rows read${skipped ? `, ${skipped} skipped (a value missing or not a number, or time not above zero)` : ''}.`,
        byHeader ? 'Columns found from the headers' : 'No headers recognised: read by position as time, rate, flowing pressure',
        `(time "${name(timeCol)}"${timeUnit === 'datetime' ? `, dates ${dateOrder === 'dmy' ? 'day first' : dateOrder === 'mdy' ? 'month first' : 'ISO'}, the first date is day 1` : ` in ${timeUnit === 'day' ? 'days' : timeUnit}`}; rate "${name(rateCol)}" in ${RATE_UNITS[rateUnit].label}; pressure "${name(pCol)}" in ${pu.label}${pu.gauge ? ', one standard atmosphere added' : ''}).`,
        assumed.length ? `Assumed, as the file does not say: ${assumed.join(', ')}.` : '',
        mark === ',' ? 'Decimal commas read.' : '',
      ].filter(Boolean).join(' '),
    },
  };
}

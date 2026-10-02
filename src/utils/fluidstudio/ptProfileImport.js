/**
 * The P-T profile door of Fluid Systems Studio (FLUID-U1, RL10 and PL2).
 *
 * The flowline pressure and temperature profile is pasted as text. Before
 * this module the door split each line on commas and read psia and degF
 * whatever the file held: a tab or semicolon table was dropped without a
 * word, a header line vanished, "120,5" was two columns and a profile in
 * bar and degC was read as psia and degF.
 *
 * Now: any separator (comma, semicolon, tab, spaces), comma decimals when
 * the separator is not a comma, an optional header in any column order with
 * the units read from it, the unit chosen at the door when the header is
 * silent, gauge pressures brought to absolute with the atmosphere stated,
 * and a read-back of what was read and what was not, line by line.
 *
 * Pure. The shared tabular parser (src/lib/tabularFile.js, Reservoir Step
 * 0a) replaces the line splitter here once it is on main; the door, the
 * units and the read-back stay.
 */
import { convert } from '../../lib/units/registry.js';

/** Standard atmosphere added to a gauge pressure (psi). */
export const ATMOSPHERE_PSI = 14.696;

export const PT_PRESSURE_UNITS = Object.freeze({
  psia: { label: 'psia', registry: 'psi', gauge: false },
  psig: { label: 'psig', registry: 'psi', gauge: true },
  kPa: { label: 'kPa (abs)', registry: 'kPa', gauge: false },
  bar: { label: 'bar (abs)', registry: 'bar', gauge: false },
  barg: { label: 'bar (gauge)', registry: 'bar', gauge: true },
  MPa: { label: 'MPa (abs)', registry: 'MPa', gauge: false },
});
export const PT_TEMPERATURE_UNITS = Object.freeze({
  degF: { label: 'degF', registry: 'degF' },
  degC: { label: 'degC', registry: 'degC' },
  K: { label: 'K', registry: 'K' },
});
export const DEFAULT_PT_UNITS = Object.freeze({ pressure: 'psia', temperature: 'degF' });

const pressureUnitFromText = (t) => {
  const s = t.toLowerCase();
  if (/psi\s*\(?g\)?|psig/.test(s)) return 'psig';
  if (/bar\s*\(?g\)?|barg/.test(s)) return 'barg';
  if (/psi/.test(s)) return 'psia';
  if (/mpa/.test(s)) return 'MPa';
  if (/kpa/.test(s)) return 'kPa';
  if (/bar/.test(s)) return 'bar';
  return null;
};
const temperatureUnitFromText = (t) => {
  const s = t.toLowerCase();
  if (/deg\s*c|°\s*c|\bc\b|celsius/.test(s)) return 'degC';
  if (/deg\s*f|°\s*f|\bf\b|fahrenheit/.test(s)) return 'degF';
  if (/\bk\b|kelvin/.test(s)) return 'K';
  return null;
};

/** One line into cells, and whether a comma can be a decimal mark in it. */
function splitLine(line) {
  if (/[;\t]/.test(line)) return { cells: line.split(/[;\t]/).map((c) => c.trim()), commaDecimal: true };
  if (line.includes(',')) return { cells: line.split(',').map((c) => c.trim()), commaDecimal: false };
  return { cells: line.trim().split(/\s+/), commaDecimal: false };
}

const toNumber = (cell, commaDecimal) => {
  if (cell == null) return NaN;
  let t = String(cell).trim();
  if (t === '') return NaN;
  if (commaDecimal) t = t.replace(/\s/g, '').replace(',', '.');
  // a number and nothing else: "3000 psia" in a cell is not read as 3000
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
};

const isHeader = (cells, commaDecimal) => cells.some((c) => /[a-z]/i.test(c)) && cells.every((c) => !Number.isFinite(toNumber(c, commaDecimal)) || c === '');

/**
 * Read a pasted P-T profile.
 * @param {string} raw the pasted text
 * @param {{pressure?: string, temperature?: string}} [chosen] the units picked at the door
 * @returns {{points: Array<{pressure: number, temp: number}>, read: number,
 *   skipped: Array<{line: number, text: string, reason: string}>,
 *   units: {pressure: string, temperature: string, pressureFromHeader: boolean, temperatureFromHeader: boolean},
 *   columns: {pressure: number, temperature: number, header: ?string}, summary: string}}
 *   points are psia and degF, pressure descending (the engine's order)
 */
export function readPtProfile(raw, chosen = {}) {
  const units = {
    pressure: PT_PRESSURE_UNITS[chosen.pressure] ? chosen.pressure : DEFAULT_PT_UNITS.pressure,
    temperature: PT_TEMPERATURE_UNITS[chosen.temperature] ? chosen.temperature : DEFAULT_PT_UNITS.temperature,
    pressureFromHeader: false,
    temperatureFromHeader: false,
  };
  const columns = { pressure: 0, temperature: 1, header: null };
  const points = [];
  const skipped = [];
  const lines = typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  let seenData = false;

  lines.forEach((text, i) => {
    const line = text.trim();
    if (!line) return;
    const { cells, commaDecimal } = splitLine(line);
    if (!seenData && isHeader(cells, commaDecimal)) {
      const pIdx = cells.findIndex((c) => /^p\b|press/i.test(c));
      const tIdx = cells.findIndex((c) => /^t\b|temp/i.test(c));
      if (pIdx >= 0 && tIdx >= 0 && pIdx !== tIdx) {
        columns.pressure = pIdx; columns.temperature = tIdx; columns.header = line;
        const pu = pressureUnitFromText(cells[pIdx].replace(/^p\w*/i, ' '));
        const tu = temperatureUnitFromText(cells[tIdx].replace(/^t\w*/i, ' '));
        if (pu) { units.pressure = pu; units.pressureFromHeader = true; }
        if (tu) { units.temperature = tu; units.temperatureFromHeader = true; }
      } else {
        skipped.push({ line: i + 1, text: line, reason: 'A header line that does not name a pressure and a temperature column' });
      }
      return;
    }
    if (cells.length < 2) { skipped.push({ line: i + 1, text: line, reason: 'One value only: a pressure and a temperature are needed' }); return; }
    if (!commaDecimal && cells.length === 4 && columns.header == null) {
      skipped.push({ line: i + 1, text: line, reason: 'Four comma-separated values: comma decimals need a semicolon or tab between the columns' });
      return;
    }
    const p = toNumber(cells[columns.pressure], commaDecimal);
    const t = toNumber(cells[columns.temperature], commaDecimal);
    if (!Number.isFinite(p) || !Number.isFinite(t)) { skipped.push({ line: i + 1, text: line, reason: 'Not two numbers' }); return; }
    seenData = true;
    const pu = PT_PRESSURE_UNITS[units.pressure];
    const psia = convert('pressure', p, pu.registry, 'psi') + (pu.gauge ? ATMOSPHERE_PSI : 0);
    const degF = convert('temperature', t, PT_TEMPERATURE_UNITS[units.temperature].registry, 'degF');
    if (!(psia > 0)) { skipped.push({ line: i + 1, text: line, reason: 'Pressure is not above zero absolute' }); return; }
    points.push({ pressure: psia, temp: degF });
  });

  points.sort((a, b) => b.pressure - a.pressure);
  const pu = PT_PRESSURE_UNITS[units.pressure];
  const tu = PT_TEMPERATURE_UNITS[units.temperature];
  const said = (fromHeader) => (fromHeader ? 'read from the header' : 'as chosen');
  const summary = `${points.length} point${points.length === 1 ? '' : 's'} read`
    + `${skipped.length ? `, ${skipped.length} line${skipped.length === 1 ? '' : 's'} not read` : ''}. `
    + `Pressure in ${pu.label} (${said(units.pressureFromHeader)})${pu.gauge ? `, brought to absolute with ${ATMOSPHERE_PSI} psi` : ''}; `
    + `temperature in ${tu.label} (${said(units.temperatureFromHeader)}). `
    + `Column ${columns.pressure + 1} is pressure and column ${columns.temperature + 1} is temperature${columns.header ? ', from the header' : ' (no header)'}.`;
  return { points, read: points.length, skipped, units, columns, summary };
}

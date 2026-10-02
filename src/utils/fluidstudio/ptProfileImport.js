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
 * Pure. The table is read by the shared typed reader of the Reservoir round
 * (src/lib/tabularParse.js, Step 0a): delimiter, header, decimal mark and
 * row report are its decisions. This module adds what is particular to the
 * door: which column is pressure and which temperature, their units, gauge
 * to absolute, and the words of the read-back.
 */
import { convert } from '../../lib/units/registry.js';
import { parseTabular } from '../../lib/tabularParse.js';

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

/**
 * Read a pasted P-T profile.
 * @param {string} raw the pasted text
 * @param {{pressure?: string, temperature?: string}} [chosen] the units picked at the door
 * @returns {{points: Array<{pressure: number, temp: number}>, read: number,
 *   skipped: Array<{line: number, text: string, reason: string}>,
 *   units: {pressure: string, temperature: string, pressureFromHeader: boolean, temperatureFromHeader: boolean},
 *   columns: {pressure: number, temperature: number, header: ?string}, decimal: string, summary: string}}
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
  // the shared typed reader decides the delimiter, the header, the decimal
  // mark and which rows are not table rows
  const table = parseTabular(typeof raw === 'string' ? raw : '');
  const lineText = (line) => (String(raw || '').split(/\r\n|\r|\n/)[line - 1] || '').trim();

  if (table.header) {
    const names = table.columns.map((c) => String(c.header ?? c.name ?? ''));
    const pIdx = names.findIndex((c) => /^p\b|press/i.test(c.trim()));
    const tIdx = names.findIndex((c) => /^t\b|temp/i.test(c.trim()));
    if (pIdx >= 0 && tIdx >= 0 && pIdx !== tIdx) {
      columns.pressure = pIdx; columns.temperature = tIdx; columns.header = table.header.cells.join(', ');
      const pu = pressureUnitFromText(table.columns[pIdx].unit || '');
      const tu = temperatureUnitFromText(table.columns[tIdx].unit || '');
      if (pu) { units.pressure = pu; units.pressureFromHeader = true; }
      if (tu) { units.temperature = tu; units.temperatureFromHeader = true; }
    } else {
      skipped.push({ line: table.header.line, text: table.header.cells.join(', '), reason: 'A header line that does not name a pressure and a temperature column' });
    }
  }
  for (const s of table.report.skipped) skipped.push({ line: s.line, text: String(s.text || '').trim(), reason: s.reason[0].toUpperCase() + s.reason.slice(1) });
  const padded = new Set(table.report.padded.map((r) => r.line));
  const pu = PT_PRESSURE_UNITS[units.pressure];
  const tuDef = PT_TEMPERATURE_UNITS[units.temperature];
  for (const row of table.rows) {
    const p = row.values[columns.pressure];
    const t = row.values[columns.temperature];
    const text = lineText(row.line) || row.cells.join(', ');
    if (padded.has(row.line) && row.cells.filter((c) => String(c).trim() !== '').length < 2) { skipped.push({ line: row.line, text, reason: 'One value only: a pressure and a temperature are needed' }); continue; }
    if (typeof p !== 'number' || typeof t !== 'number' || !Number.isFinite(p) || !Number.isFinite(t)) { skipped.push({ line: row.line, text, reason: 'Not two numbers' }); continue; }
    const psia = convert('pressure', p, pu.registry, 'psi') + (pu.gauge ? ATMOSPHERE_PSI : 0);
    const degF = convert('temperature', t, tuDef.registry, 'degF');
    if (!(psia > 0)) { skipped.push({ line: row.line, text, reason: 'Pressure is not above zero absolute' }); continue; }
    points.push({ pressure: psia, temp: degF });
  }
  skipped.sort((a, b) => a.line - b.line);
  points.sort((a, b) => b.pressure - a.pressure);

  const said = (fromHeader) => (fromHeader ? 'read from the header' : 'as chosen');
  const decimal = table.decimal?.mark === ',' ? ' Decimal commas.' : (table.decimal && table.decimal.certain === false ? ` Decimal mark taken as a ${table.decimal.mark === ',' ? 'comma' : 'point'}: the numbers do not settle it.` : '');
  const summary = `${points.length} point${points.length === 1 ? '' : 's'} read`
    + `${skipped.length ? `, ${skipped.length} line${skipped.length === 1 ? '' : 's'} not read` : ''}. `
    + `Pressure in ${pu.label} (${said(units.pressureFromHeader)})${pu.gauge ? `, brought to absolute with ${ATMOSPHERE_PSI} psi` : ''}; `
    + `temperature in ${tuDef.label} (${said(units.temperatureFromHeader)}). `
    + `Column ${columns.pressure + 1} is pressure and column ${columns.temperature + 1} is temperature${columns.header ? ', from the header' : ' (no header)'}. `
    + `Separator: ${table.delimiterName}.${decimal}`;
  return { points, read: points.length, skipped, units, columns, decimal: table.decimal?.mark || '.', summary };
}

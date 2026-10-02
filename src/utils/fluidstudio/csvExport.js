/**
 * The two CSV exports of Fluid Systems Studio (FLUID-U1; RL1, RL7, RL11).
 * Both open with the same provenance header (the pvt-1 block as "# " lines:
 * source project, time, build, fluid model, basis, bubble point source,
 * standard and separator conditions, the method of every property, range
 * flags), then a header row that names the unit of every column.
 *
 * Before: the PVT CSV was nine bare column names with Bg in RB/scf, and the
 * Material Balance CSV had units and Bg in RB/Mscf; neither said where the
 * numbers came from.
 *
 * Pure.
 */
import { pvtContractCsvHeader } from '@/lib/inputProvenance/pvtContract';
import { fluidUnits } from './units.js';

const cell = (v) => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v));
const num = (v, digits) => (typeof v === 'number' && Number.isFinite(v) ? String(parseFloat(v.toPrecision(digits))) : '');

/** The columns of the PVT CSV: row key, head text, unit kind, significant digits. */
export const PVT_CSV_COLUMNS = Object.freeze([
  ['pressure', 'Pressure', 'pressure', 7],
  ['Rs', 'Rs', 'gor', 6],
  ['Bo', 'Bo', 'fvfOil', 6],
  ['Bg', 'Bg', 'fvfGas', 5],
  ['Z', 'Z', null, 5],
  ['mu_o', 'Oil viscosity', 'viscosity', 5],
  ['mu_g', 'Gas viscosity', 'viscosity', 5],
  ['co', 'co', 'compressibility', 4],
  ['Bw', 'Bw', 'fvfWater', 6],
  ['mu_w', 'Water viscosity', 'viscosity', 5],
]);

/**
 * The PVT table as CSV in the display units, pressure descending as on the
 * screen and in the report.
 * @param {{rows: object[], contract?: ?object, system?: string, generatedNote?: string}} a
 */
export function pvtTableCsv({ rows, contract = null, system = 'oilfield' }) {
  const u = fluidUnits(system);
  const header = pvtContractCsvHeader(contract, { extra: [`Display units of this file: ${u.sentence()}`, 'Pressures are absolute. Bg is reservoir volume per thousand standard cubic feet (RB/Mscf) or per standard cubic metre (m3/m3).'] });
  const head = [...PVT_CSV_COLUMNS.map(([, text, kind]) => (kind ? u.head(text, kind) : text)), 'Region'].join(',');
  const body = (rows || []).map((r) => [
    ...PVT_CSV_COLUMNS.map(([key, , kind, digits]) => num(kind ? u.show(kind, r[key]) : r[key], digits)),
    cell(r.phase),
  ].join(','));
  return [...header, head, ...body].join('\n');
}

/** Save text as a file from the browser. */
export function downloadText(text, fileName, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

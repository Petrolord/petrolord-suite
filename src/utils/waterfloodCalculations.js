// Re-export shim — this engine lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
export * from '../../packages/engines/engines/waterflood/waterflood.js';

// CSV import helper stays Suite-side: papaparse is a runtime dependency
// the pure engines package must not carry.
import Papa from 'papaparse';

// Header names the Surveillance tab also accepts, each onto its schema column
// (WATERFLOOD_SCHEMA). Only DAILY-RATE names are aliased: the engine reads
// every value as a daily rate, so volume or cumulative headers
// (oil_produced_stb, cum_oil) are deliberately left unrecognised rather than
// read as rates.
const HEADER_ALIASES = {
  date: ['date', 'prod_date', 'production_date', 'day'],
  well: ['well', 'well_name', 'wellname', 'well_id', 'uwi'],
  oil_bbl: ['oil_bbl', 'oil_rate', 'oil_rate_bopd', 'oil_bopd', 'bopd', 'qo', 'oil_rate_stb_d'],
  water_bbl: ['water_bbl', 'water_rate', 'water_rate_bwpd', 'water_bwpd', 'bwpd', 'qw'],
  gas_mcf: ['gas_mcf', 'gas_rate', 'gas_rate_mscfd', 'gas_mscfd', 'mscfd', 'qg'],
  inj_bbl: ['inj_bbl', 'injection_rate', 'injection_rate_bwpd', 'inj_rate', 'inj_bwpd', 'water_inj_rate', 'qinj'],
  whp_psi: ['whp_psi', 'whp', 'injection_pressure', 'injection_pressure_psi', 'thp_psi', 'bhp_psi'],
};
const ALIAS_TO_COLUMN = new Map(
  Object.entries(HEADER_ALIASES).flatMap(([col, names]) => names.map((n) => [n, col])),
);
// lowercase, units in brackets dropped, separators to one underscore
const normHeader = (h) => String(h).trim().toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

/**
 * Parse a surveillance CSV and say what happened to its headers.
 * @returns {{rows: Object[], mapped: Array<[string, string]>, unrecognised: string[]}}
 *   mapped lists [header as written, schema column] where they differ
 * @throws when there are data rows but no date or well column, or no rate
 *   column at all: that file would otherwise load as all zeros
 */
export function parseWaterfloodCSVDetailed(csvText) {
  const mapped = [];
  const unrecognised = [];
  const seen = new Set();
  const decided = new Map();
  const outputs = new Set();
  const parsed = Papa.parse((csvText || '').trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    // papaparse may call this more than once per header, including with the
    // names it already returned: decide once per header and pass our own
    // outputs through
    transformHeader: (h, i) => {
      if (outputs.has(h)) return h;
      const key = `${i}\u0000${h}`;
      if (decided.has(key)) return decided.get(key);
      const col = ALIAS_TO_COLUMN.get(normHeader(h));
      let out;
      if (!col || seen.has(col)) {
        unrecognised.push(h.trim());
        out = `unrecognised:${h.trim()}`;
      } else {
        seen.add(col);
        if (col !== h.trim().toLowerCase()) mapped.push([h.trim(), col]);
        out = col;
      }
      decided.set(key, out);
      outputs.add(out);
      return out;
    },
  });
  const rows = (Array.isArray(parsed.data) ? parsed.data : []).map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('unrecognised:')) out[k] = v;
    return out;
  });
  if (rows.length) {
    const missing = ['date', 'well'].filter((c) => !seen.has(c));
    const rates = ['oil_bbl', 'water_bbl', 'inj_bbl'].filter((c) => seen.has(c));
    if (missing.length || !rates.length) {
      const what = missing.length ? `no ${missing.join(' or ')} column` : 'no rate column';
      throw new Error(`This file has ${what}, so it would load as zeros. The Surveillance tab reads date, well and daily rates `
        + `(oil_bbl, water_bbl, gas_mcf, inj_bbl, optional whp_psi, or names such as oil_rate_bopd). `
        + `Not recognised: ${unrecognised.join(', ') || 'none'}.`);
    }
  }
  return { rows, mapped, unrecognised };
}

// Robust CSV parse via papaparse (handles quoted fields, blank cells, trailing
// commas) — the old naive split(',') broke on all three.
export function parseWaterfloodCSV(csvText) {
  return parseWaterfloodCSVDetailed(csvText).rows;
}

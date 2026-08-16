// ----------------------------------------------------------------------------
// epeExampleCase.js
// Builds a complete, self-consistent example economics case for the
// Petroleum Economics Studio so a new user can explore the app without
// uploading any CSVs. All rows use the same schemas the CSV uploader and
// engine v3.3 accept (annual rows keyed by a `year` column).
// ----------------------------------------------------------------------------

const START_YEAR = 2027;
const YEARS = 10;

const INITIAL_RATE_BOPD = 15000;   // first-year average oil rate
const ANNUAL_DECLINE = 0.12;       // effective decline per year
const GAS_YIELD_MSCF_PER_BBL = 0.6;
const WATERCUT_START = 0.10;       // fraction of total liquids in year 1
const WATERCUT_END = 0.60;         // fraction of total liquids in final year

const FIXED_OPEX_USD = 40000000;   // per year
const VARIABLE_OPEX_USD_PER_BBL = 6;

/**
 * Returns { caseName, caseDescription, production, capex, opex }.
 * production / capex / opex are arrays of plain row objects in the
 * CSV schemas the EPE engine accepts.
 */
export function buildExampleCaseData() {
  const production = [];
  const opex = [];

  for (let i = 0; i < YEARS; i++) {
    const year = START_YEAR + i;

    // Exponential decline oil profile
    const rateBopd = INITIAL_RATE_BOPD * Math.pow(1 - ANNUAL_DECLINE, i);
    const oil_bbl = Math.round(rateBopd * 365);

    // Associated gas
    const gas_mscf = Math.round(oil_bbl * GAS_YIELD_MSCF_PER_BBL);

    // Watercut climbs linearly from 10% to 60% of total liquids
    const watercut = WATERCUT_START + ((WATERCUT_END - WATERCUT_START) * i) / (YEARS - 1);
    const water_bbl = Math.round((oil_bbl * watercut) / (1 - watercut));

    production.push({ year, oil_bbl, gas_mscf, water_bbl });

    const variable_opex_usd = Math.round(oil_bbl * VARIABLE_OPEX_USD_PER_BBL);
    opex.push({
      year,
      fixed_opex_usd: FIXED_OPEX_USD,
      variable_opex_usd,
      total_opex_usd: FIXED_OPEX_USD + variable_opex_usd,
    });
  }

  const capex = [
    { year: 2027, category: 'Drilling', item: 'Development wells (initial campaign)', cost_usd: 180000000 },
    { year: 2027, category: 'Facilities', item: 'Processing facilities and flowlines', cost_usd: 220000000 },
    { year: 2028, category: 'Drilling', item: 'Infill wells (second campaign)', cost_usd: 90000000 },
    { year: 2032, category: 'Workover', item: 'Mid-life workover program', cost_usd: 25000000 },
  ];

  return {
    caseName: 'Example: Ilara Field 10-yr oil development',
    caseDescription:
      'Generated sample data for exploring the studio. A 10 year oil development starting in 2027 with an exponential decline profile, associated gas, rising watercut, phased CAPEX and fixed plus variable OPEX. Replace with your own data when ready.',
    production,
    capex,
    opex,
  };
}

export default buildExampleCaseData;

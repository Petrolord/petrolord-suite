/**
 * Well Spacing Optimizer engine.
 *
 * SCOPE, stated plainly because it decides how the output should be read:
 * this is a capital and economics optimiser at a STATED recovery factor. It
 * does not model well interference, drainage-radius overlap, or incremental
 * recovery from downspacing. Each well is assumed to drain exactly its
 * spacing area at the recovery factor you supply, so field recovery is that
 * recovery factor multiplied by the fraction of the field covered by whole
 * wells. Tightening the spacing therefore buys you coverage and acceleration,
 * never a better sweep. If you need a recovery response to spacing, that is a
 * simulation question and belongs in Reservoir Simulation Studio.
 *
 * 2026-08-27 correctness pass. Four defects fixed, all of which produced
 * wrong numbers on screen:
 *   1. generateJustification sorted the results array IN PLACE, twice, so the
 *      table and all three charts came out ordered by cost per barrel rather
 *      than by spacing and the NPV curve was drawn over a non-monotonic axis.
 *   2. The initial rate was `EUR * 1000 * 0.15` treated as a DAILY rate and
 *      then multiplied by 365, so the production stream was inconsistent with
 *      the EUR in the same table row by a factor of roughly 365 and NPV was
 *      inflated accordingly. The rate is now derived from the EUR so the two
 *      agree by construction.
 *   3. Cost per barrel multiplied an already-accumulated opex total by the
 *      life again, so opex entered as N x opex x life squared.
 *   4. Cost per barrel divided by the full EUR even when the project duration
 *      truncated the well before it reached its economic limit. It now
 *      divides by what is actually produced.
 */
import { pvtCalcs } from './pvtCalculations';

const REQUIRED_NUMERIC = [
  { key: 'reservoirArea', label: 'Reservoir area', min: 0 },
  { key: 'avgNetPayThickness', label: 'Average net pay', min: 0 },
  { key: 'porosity', label: 'Porosity', min: 0, max: 100, unit: 'percent' },
  { key: 'initialWaterSaturation', label: 'Initial water saturation', min: 0, max: 1, unit: 'fraction' },
  { key: 'recoveryFactor', label: 'Recovery factor', min: 0, max: 100, unit: 'percent' },
  { key: 'wellCost', label: 'Well cost', min: 0 },
  { key: 'operatingExpense', label: 'Operating expense', min: 0 },
  { key: 'minEconomicFlowRate', label: 'Minimum economic rate', min: 0 },
  { key: 'typicalWellDeclineRate', label: 'Well decline rate', min: 0, max: 100, exclusiveMax: true, unit: 'percent' },
  { key: 'oilPrice', label: 'Oil price', min: 0 },
  { key: 'gasPrice', label: 'Gas price', min: 0, allowZero: true },
  { key: 'discountRate', label: 'Discount rate', min: 0, allowZero: true, max: 100, unit: 'percent' },
  { key: 'projectDuration', label: 'Project duration', min: 0 },
  { key: 'royaltiesTaxes', label: 'Royalties and taxes', min: 0, allowZero: true, max: 100, unit: 'percent' },
  { key: 'initialSolutionGOR', label: 'Initial solution GOR', min: 0, allowZero: true },
  { key: 'minSpacing', label: 'Minimum spacing', min: 0 },
  { key: 'maxSpacing', label: 'Maximum spacing', min: 0 },
  { key: 'spacingIncrement', label: 'Spacing increment', min: 0 },
];

/**
 * Validate the form. Returns { ok, errors } where errors names the offending
 * field, so the caller can tell the user WHICH of two dozen inputs is wrong
 * instead of asking them to hunt.
 *
 * Note reservoir temperature, reservoir pressure, oil gravity, gas gravity,
 * well pattern type and the map coordinates are deliberately NOT required.
 * They are recorded on the case and travel into the JSON export, and they
 * enter no equation in this engine. Requiring them would imply otherwise.
 */
export const validateInputs = (formData) => {
  const errors = [];

  if (!formData?.fieldName || !String(formData.fieldName).trim()) {
    errors.push('Field name is required.');
  }

  for (const spec of REQUIRED_NUMERIC) {
    const raw = formData?.[spec.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors.push(`${spec.label} is required.`);
      continue;
    }
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) {
      errors.push(`${spec.label} must be a number.`);
      continue;
    }
    const floorOk = spec.allowZero ? value >= spec.min : value > spec.min;
    if (!floorOk) {
      errors.push(`${spec.label} must be ${spec.allowZero ? 'zero or greater' : 'greater than zero'}.`);
      continue;
    }
    if (spec.max !== undefined) {
      const ceilingOk = spec.exclusiveMax ? value < spec.max : value <= spec.max;
      if (!ceilingOk) {
        const bound = spec.exclusiveMax ? `below ${spec.max}` : `${spec.max} or less`;
        errors.push(`${spec.label} must be ${bound}${spec.unit ? ` (${spec.unit})` : ''}.`);
      }
    }
  }

  const min = parseFloat(formData?.minSpacing);
  const max = parseFloat(formData?.maxSpacing);
  const step = parseFloat(formData?.spacingIncrement);
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    errors.push('Minimum spacing must not exceed maximum spacing.');
  }
  if (Number.isFinite(step) && Number.isFinite(min) && Number.isFinite(max) && step > 0 && max > min) {
    if ((max - min) / step > 2000) {
      errors.push('Spacing increment is too small for the range; that is more than 2000 cases.');
    }
  }

  const area = parseFloat(formData?.reservoirArea);
  if (Number.isFinite(area) && Number.isFinite(min) && min > area) {
    errors.push('Minimum spacing exceeds the reservoir area, so no well fits.');
  }

  return { ok: errors.length === 0, errors };
};

const BBL_PER_ACRE_FT = 7758;

// Senior test T1 (2026-09-27): OOIP per well was 7758 A h phi (1 - Sw) with
// no formation volume factor, so every volume, NPV and cost per barrel was
// in reservoir barrels priced as stock-tank barrels (about 28 % high on the
// example). The form already asks for GOR, API, gas gravity and reservoir
// temperature, which went unused; they give Standing's Bo through the
// Suite's PVT module.
//
// H6: oil gravity, gas gravity and temperature are optional on the form.
// When one is blank Standing's Bo cannot be computed and 1 is used. That is
// a fallback and is reported as one: the note used to say "Bo 1.000 rb/stb,
// from Standing's correlation".
export const standingBo = (p) => {
  const bo = pvtCalcs.standing_bo(p.gor, p.api, p.gasGravity, p.temperatureF);
  return Number.isFinite(bo) && bo > 0 ? { bo, source: 'standing' } : { bo: 1, source: 'fallback' };
};

/** The Bo sentence under the results, for the screen and the test. */
export const boNote = (results) => {
  if (!Number.isFinite(results?.boUsed)) return null;
  return results.boSource === 'standing'
    ? `Volumes are stock-tank barrels: oil in place is divided by Bo ${results.boUsed.toFixed(3)} rb/stb, from Standing's correlation on your GOR, oil gravity, gas gravity and temperature.`
    : `Bo could not be computed: Standing's correlation needs the GOR, oil gravity, gas gravity and temperature, and one of them is blank or out of range. A fallback of ${results.boUsed.toFixed(3)} rb/stb is used, so the volumes shown are reservoir barrels counted as stock-tank barrels and are too high by the true Bo.`;
};

/**
 * The sentence the screen and the JSON export both carry (H6). The export
 * used to name an optimum the screen disclaims.
 */
export const NO_OPTIMUM_NOTE = 'The highest NPV here is arithmetic and does not amount to an engineering recommendation, so no optimum is nominated.';
const DAYS_PER_YEAR = 365;

/**
 * One spacing case.
 *
 * The production model is a single exponential decline per well, anchored so
 * that the volume produced between the initial rate and the economic rate is
 * exactly the well's EUR. That is what makes the rate stream and the EUR in
 * the same table row agree, which they previously did not.
 *
 *   De  effective annual decline, as entered
 *   Dn  nominal annual decline  = -ln(1 - De)
 *   EUR = (qi - qLimit) / Dn    with rates per year
 *   =>  qi = EUR * Dn + qLimit
 *   life = ln(qi / qLimit) / Dn
 */
const evaluateSpacing = (spacing, p) => {
  const numberOfWells = Math.floor(p.reservoirArea / spacing);
  if (numberOfWells < 1) return null;

  const oiipPerWell = (spacing * p.avgNetPay * p.porosity * (1 - p.swi) * BBL_PER_ACRE_FT) / (p.bo || 1);
  const eurPerWellBbl = oiipPerWell * p.recoveryFactor;

  // Areal coverage is the share of the field that whole wells actually drain.
  // It is what makes the field-recovery curve step: a spacing that divides
  // evenly into the area covers all of it, one that does not leaves a
  // remainder undrained.
  const arealCoverage = (numberOfWells * spacing) / p.reservoirArea;
  const totalFieldRecovery = arealCoverage * p.recoveryFactor * 100;

  const totalCapex = (numberOfWells * p.wellCost) / 1e6;

  const Dn = -Math.log(1 - p.declineRate);
  const qLimitAnnual = p.minEconomicRate * DAYS_PER_YEAR;
  const qiAnnual = eurPerWellBbl * Dn + qLimitAnnual;
  const economicLife = Math.log(qiAnnual / qLimitAnnual) / Dn;
  const actualLife = Math.min(economicLife, p.projectDuration);

  let npv = 0;
  let opexTotalPerWell = 0;
  let producedPerWell = 0;

  const wholeYears = Math.floor(actualLife);
  for (let year = 1; year <= Math.ceil(actualLife); year++) {
    const from = year - 1;
    const to = Math.min(year, actualLife);
    if (to <= from) break;
    const fraction = to - from;

    // Exact integral of qi*exp(-Dn*t) over [from, to].
    const oil = (qiAnnual / Dn) * (Math.exp(-Dn * from) - Math.exp(-Dn * to));
    const gas = (oil * p.gor) / 1000;

    const revenue = oil * p.oilPrice + gas * p.gasPrice;
    const netRevenue = revenue * (1 - p.royaltiesTaxes);
    const opexThisYear = p.opex * fraction;
    const cashFlow = netRevenue - opexThisYear;

    npv += cashFlow * Math.pow(1 + p.discountRate, -year);
    opexTotalPerWell += opexThisYear;
    producedPerWell += oil;
  }

  const wellNPV = npv - p.wellCost;
  const totalNPV = (numberOfWells * wellNPV) / 1e6;

  const totalProduction = numberOfWells * producedPerWell;
  const totalOpexAllWells = numberOfWells * opexTotalPerWell;
  const costPerBarrel = totalProduction > 0
    ? (totalCapex * 1e6 + totalOpexAllWells) / totalProduction
    : NaN;

  return {
    spacing,
    numberOfWells,
    arealCoverage,
    eurPerWell: eurPerWellBbl / 1000,          // Mbbl, as displayed
    producedPerWell: producedPerWell / 1000,   // Mbbl actually produced
    totalFieldRecovery,
    totalCapex,
    npv: totalNPV,
    costPerBarrel,
    economicLife: actualLife,
    truncatedByDuration: economicLife > p.projectDuration,
    initialRateBpd: qiAnnual / DAYS_PER_YEAR,
    wholeYears,
  };
};

export const evaluateSpacingCases = async (formData) => {
  const p = {
    reservoirArea: parseFloat(formData.reservoirArea),
    avgNetPay: parseFloat(formData.avgNetPayThickness),
    porosity: parseFloat(formData.porosity) / 100,
    swi: parseFloat(formData.initialWaterSaturation),
    recoveryFactor: parseFloat(formData.recoveryFactor) / 100,
    wellCost: parseFloat(formData.wellCost),
    opex: parseFloat(formData.operatingExpense),
    oilPrice: parseFloat(formData.oilPrice),
    gasPrice: parseFloat(formData.gasPrice),
    discountRate: parseFloat(formData.discountRate) / 100,
    projectDuration: parseFloat(formData.projectDuration),
    royaltiesTaxes: parseFloat(formData.royaltiesTaxes) / 100,
    declineRate: parseFloat(formData.typicalWellDeclineRate) / 100,
    minEconomicRate: parseFloat(formData.minEconomicFlowRate),
    gor: parseFloat(formData.initialSolutionGOR),
    api: parseFloat(formData.oilGravity),
    gasGravity: parseFloat(formData.gasGravity),
    temperatureF: parseFloat(formData.reservoirTemperature),
  };
  const { bo, source: boSource } = standingBo(p);
  p.bo = bo;

  const minSpacing = parseFloat(formData.minSpacing);
  const maxSpacing = parseFloat(formData.maxSpacing);
  const increment = parseFloat(formData.spacingIncrement);

  const spacingResults = [];
  // Step by index rather than accumulating, so a non-integer increment cannot
  // drift into values like 20.299999999999997 and render raw in the table.
  const steps = Math.floor((maxSpacing - minSpacing) / increment);
  for (let i = 0; i <= steps; i++) {
    const spacing = Number((minSpacing + i * increment).toFixed(6));
    const result = evaluateSpacing(spacing, p);
    if (result) spacingResults.push(result);
  }

  if (spacingResults.length === 0) {
    throw new Error('No spacing in the requested range fits a whole well into the reservoir area.');
  }

  // H6: no case is singled out. Under a stated recovery factor with no
  // interference the highest NPV is the widest spacing that divides the area
  // with least waste, which is arithmetic. The screen says so, and the
  // result and the export now say the same: the table is the output.
  return {
    spacingResults,
    boUsed: p.bo,
    boSource,
  };
};

export const generateCSV = (results) => {
  const header = [
    'Well Spacing (acres/well)', 'Number of Wells', 'Areal Coverage (%)',
    'EUR per Well (Mbbl)', 'Produced per Well (Mbbl)', 'Total Field Recovery (%)',
    'Total Capex ($MM)', 'NPV ($MM)', 'Cost per Barrel ($/bbl)', 'Economic Life (years)',
  ];
  const rows = results.spacingResults.map((r) => [
    r.spacing,
    r.numberOfWells,
    (r.arealCoverage * 100).toFixed(1),
    r.eurPerWell.toFixed(1),
    r.producedPerWell.toFixed(1),
    r.totalFieldRecovery.toFixed(1),
    r.totalCapex.toFixed(1),
    r.npv.toFixed(1),
    Number.isFinite(r.costPerBarrel) ? r.costPerBarrel.toFixed(2) : '',
    r.economicLife.toFixed(1),
  ]);
  return [header, ...rows].map((row) => row.join(',')).join('\n');
};

export const generateJSON = (formData, results) => ({
  inputParameters: formData,
  spacingCases: results.spacingResults,
  timestamp: new Date().toISOString(),
  metadata: {
    totalScenariosAnalyzed: results.spacingResults.length,
    optimumNominated: false,
    reading: NO_OPTIMUM_NOTE,
    bo: { value: results.boUsed, unit: 'rb/stb', source: results.boSource },
    recoveryModel: 'stated recovery factor over the area covered by whole wells; no interference physics',
    version: 'WellSpacingOptimizer v2.1',
  },
});

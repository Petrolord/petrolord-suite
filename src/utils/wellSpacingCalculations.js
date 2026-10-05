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
import { DAYS_PER_YEAR as REGISTRY_YEAR } from '@/lib/units/registry';
import { pvtCalcs } from './pvtCalculations';
import { calculateEconomics } from './npvCalculations';
import { drainageCase, layoutOf, DEFAULT_LAYOUT, lineSourceDropPsi, lineSourceArgument } from './wellspacing/drainage';
import { rfPointsOf, fitRfAgainstSpacing, rfAtSpacing } from './wellspacing/rfCalibration';

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
 * WS-U1: inputs that are optional. Oil FVF replaces Standing's Bo when it
 * is given (a lab value, or the pvt-1 table at the reservoir pressure). The
 * rest feed the drainage diagnostics (wellspacing/drainage.js), which change
 * no EUR and no NPV; blank, the diagnostic says what it waits for.
 */
const OPTIONAL_NUMERIC = [
  { key: 'oilFvf', label: 'Oil formation volume factor', min: 1, allowZero: true, max: 5, unit: 'RB/STB' },
  { key: 'reservoirPressure', label: 'Average reservoir pressure', min: 0 },
  { key: 'flowingPressure', label: 'Flowing bottomhole pressure', min: 0, allowZero: true },
  { key: 'permeability', label: 'Permeability', min: 0 },
  { key: 'skin', label: 'Skin', min: -7, allowZero: true, max: 100 },
  { key: 'oilViscosity', label: 'Oil viscosity', min: 0 },
  { key: 'totalCompressibility', label: 'Total compressibility', min: 0, max: 0.01, unit: '1/psi' },
  { key: 'wellboreRadius', label: 'Wellbore radius', min: 0, max: 5, unit: 'ft' },
  { key: 'interferenceDays', label: 'Interference test time', min: 0 },
  { key: 'gaugeResolutionPsi', label: 'Gauge resolution', min: 0 },
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

  // WS-U1: optional inputs. Blank means "not given" (the diagnostic that
  // needs it says so); a typed value must be a usable number.
  for (const spec of OPTIONAL_NUMERIC) {
    const raw = formData?.[spec.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) { errors.push(`${spec.label} must be a number.`); continue; }
    if (spec.min !== undefined && !(spec.allowZero ? value >= spec.min : value > spec.min)) {
      errors.push(`${spec.label} must be ${spec.allowZero ? 'zero or greater' : `greater than ${spec.min}`}.`);
      continue;
    }
    if (spec.max !== undefined && !(value <= spec.max)) errors.push(`${spec.label} must be ${spec.max} or less${spec.unit ? ` (${spec.unit})` : ''}.`);
  }
  const pAvg = parseFloat(formData?.reservoirPressure);
  const pwf = parseFloat(formData?.flowingPressure);
  if (Number.isFinite(pAvg) && Number.isFinite(pwf) && !(pwf < pAvg)) {
    errors.push('Flowing bottomhole pressure must be below the average reservoir pressure.');
  }

  // WS-U2-002: recovery against spacing, calibrated on the user's points
  if (formData?.recoveryModel === 'calibrated') {
    const fit = fitRfAgainstSpacing(rfPointsOf(formData));
    if (!fit.ok) errors.push(...fit.errors);
    else {
      const lo = parseFloat(formData?.minSpacing);
      const hi = parseFloat(formData?.maxSpacing);
      for (const s0 of [lo, hi]) {
        if (!(s0 > 0)) continue;
        const rf = rfAtSpacing(fit, s0);
        if (!(rf > 0 && rf <= 100)) errors.push(`The recovery against spacing fit gives ${rf.toFixed(1)} percent at ${s0} acres a well, outside 0 to 100: narrow the spacing range or add points.`);
      }
    }
  }

  // WS-U2-010: fiscal terms
  const fiscal = formData?.fiscalTerms || 'royalty';
  const pctIn = (key, label, required) => {
    const raw = formData?.[key];
    if (raw == null || String(raw).trim() === '') { if (required) errors.push(`${label} is required for these fiscal terms.`); return; }
    const v = parseFloat(raw);
    if (!(Number.isFinite(v) && v >= 0 && v <= 100)) errors.push(`${label} must be between 0 and 100 (%).`);
  };
  if (fiscal === 'taxRoyalty' || fiscal === 'psc') pctIn('incomeTaxRate', 'Income tax rate', true);
  if (fiscal === 'psc') { pctIn('costRecoveryCap', 'Cost recovery cap', true); pctIn('contractorProfitShare', 'Contractor share of profit oil', true); }
  if (fiscal === 'taxRoyalty' && String(formData?.depreciationYears ?? '').trim() !== '' && !(parseFloat(formData.depreciationYears) >= 1)) errors.push('Depreciation years must be 1 or more.');

  // WS-U2-003: the drilling schedule
  const schedule = formData?.drillingSchedule || 'year1';
  if (schedule === 'wellsPerYear' || schedule === 'rigs') {
    const need = schedule === 'wellsPerYear' ? [['wellsPerYear', 'Wells brought on stream a year']] : [['rigCount', 'Rigs'], ['wellsPerRigYear', 'Wells a rig drills in a year']];
    const vals = need.map(([k, label]) => {
      const v = parseFloat(formData?.[k]);
      if (!Number.isFinite(v) || !(v > 0)) errors.push(`${label} is required for this drilling schedule and must be greater than zero.`);
      return v;
    });
    if (vals.every((v) => v > 0) && Math.floor(vals.reduce((a, b) => a * b, 1) + 1e-9) < 1) errors.push('The drilling schedule brings fewer than one well on stream a year.');
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
  // WS-U1: a Bo given on the form (lab, or the pvt-1 table) wins over the correlation
  if (Number.isFinite(p.boGiven) && p.boGiven > 0) return { bo: p.boGiven, source: 'given' };
  const bo = pvtCalcs.standing_bo(p.gor, p.api, p.gasGravity, p.temperatureF);
  return Number.isFinite(bo) && bo > 0 ? { bo, source: 'standing' } : { bo: 1, source: 'fallback' };
};

/** The Bo sentence under the results, for the screen and the test. */
export const boNote = (results) => {
  if (!Number.isFinite(results?.boUsed)) return null;
  if (results.boSource === 'given') return `Volumes are stock-tank barrels: oil in place is divided by Bo ${results.boUsed.toFixed(4)} RB/STB, as given on the form (Standing's correlation is not used).`;
  return results.boSource === 'standing'
    ? `Volumes are stock-tank barrels: oil in place is divided by Bo ${results.boUsed.toFixed(3)} rb/stb, from Standing's correlation on your GOR, oil gravity, gas gravity and temperature.`
    : `Bo could not be computed: Standing's correlation needs the GOR, oil gravity, gas gravity and temperature, and one of them is blank or out of range. A fallback of ${results.boUsed.toFixed(3)} rb/stb is used, so the volumes shown are reservoir barrels counted as stock-tank barrels and are too high by the true Bo.`;
};

/**
 * The sentence the screen and the JSON export both carry (H6). The export
 * used to name an optimum the screen disclaims.
 */
export const NO_OPTIMUM_NOTE = 'The highest NPV here is arithmetic and does not amount to an engineering recommendation, so no optimum is nominated.';
// one year is 365.25 days across the decline apps (DCA-U1-010), the registry's year
const DAYS_PER_YEAR = REGISTRY_YEAR;

/**
 * H7: the discounting convention, printed wherever the NPV goes. The NPV
 * comes from the Suite screening engine `calculateEconomics`; the app used
 * to run its own year-end loop with the well cost undiscounted.
 */
export const NPV_CONVENTION_NOTE = 'NPV is computed by the Suite screening economics engine with mid-year discounting: each year\'s cash flow, the well cost in the first year included, is discounted to the middle of its year.';

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
const finiteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * WS-U2-002: the recovery factor of a case, a fraction: the stated RF, or
 * with the calibrated model the user's fit RF(S) = a + b ln S at the spacing.
 */
export const rfOf = (spacing, p) => (p.rfFit ? rfAtSpacing(p.rfFit, spacing) / 100 : p.recoveryFactor);

/**
 * WS-U2-001: the deliverable rate a well has at a spacing, STB/d: the
 * pseudosteady-state rate of the Step 1 drainage check (drainage.js,
 * Ahmed and McKinney 2005 Eq. 1.2.124), NaN when a drainage input is blank.
 */
export const deliverableRateStbd = (spacing, p) => drainageCase({
  spacingAcres: spacing,
  layout: p.layout,
  planRateStbd: NaN,
  rock: {
    kMd: p.permeability, phi: p.porosity, muCp: p.oilViscosity, ctPerPsi: p.totalCompressibility,
    hFt: p.avgNetPay, pAvgPsia: p.reservoirPressure, pwfPsia: p.flowingPressure, bo: p.bo, rwFt: p.wellboreRadius, skin: p.skin,
  },
}).pssRateStbd;

/**
 * The production of one well at a spacing (rates per year, t in years from
 * its first production).
 *
 * Unlimited (Step 1, and the switch off): one exponential decline from qi,
 * anchored so the volume to the economic limit is the EUR.
 *
 * Rate-limited (WS-U2-001, on by default): when the plan's qi is above the
 * deliverable rate qd, the well produces at qd (a plateau) until the
 * exponential decline from qd would leave exactly the rest of the EUR:
 *   plateau tp = (qi - qd) / (Dn qd);  then q = qd exp(-Dn (t - tp))
 *   life = tp + ln(qd / qLimit) / Dn;  volume to the limit = EUR (unchanged)
 * The same oil, later. A deliverable rate at or below the economic limit
 * rate produces nothing (the well never makes the limit).
 *
 * `cum(t)` is the exact cumulative, used for every yearly volume.
 */
export const wellProfile = (spacing, p) => {
  const oiipPerWell = (spacing * p.avgNetPay * p.porosity * (1 - p.swi) * BBL_PER_ACRE_FT) / (p.bo || 1);
  const eurPerWellBbl = oiipPerWell * rfOf(spacing, p);
  const Dn = -Math.log(1 - p.declineRate);
  const qLimitAnnual = p.minEconomicRate * DAYS_PER_YEAR;
  const qiAnnual = eurPerWellBbl * Dn + qLimitAnnual;
  const deliverable = deliverableRateStbd(spacing, p);
  const capAnnual = finiteNum(deliverable) && deliverable > 0 ? deliverable * DAYS_PER_YEAR : NaN;
  const binding = p.rateLimit !== false && finiteNum(capAnnual) && capAnnual < qiAnnual;
  let qStart = qiAnnual;
  let plateauYears = 0;
  let economicLife;
  let belowLimit = false;
  if (binding && capAnnual <= qLimitAnnual) {
    belowLimit = true;
    qStart = capAnnual;
    economicLife = 0;
  } else {
    if (binding) {
      qStart = capAnnual;
      plateauYears = (qiAnnual - capAnnual) / (Dn * capAnnual);
    }
    economicLife = plateauYears + Math.log(qStart / qLimitAnnual) / Dn;
  }
  const cum = (t) => {
    const x = Math.max(0, Math.min(t, economicLife));
    if (x <= plateauYears) return qStart * x;
    return qStart * plateauYears + (qStart / Dn) * (1 - Math.exp(-Dn * (x - plateauYears)));
  };
  return {
    eurPerWellBbl, Dn, qiAnnual, qLimitAnnual, economicLife, cum,
    deliverableStbd: deliverable,
    rateLimit: { on: p.rateLimit !== false, computed: finiteNum(capAnnual), binding, belowLimit, plateauYears, startRateStbd: qStart / DAYS_PER_YEAR },
  };
};

/** WS-U2-003: the schedules a case can be drilled on. */
export const SCHEDULES = Object.freeze(['year1', 'wellsPerYear', 'rigs']);

/** Wells brought on stream a year under the schedule, or null when all are in year 1. */
export const wellsPerYearOf = (p) => {
  if (p.schedule === 'wellsPerYear') return Math.floor(p.wellsPerYear);
  if (p.schedule === 'rigs') return Math.floor(p.rigCount * p.wellsPerRigYear + 1e-9);
  return null;
};

/**
 * The wells of a case by the year they come on stream (WS-U2-003): a list
 * of { startYear (0 = the first project year), wells }. All in year 1 by
 * default, as every release before the schedule; otherwise so many wells a
 * year (typed, or rigs times wells per rig a year), the last year taking
 * the rest. Each well's capex falls in its year and it is on stream from the
 * start of that year.
 */
export const drillingCohorts = (numberOfWells, p = {}) => {
  const perYear = wellsPerYearOf(p);
  if (!perYear || perYear >= numberOfWells) return [{ startYear: 0, wells: numberOfWells }];
  const out = [];
  for (let k = 0, left = numberOfWells; left > 0; k += 1) {
    const w = Math.min(perYear, left);
    out.push({ startYear: k, wells: w });
    left -= w;
  }
  return out;
};

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * The field production of one case: the per-well profile shifted to each
 * cohort's start and cut at the end of the project duration. `F(t)` is the
 * exact field cumulative oil (STB) at t years from the first project year;
 * every yearly volume, the sender's profile and the totals come from it.
 */
export const fieldProfile = (spacing, p) => {
  const numberOfWells = Math.floor(p.reservoirArea / spacing);
  const prof = wellProfile(spacing, p);
  const cohorts = drillingCohorts(numberOfWells, p).map((c) => ({ ...c, life: Math.max(0, Math.min(prof.economicLife, p.projectDuration - c.startYear)) }));
  const endYears = Math.max(0, ...cohorts.map((c) => c.startYear + c.life));
  const F = (t) => cohorts.reduce((sum, c) => sum + c.wells * prof.cum(Math.max(0, Math.min(t - c.startYear, c.life))), 0);
  /** well-years on stream between a and b (years from the first project year) */
  const wellYearsOn = (a, b) => cohorts.reduce((sum, c) => sum + c.wells * overlap(a, b, c.startYear, c.startYear + c.life), 0);
  return { numberOfWells, prof, cohorts, endYears, F, wellYearsOn };
};

/**
 * The `calculateEconomics` inputs of one spacing case, for the whole field.
 * Royalties and taxes are one percentage of gross revenue on the form, so
 * they enter as the royalty rate with no income tax. Costs are in $MM, as
 * the engine expects. Opex runs for the well-years on stream in each year
 * (a part year pro-rated). Each cohort's capex falls in its first year; a
 * case whose wells never produce keeps its capex.
 */
export const spacingEconomicsInputs = (spacing, p) => {
  const { cohorts, endYears, F, wellYearsOn } = fieldProfile(spacing, p);
  const n = Math.max(1, Math.ceil(endYears - 1e-9), ...cohorts.map((c) => c.startYear + 1));
  const idx = Array.from({ length: n }, (_, i) => i);
  const oil = idx.map((i) => F(i + 1) - F(i)); // bbl
  return {
    projectLife: n,
    discountRate: p.discountRate * 100,
    // WS-U2-010: the fiscal terms calculateEconomics already supports, wired (no fiscal maths here)
    fiscalType: p.fiscal === 'psc' ? 'PSC' : 'TaxRoyalty',
    production: {
      oil,
      gas: oil.map((v) => (v * p.gor) / 1000), // Mscf
    },
    price: { oil: new Array(n).fill(p.oilPrice), gas: new Array(n).fill(p.gasPrice) },
    capex: idx.map((i) => (cohorts.filter((c) => c.startYear === i).reduce((sum, c) => sum + c.wells, 0) * p.wellCost) / 1e6),
    opexFixed: idx.map((i) => (wellYearsOn(i, i + 1) * p.opex) / 1e6),
    opexVariable: new Array(n).fill(0),
    abandonment: new Array(n).fill(0),
    royaltyRate: p.royaltiesTaxes * 100,
    taxRate: p.fiscal === 'royalty' ? 0 : p.taxRatePct,
    capexDepreciationYears: p.fiscal === 'taxRoyalty' && p.depreciationYears > 0 ? p.depreciationYears : 1,
    lossCarryForward: p.fiscal === 'taxRoyalty' && p.lossCarryForward,
    ...(p.fiscal === 'psc' ? { costRecoveryCap: p.costRecoveryCapPct, profitSplitContractor: p.contractorSharePct } : {}),
  };
};

const row0Distance = (spacing, p) => drainageCase({ spacingAcres: spacing, layout: p.layout, planRateStbd: NaN }).distanceFt;

/**
 * WS-U2-006: the pressure drop at the neighbouring well when one well of the
 * case produces at its starting rate for the stated time and the neighbour
 * is shut in as the observer: the line source of the Step 1 gates (Ahmed and
 * McKinney 2005 Eq. 1.2.134), dp = 70.6 q mu B / (k h) E1(948 phi mu ct r^2
 * / (k t)), t in hours, r the distance between wells. Held against the gauge
 * resolution: measurable when the drop is at least the resolution.
 * Infinite acting: the other wells are shut in and no boundary is felt.
 */
export function interferenceAtNeighbour(rFt, qStbd, p) {
  const tDays = p.interferenceDays;
  const missing = [['interference test time', tDays], ['permeability', p.permeability], ['oil viscosity', p.oilViscosity], ['total compressibility', p.totalCompressibility]]
    .filter(([, v]) => !(Number.isFinite(v) && v > 0)).map(([n]) => n);
  if (missing.length) return { computed: false, text: `Not computed: ${missing.join(', ')} not given.` };
  const args = { qStbd, muCp: p.oilViscosity, bo: p.bo, kMd: p.permeability, hFt: p.avgNetPay, phi: p.porosity, ctPerPsi: p.totalCompressibility, rFt, tHours: tDays * 24 };
  const dropPsi = lineSourceDropPsi(args);
  const x = lineSourceArgument(args);
  const res = p.gaugeResolutionPsi;
  return {
    computed: Number.isFinite(dropPsi),
    tDays, rFt, qStbd, x, dropPsi,
    resolutionPsi: Number.isFinite(res) && res > 0 ? res : null,
    measurable: Number.isFinite(res) && res > 0 && Number.isFinite(dropPsi) ? dropPsi >= res : null,
    text: null,
  };
}

// One canonical economics run of a case, with the volumes it was run on.
const economicsOf = (spacing, p) => {
  const field = fieldProfile(spacing, p);
  const inputs = spacingEconomicsInputs(spacing, p);
  const { metrics } = calculateEconomics(inputs, { skipIrr: true });
  const produced = field.F(field.endYears);
  return { field, prof: field.prof, inputs, metrics, producedPerWell: field.numberOfWells > 0 ? produced / field.numberOfWells : 0 };
};

const evaluateSpacing = (spacing, p) => {
  const numberOfWells = Math.floor(p.reservoirArea / spacing);
  if (numberOfWells < 1) return null;

  // H7: the canonical screening NPV. No discounting is done in this file.
  const run = economicsOf(spacing, p);
  const { eurPerWellBbl, qiAnnual, economicLife } = run.prof;
  const { metrics } = run;
  const actualLife = run.field.endYears;
  const lastStart = Math.max(...run.field.cohorts.map((c) => c.startYear));

  // WS-U2-001: the other side of the rate-limit switch, for the before and
  // after. A second canonical run only where the limit binds; elsewhere the
  // two profiles are the same and so are the numbers.
  const rl = run.prof.rateLimit;
  const other = rl.binding || (!rl.on && rl.computed && run.prof.deliverableStbd * DAYS_PER_YEAR < qiAnnual)
    ? economicsOf(spacing, { ...p, rateLimit: !rl.on })
    : run;
  const limitedRun = rl.on ? run : other;
  const unlimitedRun = rl.on ? other : run;

  // Areal coverage is the share of the field that whole wells actually drain.
  // It is what makes the field-recovery curve step: a spacing that divides
  // evenly into the area covers all of it, one that does not leaves a
  // remainder undrained.
  const arealCoverage = (numberOfWells * spacing) / p.reservoirArea;
  const totalFieldRecovery = arealCoverage * rfOf(spacing, p) * 100;

  const totalCapex = (numberOfWells * p.wellCost) / 1e6;

  const producedPerWell = run.producedPerWell;
  const totalProduction = numberOfWells * producedPerWell;
  const totalOpexAllWells = run.field.wellYearsOn(0, actualLife) * p.opex;
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
    npv: metrics.npv,                          // $MM, field
    // undiscounted field totals from the same run, $MM
    economics: {
      totalRevenue: metrics.totalRevenue,
      totalRoyalty: metrics.totalRoyalty,
      totalOpex: metrics.totalOpex,
      totalCapex: metrics.totalCapex,
      totalTax: metrics.totalTax,
      totalGovProfit: metrics.totalGovTake - metrics.totalRoyalty - metrics.totalTax,
    },
    costPerBarrel,
    economicLife: actualLife,
    truncatedByDuration: economicLife > p.projectDuration - lastStart,
    initialRateBpd: qiAnnual / DAYS_PER_YEAR,
    wholeYears: Math.floor(actualLife),
    // the undiscounted net cash flow and payback of the same canonical run
    // WS-U2-010: revenue less the government take (royalty, tax and any government profit oil) and the costs
    netCashUndiscounted: metrics.totalRevenue - metrics.totalGovTake - metrics.totalOpex - metrics.totalCapex,
    payback: metrics.payback,
    paybackStatus: metrics.paybackStatus,
    // WS-U2-003: the wells by the year they come on stream
    schedule: run.field.cohorts.map((c) => ({ year: c.startYear + 1, wells: c.wells, producingYears: c.life })),
    drillingYears: run.field.cohorts.length,
    wellsAfterDuration: run.field.cohorts.filter((c) => c.startYear >= p.projectDuration).reduce((sum, c) => sum + c.wells, 0),
    // WS-U2-001: the rate limit, both sides of the switch (canonical NPVs)
    rateLimit: {
      on: rl.on,
      computed: rl.computed,
      binding: limitedRun.prof.rateLimit.binding,
      belowLimit: limitedRun.prof.rateLimit.belowLimit,
      plateauYears: limitedRun.prof.rateLimit.plateauYears,
      producedRateStbd: rl.on ? rl.startRateStbd : qiAnnual / DAYS_PER_YEAR,
      limitedStartRateStbd: limitedRun.prof.rateLimit.startRateStbd,
      npvLimited: limitedRun.metrics.npv,
      npvUnlimited: unlimitedRun.metrics.npv,
      producedLimited: limitedRun.producedPerWell / 1000,
      producedUnlimited: unlimitedRun.producedPerWell / 1000,
      lifeLimited: limitedRun.field.endYears,
      lifeUnlimited: unlimitedRun.field.endYears,
    },
    // WS-U2-006: measurable interference at the neighbour; diagnostics only
    interference: interferenceAtNeighbour(row0Distance(spacing, p), rl.on ? rl.startRateStbd : qiAnnual / DAYS_PER_YEAR, p),
    // WS-U1: geometry, timing and deliverability; diagnostics only
    drainage: drainageCase({
      spacingAcres: spacing,
      layout: p.layout,
      planRateStbd: qiAnnual / DAYS_PER_YEAR,
      rock: {
        kMd: p.permeability, phi: p.porosity, muCp: p.oilViscosity, ctPerPsi: p.totalCompressibility,
        hFt: p.avgNetPay, pAvgPsia: p.reservoirPressure, pwfPsia: p.flowingPressure, bo: p.bo, rwFt: p.wellboreRadius, skin: p.skin,
      },
    }),
  };
};

/**
 * WS-U1 incremental economics: each case against the next wider spacing in
 * the table (fewer wells). The NPVs are the canonical ones; this only takes
 * differences. null on the widest case, and where the well count is equal.
 */
export function incrementalRows(rows) {
  const bySpacing = [...rows].sort((a, b) => a.spacing - b.spacing);
  return bySpacing.map((r, i) => {
    const wider = bySpacing[i + 1];
    if (!wider) return { spacing: r.spacing, against: null };
    const dWells = r.numberOfWells - wider.numberOfWells;
    const dNpv = r.npv - wider.npv;
    const dProduced = (r.numberOfWells * r.producedPerWell) - (wider.numberOfWells * wider.producedPerWell); // Mbbl
    return {
      spacing: r.spacing,
      against: wider.spacing,
      addedWells: dWells,
      addedNpv: dNpv,
      addedNpvPerWell: dWells > 0 ? dNpv / dWells : null,
      addedProducedMbbl: dProduced,
      addedCapex: r.totalCapex - wider.totalCapex,
    };
  });
}

/** The sweep, synchronously (closed form, milliseconds): the page recomputes on every edit. */
/** The parsed inputs every case runs on (oilfield, fractions), Bo resolved. */
export const spacingParameters = (formData) => {
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
    // WS-U1: optional; NaN when blank
    boGiven: parseFloat(formData.oilFvf),
    layout: layoutOf(formData.wellLayout || formData.wellPatternType || DEFAULT_LAYOUT).key,
    reservoirPressure: parseFloat(formData.reservoirPressure),
    flowingPressure: parseFloat(formData.flowingPressure),
    permeability: parseFloat(formData.permeability),
    skin: parseFloat(formData.skin),
    oilViscosity: parseFloat(formData.oilViscosity),
    totalCompressibility: parseFloat(formData.totalCompressibility),
    wellboreRadius: parseFloat(formData.wellboreRadius),
    // WS-U2-006: optional; NaN when blank
    interferenceDays: parseFloat(formData.interferenceDays),
    gaugeResolutionPsi: parseFloat(formData.gaugeResolutionPsi),
    // WS-U2-001: on unless switched off (the owner default of 2026-10-05)
    rateLimit: formData.rateLimit !== 'off',
    // WS-U2-002: the user's recovery against spacing fit, or null (the stated RF)
    rfFit: formData.recoveryModel === 'calibrated' ? (() => { const f = fitRfAgainstSpacing(rfPointsOf(formData)); return f.ok ? f : null; })() : null,
    // WS-U2-010: royalty only (the default, as every earlier release), royalty and income tax, or a PSC
    fiscal: ['taxRoyalty', 'psc'].includes(formData.fiscalTerms) ? formData.fiscalTerms : 'royalty',
    taxRatePct: Number.isFinite(parseFloat(formData.incomeTaxRate)) ? parseFloat(formData.incomeTaxRate) : 0,
    depreciationYears: parseFloat(formData.depreciationYears),
    lossCarryForward: formData.lossCarryForward === 'yes',
    costRecoveryCapPct: parseFloat(formData.costRecoveryCap),
    contractorSharePct: parseFloat(formData.contractorProfitShare),
    // WS-U2-003: all wells in year 1 unless a schedule is chosen (the owner default)
    schedule: SCHEDULES.includes(formData.drillingSchedule) ? formData.drillingSchedule : 'year1',
    wellsPerYear: parseFloat(formData.wellsPerYear),
    rigCount: parseFloat(formData.rigCount),
    wellsPerRigYear: parseFloat(formData.wellsPerRigYear),
  };
  const { bo, source: boSource } = standingBo(p);
  p.bo = bo;
  p.boSource = boSource;
  return p;
};

/** The NPV of one case alone (US$ MM), the canonical run the case table uses; 0 when no whole well fits. */
export const spacingNpv = (spacing, p) => (Math.floor(p.reservoirArea / spacing) < 1
  ? 0
  : calculateEconomics(spacingEconomicsInputs(spacing, p), { skipIrr: true }).metrics.npv);

export const runSpacingCases = (formData) => {
  const p = spacingParameters(formData);
  const boSource = p.boSource;

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
  const incremental = incrementalRows(spacingResults);
  return {
    spacingResults,
    incremental,
    boUsed: p.bo,
    boSource,
    // the parsed inputs every case was run on, and how the NPV was computed
    parameters: p,
    npvConvention: { engine: 'calculateEconomics', discounting: 'mid-year', note: NPV_CONVENTION_NOTE },
  };
};

/** The sweep as a promise, for the callers of earlier builds. */
export const evaluateSpacingCases = async (formData) => runSpacingCases(formData);

/**
 * The case table as CSV, in the display units of the project (WS-U1, PL3):
 * `u` is the units helper of wellspacing/units.js; without one, oilfield.
 * Money is US$ million in both systems.
 */
export const generateCSV = (results, u = null) => {
  const sys = u?.system === 'si' ? 'si' : 'oilfield';
  const conv = (kind, v) => (u ? u.show(kind, v) : v);
  const lab = (kind, oil) => (u ? u.label(kind) : oil);
  const header = [
    `Well Spacing (${lab('spacing', 'acres/well')})`, 'Number of Wells', `Distance Between Wells (${lab('length', 'ft')})`, 'Areal Coverage (%)',
    `EUR per Well (${lab('eur', 'Mbbl')})`, `Produced per Well (${lab('eur', 'Mbbl')})`, 'Total Field Recovery (%)',
    'Total Capex ($MM)', 'NPV ($MM; mid-year discounting)', 'Cost per Barrel ($/bbl)', 'Economic Life (years)', `Initial Rate (${lab('rate', 'STB/d')})`,
  ];
  const fx = (v, d) => (Number.isFinite(v) ? Number(v).toFixed(d) : '');
  const rows = results.spacingResults.map((r) => [
    sys === 'si' ? fx(conv('spacing', r.spacing), 4) : r.spacing,
    r.numberOfWells,
    fx(conv('length', r.drainage?.distanceFt), 1),
    (r.arealCoverage * 100).toFixed(1),
    fx(conv('eur', r.eurPerWell), 1),
    fx(conv('eur', r.producedPerWell), 1),
    r.totalFieldRecovery.toFixed(1),
    r.totalCapex.toFixed(1),
    r.npv.toFixed(1),
    Number.isFinite(r.costPerBarrel) ? r.costPerBarrel.toFixed(2) : '',
    r.economicLife.toFixed(1),
    fx(conv('rate', r.initialRateBpd), 1),
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
    npv: { unit: '$MM', ...results.npvConvention },
    units: 'Oilfield: acres, ft, psia, degF, scf/STB, STB/d, Mbbl (EUR and produced per well), RB/STB, cp, 1/psi, md; money in US$ ($MM for capex and NPV)',
    declineBasis: 'typicalWellDeclineRate is an effective annual decline in percent; the engine converts it to nominal Dn = -ln(1 - De)',
    recoveryModel: 'stated recovery factor over the area covered by whole wells; no interference physics',
    rateLimit: formData.rateLimit === 'off'
      ? 'off: the unlimited decline (each case carries rateLimit.npvLimited for comparison)'
      : 'on: each well capped at its deliverable (pseudosteady) rate, the same EUR later (each case carries rateLimit.npvUnlimited for comparison)',
    version: 'WellSpacingOptimizer v4 (WS-U2)',
  },
});

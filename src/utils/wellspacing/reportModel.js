/**
 * The model of the Well Spacing report (WS-U1; reviewer lens RL1 to RL12).
 * One object for the Report tab and the PDF: identification, the cases with
 * their basis, the economics of each case split into its parts, the
 * incremental economics, every input with its unit and source, the drainage
 * diagnostics, the cross-checks, the methods and their references, the
 * limits and the flags, and the figure list. Built from the engine's own
 * results (evaluateSpacingCases); nothing here computes a case.
 *
 * Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { sourceText, NOT_PROVIDED, assumedDefaultText } from '@/lib/inputProvenance/wording';
import { SERIES_RGB } from '@/lib/reportKit/theme';
import { NO_OPTIMUM_NOTE, NPV_CONVENTION_NOTE } from '../wellSpacingCalculations.js';
import { LAYOUTS, layoutOf } from './drainage.js';
import { FIELDS, SAMPLE_FORM } from './model.js';
import { wsUnits } from './units.js';
import { intakeSourceText } from './intakes.js';
import { crossChecks } from './crossChecks.js';
import { MC_VARIABLES } from './monteCarlo.js';
import { rfPointsOf, fitRfAgainstSpacing, rfAtSpacing, rfFitText, RF_POINT_KINDS } from './rfCalibration.js';
import { spacingSensitivities, tornadoCaseOf, SENSITIVITY_RANGE_PCT } from './sensitivity.js';

export const REPORT_TITLE = 'Well Spacing Report';
export const APP_NAME = 'Petrolord Well Spacing Optimizer';
export const ANALYSIS_TYPE = 'Spacing economics at a stated recovery factor, with drainage geometry, timing and deliverability diagnostics (screening)';
export const MODEL_TEXT = 'Each well drains its spacing area at the stated recovery factor (no interference, no incremental recovery from infill); one exponential decline per well anchored on that EUR';
/** WS-U2-002: the recovery model in words, from the form. */
export function modelText(form = {}) {
  if (form.recoveryModel !== 'calibrated') return MODEL_TEXT;
  const fit = fitRfAgainstSpacing(rfPointsOf(form));
  return `Each well drains its spacing area at the recovery factor of the user's calibration against spacing (${fit.ok ? rfFitText(fit) : 'not fitted'}), no other interference; one exponential decline per well anchored on that EUR`;
}

/** WS-U2-010: the fiscal terms in words, from the form. */
export function fiscalText(form = {}) {
  const n = (v) => Number(Number(v).toPrecision(6));
  if (form.fiscalTerms === 'taxRoyalty') return `royalty ${n(form.royaltiesTaxes)} percent of gross revenue and income tax ${n(form.incomeTaxRate)} percent of revenue after royalty, opex and depreciation (capex straight line over ${Number(form.depreciationYears) >= 1 ? n(form.depreciationYears) : 1} year${Number(form.depreciationYears) > 1 ? 's' : ''}; losses ${form.lossCarryForward === 'yes' ? 'carried forward without limit' : 'not carried forward'})`;
  if (form.fiscalTerms === 'psc') return `production sharing: royalty ${n(form.royaltiesTaxes)} percent, cost recovery up to ${n(form.costRecoveryCap)} percent of net revenue with unrecovered cost carried forward, contractor ${n(form.contractorProfitShare)} percent of profit oil, income tax ${n(form.incomeTaxRate)} percent on the contractor's profit oil`;
  return `royalty ${n(form.royaltiesTaxes)} percent of gross revenue, no income tax`;
}

/** WS-U2-003: the drilling schedule in words, from the form. */
export function scheduleText(form = {}) {
  const s = form.drillingSchedule || 'year1';
  const n = (v) => Number(Number(v).toPrecision(6));
  if (s === 'wellsPerYear') return `${n(form.wellsPerYear)} wells a year on stream from the start of each year, the last year taking the rest`;
  if (s === 'rigs') return `${n(form.rigCount)} rigs at ${n(form.wellsPerRigYear)} wells a rig a year (${Math.floor(Number(form.rigCount) * Number(form.wellsPerRigYear) + 1e-9)} wells a year), on stream from the start of each year`;
  return 'all wells on stream in year 1';
}
/** WS-U2-001: the model sentence of the rate limit, by its switch. */
export const rateLimitModelText = (on) => (on
  ? 'Rate limit on: each well capped at its deliverable rate (the same EUR, later)'
  : 'Rate limit off: the unlimited decline, for comparison');

export const IDENTIFICATION = Object.freeze([
  ['company', 'Company'], ['field', 'Field'], ['licence', 'Licence or block'], ['reservoir', 'Reservoir or zone'],
  ['wells', 'Well or wells'], ['dataDate', 'Data as of'], ['analyst', 'Analyst'],
]);

export const SAMPLE_SOURCE = 'Assumed: the built-in sample value of the app (illustrative, no field data behind it)';

const text = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const num = (v) => { const s = text(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The Source column of one input (RL1): intake, then the app's own knowledge, then sample, then the user's statement. */
export function inputSource(inputs, key, results) {
  const value = inputs.form?.[key];
  const intake = intakeSourceText(inputs.intakes, key, value);
  if (intake) return sourceText(inputs.inputMeta?.[key], intake);
  if (key === 'recoveryModel') {
    if (inputs.inputMeta?.[key]?.source) return sourceText(inputs.inputMeta[key]);
    return value === 'calibrated' ? 'Chosen by the user: calibrated on the points below, each with its source' : assumedDefaultText('the stated RF at every spacing');
  }
  if (key === 'rfPoints') {
    const n = rfPointsOf(inputs.form).length;
    return n ? `Typed by the user, each point with its own source (the Recovery against spacing table)${inputs.form?.recoveryModel === 'calibrated' ? '' : '; not used while the stated RF is chosen'}` : NOT_PROVIDED;
  }
  if (key === 'rateLimit') {
    if (inputs.inputMeta?.[key]?.source) return sourceText(inputs.inputMeta[key]);
    return value === 'off' ? 'Chosen by the user (the unlimited decline, for comparison)' : assumedDefaultText('on (the owner default of 2026-10-05)');
  }
  if (key === 'wellLayout') {
    if (inputs.inputMeta?.[key]?.source) return sourceText(inputs.inputMeta[key]);
    return text(value) && value !== 'square' ? 'Chosen by the user' : assumedDefaultText('square grid');
  }
  if (key === 'oilFvf' && !text(value)) {
    if (results?.boSource === 'standing') return `Computed: Standing (1947) correlation from the GOR, oil gravity, gas gravity and temperature above, ${results.boUsed.toFixed(4)} RB/STB`;
    if (results?.boSource === 'fallback') return 'Fallback 1.000: Standing\'s correlation could not be computed (a fluid input is blank). Volumes are too high by the true Bo';
  }
  if (!text(value)) return NOT_PROVIDED;
  if (inputs.sampleNote && String(SAMPLE_FORM[key] ?? '') === String(value) && !inputs.inputMeta?.[key]?.source) return SAMPLE_SOURCE;
  return sourceText(inputs.inputMeta?.[key]);
}

const READS_WORDS = { economics: 'case', rate: 'case, through the rate limit', diagnostics: 'diagnostics', uncertainty: 'uncertainty', record: 'record' };

function inputRows(inputs, u, results) {
  const rows = FIELDS.map((d) => {
    const raw = inputs.form?.[d.key];
    let value;
    if (d.key === 'wellLayout') value = layoutOf(raw).label;
    else if (d.key === 'rfPoints') { const n = fitRfAgainstSpacing(rfPointsOf(inputs.form)); value = rfPointsOf(inputs.form).length ? `${rfPointsOf(inputs.form).length} points${n.ok ? `; ${rfFitText(n)}` : ''}` : ''; }
    else if (d.select) value = (d.options.find(([v]) => v === raw) || d.options[0])[1];
    else if (d.key === 'oilFvf' && !text(raw) && finite(results?.boUsed)) value = u.fmt('fvf', results.boUsed, 5);
    // a seed or a count prints whole (6 significant figures would round a seed)
    else if (d.kind === 'count') value = num(raw) == null ? '' : String(Math.round(num(raw)));
    else value = num(raw) == null ? '' : (d.kind && ['wellCost', 'opex'].includes(d.kind) ? Number(raw).toLocaleString('en-US') : u.fmt(d.kind, num(raw), 6));
    return {
      key: d.key,
      label: `${d.label} [${READS_WORDS[d.reads]}]`,
      value: value || EMPTY_VALUE,
      unit: d.kind ? u.label(d.kind) : '',
      source: inputSource(inputs, d.key, results),
      engineKeys: [d.key],
    };
  });
  const lat = text(inputs.form?.latitude);
  const lon = text(inputs.form?.longitude);
  rows.unshift({ key: 'fieldName', label: 'Field name [record]', value: text(inputs.form?.fieldName) || EMPTY_VALUE, unit: '', source: inputs.form?.fieldName ? 'Entered' : NOT_PROVIDED, engineKeys: ['fieldName'] });
  rows.push({ key: 'location', label: 'Field location, WGS84 latitude and longitude [record]', value: lat && lon ? `${lat}, ${lon}` : EMPTY_VALUE, unit: 'degrees', source: lat && lon ? 'Entered or picked on the map' : NOT_PROVIDED, engineKeys: ['latitude', 'longitude'] });
  const ctx = [
    ['ooipStb', 'OOIP of a Material Balance run [cross-check]', 'volume', (v) => v / 1e6],
    ['dcaEurStb', 'EUR of one well from Decline Curve Analysis [cross-check]', 'eur', (v) => v / 1e3],
  ];
  for (const [key, label, kind, scale] of ctx) {
    const v = num(inputs.context?.[key]);
    rows.push({ key, label, value: v == null ? EMPTY_VALUE : u.fmt(kind, scale(v), 6), unit: u.label(kind), source: intakeSourceText(inputs.intakes, key, inputs.context?.[key]) || NOT_PROVIDED, engineKeys: [] });
  }
  return rows;
}

function identificationPairs(inputs, { projectName, organizationName, build }) {
  const id = inputs.identification || {};
  const pairs = [['Project', text(projectName) || EMPTY_VALUE]];
  for (const [key, label] of IDENTIFICATION) {
    let v = text(id[key]);
    if (key === 'company' && !v) v = text(organizationName);
    if (key === 'field' && !v) v = text(inputs.form?.fieldName);
    pairs.push([label, v || EMPTY_VALUE]);
  }
  pairs.push(['Analysis type', ANALYSIS_TYPE]);
  pairs.push(['Model', `${modelText(inputs.form)}; ${scheduleText(inputs.form)}. ${rateLimitModelText(inputs.form?.rateLimit !== 'off')}`]);
  pairs.push(['Economics', 'Suite screening economics engine (calculateEconomics), mid-year discounting']);
  pairs.push(['Software build', text(build) || EMPTY_VALUE]);
  pairs.push(['Inputs', inputs.sampleNote ? 'Includes built-in sample values (illustrative)' : 'Entered or taken from other apps (sources below)']);
  return pairs;
}

const m1 = (v) => (finite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : EMPTY_VALUE);
const m2 = (v) => (finite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : EMPTY_VALUE);
const ratio = (v) => (finite(v) ? (v < 0.1 ? String(Number(v.toPrecision(2))) : v.toFixed(2)) : EMPTY_VALUE);
/** Payback as the canonical engine reports it, with its status in words (EC3-1). */
export function paybackText(r) {
  if (r.paybackStatus === 'no-investment') return 'within year 1';
  if (r.paybackStatus === 'not-recovered') return 'not recovered';
  if (!finite(r.payback)) return EMPTY_VALUE;
  return r.paybackStatus === 'recrossed' ? `${r.payback.toFixed(2)} (first crossing)` : r.payback.toFixed(2);
}
const days = (v) => (finite(v) ? (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')) : EMPTY_VALUE);

/**
 * @param {object} inputs the project inputs (WellSpacingContext)
 * @param {{results: ?object, projectName?: string, organizationName?: string, build?: string, system?: string}} o
 */
export function buildWellSpacingReportModel(inputs, { results = null, projectName = '', organizationName = '', build = '', system = null, mc = null } = {}) {
  const sys = system || inputs.unitSystem || 'oilfield';
  const u = wsUnits(sys);
  const rows = results?.spacingResults || [];
  const layout = layoutOf(inputs.form?.wellLayout);
  const sp = (s) => u.fmt('spacing', s, 6);

  const cases = {
    head: [u.head('Spacing', 'spacing'), 'Wells', u.head('Between wells', 'length'), u.head('EUR per well', 'eur'), u.head('Produced per well', 'eur'), 'Field recovery (%)', 'Capex (US$ MM)', 'NPV (US$ MM)', 'Cost (US$/STB)', u.head('Initial rate', 'rate'), 'Drilled over (years)'],
    rows: rows.map((r) => [
      sp(r.spacing), String(r.numberOfWells), u.fmt('length', r.drainage.distanceFt, 5), u.fixed('eur', r.eurPerWell, 1),
      `${u.fixed('eur', r.producedPerWell, 1)}${r.truncatedByDuration ? ' *' : ''}`, r.totalFieldRecovery.toFixed(1), m1(r.totalCapex), m1(r.npv),
      Number.isFinite(r.costPerBarrel) ? m2(r.costPerBarrel) : EMPTY_VALUE, u.fmt('rate', r.initialRateBpd, 4), String(r.drillingYears ?? 1),
    ]),
    note: `${NO_OPTIMUM_NOTE} ${NPV_CONVENTION_NOTE} Cost per barrel is capex plus opex over the oil produced, undiscounted, before royalty. * produced volume cut short by the project duration. Drilled over: the years in which wells come on stream (${scheduleText(inputs.form)}); produced per well is the field total over the wells. Initial rate: the rate on day one of the decline each well is given, rising with the spacing because the EUR does.`,
  };

  const economics = {
    head: [u.head('Spacing', 'spacing'), 'Revenue', 'Royalty', 'Income tax', 'Government profit oil', 'Opex', 'Capex', 'Net cash, undiscounted', 'NPV', 'Payback (years)'],
    rows: rows.map((r) => [
      sp(r.spacing), m1(r.economics.totalRevenue), m1(r.economics.totalRoyalty), m1(r.economics.totalTax ?? 0), m1(r.economics.totalGovProfit ?? 0), m1(r.economics.totalOpex), m1(r.economics.totalCapex),
      m1(r.netCashUndiscounted), m1(r.npv), paybackText(r),
    ]),
    note: `US$ million, field totals over the project duration. Revenue is oil at the oil price plus gas at the gas price, the gas being the oil times the initial solution GOR. Revenue less royalty, income tax, government profit oil, opex and capex is the undiscounted net cash; NPV is the same yearly stream discounted to the middle of each year. Fiscal terms: ${fiscalText(inputs.form)}, as the Suite screening engine computes them. Payback is counted in whole years of the yearly stream; "within year 1" means the first year\'s net cash already exceeds the capex spent in it.`,
  };

  const inc = (results?.incremental || []).filter((x) => x.against != null);
  const incremental = {
    head: [u.head('Spacing', 'spacing'), u.head('Against', 'spacing'), 'Added wells', 'Added capex (US$ MM)', u.head('Added oil produced', 'eur'), 'Added NPV (US$ MM)', 'Added NPV per added well (US$ MM)'],
    rows: inc.map((x) => [sp(x.spacing), sp(x.against), String(x.addedWells), m1(x.addedCapex), u.fixed('eur', x.addedProducedMbbl, 1), m1(x.addedNpv), x.addedNpvPerWell == null ? EMPTY_VALUE : m2(x.addedNpvPerWell)]),
    note: 'Each spacing against the next wider one in the table (fewer wells): what the extra wells add. The NPVs are those of the case table; this takes differences only. Under the stated model the extra wells add almost no oil (the differences of a few hundred Mbbl either way come from the undrained remainder of the area and the project duration cut), so without a rate limit the added NPV is mostly the added capex with its sign changed. Where the rate limit binds, the extra wells also bring the oil forward, which is worth money.',
  };

  // WS-U2-001: the rate limit, before and after (both sides are canonical runs)
  const rlOn = inputs.form?.rateLimit !== 'off';
  const rateLimit = {
    on: rlOn,
    head: [u.head('Spacing', 'spacing'), u.head('Plan initial rate', 'rate'), u.head('Deliverable rate', 'rate'), u.head('Rate produced', 'rate'), 'Plateau (years)', u.head('Produced per well, unlimited', 'eur'), u.head('Produced per well, limited', 'eur'), 'NPV unlimited (US$ MM)', 'NPV rate-limited (US$ MM)', 'Change (US$ MM)'],
    rows: rows.map((r) => {
      const L = r.rateLimit;
      if (!L.computed) return [sp(r.spacing), u.fmt('rate', r.initialRateBpd, 4), EMPTY_VALUE, u.fmt('rate', r.initialRateBpd, 4), EMPTY_VALUE, u.fixed('eur', r.producedPerWell, 1), EMPTY_VALUE, m1(r.npv), EMPTY_VALUE, EMPTY_VALUE];
      return [
        sp(r.spacing), u.fmt('rate', r.initialRateBpd, 4), u.fmt('rate', r.drainage.pssRateStbd, 4),
        u.fmt('rate', rlOn ? L.limitedStartRateStbd : r.initialRateBpd, 4),
        L.belowLimit ? 'never on' : (L.binding ? L.plateauYears.toFixed(2) : 'none'),
        u.fixed('eur', L.producedUnlimited, 1), u.fixed('eur', L.producedLimited, 1),
        m1(L.npvUnlimited), m1(L.npvLimited), m1(L.npvLimited - L.npvUnlimited),
      ];
    }),
    note: [
      rlOn
        ? 'The rate limit is ON: the case table, the economics and the NPV chart use the rate-limited column.'
        : 'The rate limit is OFF: the case table, the economics and the NPV chart use the unlimited column; the rate-limited column shows what the limit would change.',
      'Where the plan initial rate of the decline is above the deliverable rate, the well produces at the deliverable rate for the plateau, then declines at the stated decline from it; the EUR is unchanged and arrives later, so the NPV falls and the produced volume can be cut by the project duration. Both NPVs are canonical runs (calculateEconomics) on the two profiles.',
      rows.some((r) => !r.rateLimit.computed) ? `Not applied: ${rows[0]?.drainage?.deliverability || 'the deliverable rate is not computed'}` : '',
      rows.some((r) => r.rateLimit.belowLimit) ? '"never on": the deliverable rate is at or below the economic limit rate, so the well never produces at an economic rate and the case carries its capex for no oil.' : '',
    ].filter(Boolean).join(' '),
  };

  const d0 = rows[0]?.drainage;
  const drainage = {
    head: [u.head('Spacing', 'spacing'), u.head('Between wells', 'length'), u.head('Drainage radius re', 'length'), 'Interference begins (days)', 'Pseudosteady state (days)', u.head('Deliverable rate', 'rate'), u.head('Plan initial rate', 'rate'), 'Plan / deliverable'],
    rows: rows.map((r) => [
      sp(r.spacing), u.fmt('length', r.drainage.distanceFt, 5), u.fmt('length', r.drainage.drainageRadiusFt, 4), days(r.drainage.interferenceDays), days(r.drainage.pssDays),
      finite(r.drainage.pssRateStbd) ? u.fmt('rate', r.drainage.pssRateStbd, 4) : EMPTY_VALUE, u.fmt('rate', r.drainage.planRateStbd, 4),
      ratio(r.drainage.rateRatio),
    ]),
    note: [
      `Layout: ${layout.label}; shape factor CA ${layout.CA}, pseudosteady state exact from tDA ${layout.tdaExact} (Earlougher 1977, Table C.1).`,
      'Interference begins when each well\'s radius of investigation, sqrt(k t / (948 phi mu ct)), reaches half the distance to its neighbour (Lee 1982). Deliverable rate: the pseudosteady-state rate k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s)) on the drainage area at the stated pressures (Ahmed and McKinney 2005, Eq. 1.2.124).',
      rlOn ? 'Plan / deliverable above 1 means the unlimited decline would start at a rate the well cannot deliver at that spacing; with the rate limit on, the case is capped there (the rate limit table).' : 'Plan / deliverable above 1 means the decline the economics assume starts at a rate the well cannot deliver at that spacing: the EUR would take longer to produce and the NPV is too high (the rate limit is off).',
      d0?.timing || '',
      d0?.deliverability || '',
    ].filter(Boolean).join(' '),
  };

  // WS-U2-006: measurable interference at the neighbour (line source, the validated E1)
  const i0 = rows[0]?.interference;
  const interference = {
    head: [u.head('Spacing', 'spacing'), u.head('Between wells', 'length'), u.head('Rate of the active well', 'rate'), 'Time (days)', 'Ei argument x', u.head('Drop at the neighbour', 'pressureDiff'), u.head('Gauge resolution', 'pressureDiff'), 'Measurable'],
    rows: rows.filter((r) => r.interference?.computed).map((r) => {
      const I = r.interference;
      return [
        sp(r.spacing), u.fmt('length', I.rFt, 5), u.fmt('rate', I.qStbd, 4), String(Number(I.tDays.toPrecision(6))), String(Number(I.x.toPrecision(4))),
        u.fmt('pressureDiff', I.dropPsi, 3), I.resolutionPsi == null ? EMPTY_VALUE : u.fmt('pressureDiff', I.resolutionPsi, 3),
        I.measurable == null ? 'no resolution given' : (I.measurable ? 'yes' : 'no, below the gauge resolution'),
      ];
    }),
    note: [
      'One well of the case produces at its starting rate (the rate produced, with the rate limit as set) for the stated time while its neighbour is shut in as the observer. The drop there is the line source, dp = 70.6 q mu B / (k h) E1(x), x = 948 phi mu ct r^2 / (k t), t in hours, r the distance between wells (Ahmed and McKinney 2005, Eq. 1.2.134; E1 as gated on Abramowitz and Stegun Table 5.1). Infinite acting: the other wells are shut in and no boundary is felt in the time. Measurable means the drop is at least the gauge resolution.',
      i0 && !i0.computed ? i0.text : '',
    ].filter(Boolean).join(' '),
  };

  // WS-U2-008: uncertainty through the canonical sampler and calculateEconomics
  const mcGiven = MC_VARIABLES.some((v) => text(inputs.form?.[v.low]) || text(inputs.form?.[v.high]));
  const uncertainty = {
    given: mcGiven,
    ok: !!mc?.ok,
    head: [u.head('Spacing', 'spacing'), 'Base NPV (US$ MM)', 'P90 NPV, low (US$ MM)', 'P50 NPV (US$ MM)', 'P10 NPV, high (US$ MM)', 'Mean (US$ MM)', 'Probability NPV < 0 (%)'],
    rows: mc?.ok ? mc.cases.map((c) => [sp(c.spacing), m1(c.base), m1(c.p90), m1(c.p50), m1(c.p10), m1(c.mean), (c.probLoss * 100).toFixed(1)]) : [],
    note: mc?.ok
      ? `${mc.iterations} realisations, seed ${mc.seed}, drawn by the Suite's canonical Monte Carlo sampler (src/lib/monteCarlo.js, mulberry32); every realisation is a full case run whose NPV is calculateEconomics, the same draws for every spacing. Triangular: ${MC_VARIABLES.filter((v) => mc.distributions[v.key]?.type === 'triangular').map((v) => `${v.label.toLowerCase()} ${mc.distributions[v.key].min} / ${mc.distributions[v.key].mode} / ${mc.distributions[v.key].max} ${v.unit}`).join('; ')} (low / most likely / high); the others held at their values; inputs independent. ${mc.convention}`
      : (mc && !mc.ok ? `Not run: ${mc.errors.join(' ')}` : (mcGiven ? 'Not run yet: run the uncertainty on the Study tab (the PDF export runs it).' : 'Not run: no low and high is given for the recovery factor, the area or the oil price.')),
  };

  // WS-U2-002: recovery against spacing, the user's points and the fit
  const calOn = inputs.form?.recoveryModel === 'calibrated';
  const fit = fitRfAgainstSpacing(rfPointsOf(inputs.form));
  const kindLabel = (k) => (RF_POINT_KINDS.find(([v]) => v === k) || RF_POINT_KINDS[3])[1];
  const calibration = {
    on: calOn,
    fitText: fit.ok ? rfFitText(fit) : null,
    pointsHead: [u.head('Spacing', 'spacing'), 'RF (%)', 'Kind', 'Source'],
    pointsRows: fit.ok ? fit.points.map((pt) => [sp(pt.spacing), String(pt.rf), kindLabel(pt.kind), pt.source]) : [],
    casesHead: [u.head('Spacing', 'spacing'), 'RF of the case (%)', 'Inside the points'],
    casesRows: calOn && fit.ok ? rows.map((r) => [sp(r.spacing), rfAtSpacing(fit, r.spacing).toFixed(2), r.spacing >= fit.sMin - 1e-9 && r.spacing <= fit.sMax + 1e-9 ? 'yes' : 'no, extrapolated']) : [],
    note: calOn
      ? (fit.ok ? `${rfFitText(fit)}. Each case's recovery factor is the fit at its spacing; the app has no built-in curve, so the relation is only as good as the points and their sources.` : `Not fitted: ${fit.errors.join(' ')}`)
      : 'Not used: every case takes the stated recovery factor (the model of earlier releases).',
  };

  // WS-U2-007: the canonical sensitivity sweep on each case's own economics inputs
  const sens = spacingSensitivities(results);
  const SENS_ORDER = ['Oil price', 'Capex', 'Opex', 'Oil volume'];
  const tornado = tornadoCaseOf(results, inputs.sender?.spacing);
  const sensitivity = {
    head: [u.head('Spacing', 'spacing'), 'Base NPV (US$ MM)', ...SENS_ORDER.flatMap((n) => [`${n} -${SENSITIVITY_RANGE_PCT}% (US$ MM)`, `${n} +${SENSITIVITY_RANGE_PCT}% (US$ MM)`])],
    rows: sens.map((c) => [sp(c.spacing), m1(c.base), ...SENS_ORDER.flatMap((n) => { const b = c.bars.find((x) => x.name === n); return [m1(b?.low), m1(b?.high)]; })]),
    note: `Each case's NPV with one input ${SENSITIVITY_RANGE_PCT} percent down and up, the others held: the Suite screening engine's own sweep (runSensitivityAnalysis) on the arrays the case table ran on, each point a calculateEconomics run. Oil volume scales the oil (the solution gas is held); opex is the fixed opex. The tornado figure draws ${tornado ? `${sp(tornado.spacing)} ${u.label('spacing')}, ${tornado.why}` : 'no case'}.`,
    tornado: tornado ? { ...tornado, sens: sens.find((c) => c.spacing === tornado.spacing) } : null,
  };

  const cc = crossChecks(inputs, results);
  const crossRows = [];
  crossRows.push(['In place: volumetric OOIP of this case', finite(cc.inPlace.volumetricStb) ? `${u.fmt('volume', cc.inPlace.volumetricStb / 1e6, 5)} ${u.label('volume')}` : EMPTY_VALUE,
    finite(cc.inPlace.ratio) ? `Material Balance OOIP ${u.fmt('volume', cc.inPlace.mbalStb / 1e6, 5)} ${u.label('volume')}; volumetric / Material Balance ${cc.inPlace.ratio.toFixed(2)}` : cc.inPlace.text]);
  crossRows.push(['Drainage area implied by a decline EUR', finite(cc.eurArea.impliedAcres) ? `${u.fmt('spacing', cc.eurArea.impliedAcres, 4)} ${u.label('spacing')}` : EMPTY_VALUE,
    finite(cc.eurArea.impliedAcres) ? `EUR ${u.fmt('eur', cc.eurArea.eurStb / 1e3, 5)} ${u.label('eur')} of ${cc.eurArea.well || 'the well'} at the stated h, porosity, Swi, Bo and RF: A = EUR Bo / (7,758 h phi (1 - Swi) RF). ${cc.eurArea.inRange ? 'Inside' : 'Outside'} the spacing range studied.` : cc.eurArea.text]);
  crossRows.push(['Spacing the registry wells already have', finite(cc.wells.impliedAcres) ? `${u.fmt('spacing', cc.wells.impliedAcres, 4)} ${u.label('spacing')}` : EMPTY_VALUE,
    finite(cc.wells.impliedAcres) ? `${cc.wells.count} wells; nearest neighbour ${u.fmt('length', cc.wells.minFt, 4)} to ${u.fmt('length', cc.wells.maxFt, 4)} ${u.label('length')}, mean ${u.fmt('length', cc.wells.meanFt, 4)} ${u.label('length')}; the area per well on the ${cc.wells.layout === 'triangular' ? 'staggered' : 'square'} layout at the mean distance.` : cc.wells.text]);
  const cross = { head: ['Check', 'Value', 'Against'], rows: crossRows, note: 'Independent numbers held against the stated case. None of them changes a number of the case.' };

  const methods = {
    head: ['Quantity', 'Method', 'Reference'],
    rows: [
      ['Oil in place per well', 'N = 7,758 A h phi (1 - Swi) / Bo, STB; A the spacing in acres', 'Volumetric equation (Craft and Hawkins 1959)'],
      ['Bo', results?.boSource === 'given' ? 'As given on the form; its source is in the inputs table' : 'Standing: Bo = 0.9759 + 0.00012 (Rs sqrt(gg / go) + 1.25 T)^1.2', results?.boSource === 'given' ? 'Inputs table' : 'Standing (1947); McCain (1990)'],
      ['EUR per well', 'N times the stated recovery factor', 'Stated model (no interference)'],
      ['Production per well', 'Exponential decline, Dn = -ln(1 - De); qi = EUR Dn + q limit; life = ln(qi / q limit) / Dn; yearly volumes integrated exactly; a year is 365.25 days', 'Arps (1945)'],
      ['Rate limit', 'Where qi > qd (deliverable): plateau at qd for tp = (qi - qd) / (Dn qd), then qd exp(-Dn (t - tp)) to the limit; the volume to the limit stays the EUR', 'Plateau then exponential decline; qd from Ahmed and McKinney (2005) Eq. 1.2.124'],
      ['NPV, revenue, royalty, opex, capex, payback', `calculateEconomics, mid-year discounting; ${fiscalText(inputs.form)}; ${scheduleText(inputs.form)}, each well's capex in its year and its opex while on stream`, 'Suite screening economics engine (docs/scope/ReservoirEngineering-Module.md section 5)'],
      ['Field profile', 'The per-well profile shifted to each year\'s wells and cut at the end of the project duration; every yearly volume is a difference of the exact field cumulative', 'Superposition of identical wells in time'],
      ['Distance between wells', 'Square: d = sqrt(A); staggered: d = sqrt(2 A / sqrt 3)', 'Geometry; 40 acres square is 1,320 ft'],
      ['Drainage radius', 're = sqrt(43,560 A / pi), ft', 'Ahmed and McKinney (2005), Ex. 1.5: 40 acres, 745 ft'],
      ['Interference and pseudosteady timing', 'ri = sqrt(k t / (948 phi mu ct)), t in hours; tDA = 0.0002637 k t / (phi mu ct A)', 'Lee (1982); Earlougher (1977) Table C.1'],
      ['Deliverable rate', 'q = k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s))', 'Ahmed and McKinney (2005), Eq. 1.2.124, Ex. 1.18'],
      ['Uncertainty (P90, P50, P10 NPV)', 'Triangular draws of RF, area and oil price by the canonical sampler (seeded mulberry32); each realisation a full case run through calculateEconomics; P90 the 10th percentile (the low case)', 'src/lib/monteCarlo.js (ReservoirCalc Pro MonteCarloEngine lineage, docs/scope/ReservoirEngineering-Module.md section 5); SPE PRMS exceedance convention'],
      ['Interference at the neighbour', 'dp = 70.6 q mu B / (k h) E1(948 phi mu ct r^2 / (k t)), t in hours, r the distance between wells', 'Ahmed and McKinney (2005), Eq. 1.2.134, Ex. 1.21; Abramowitz and Stegun Table 5.1'],
    ],
  };

  const flags = [];
  if (inputs.sampleNote) flags.push(inputs.sampleNote);
  if (results?.boSource === 'fallback') flags.push('Bo fell back to 1.000: a fluid input of Standing\'s correlation is blank. Every volume and dollar figure is in reservoir barrels priced as stock-tank barrels.');
  const over = rows.filter((r) => finite(r.drainage.rateRatio) && r.drainage.rateRatio > 1);
  if (over.length) {
    flags.push(rlOn
      ? `At ${over.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the plan's initial rate is above the pseudosteady rate a well can deliver; the rate limit caps those cases (a plateau of up to ${Math.max(...over.map((r) => r.rateLimit.plateauYears)).toFixed(1)} years).`
      : `At ${over.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the plan's initial rate is above the pseudosteady rate a well can deliver; the rate limit is off, so the economics of those cases assume a rate the reservoir does not give.`);
  }
  const late2 = rows.filter((r) => r.wellsAfterDuration > 0);
  if (late2.length) flags.push(`At ${late2.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the drilling schedule brings wells on stream after the project duration ends (${late2.map((r) => r.wellsAfterDuration).join(', ')} wells): they carry their capex and produce nothing inside it.`);
  if (calOn && fit.ok) {
    const out = rows.filter((r) => r.spacing < fit.sMin - 1e-9 || r.spacing > fit.sMax + 1e-9);
    if (out.length) flags.push(`At ${out.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the recovery factor is extrapolated beyond the calibration points (${sp(fit.sMin)} to ${sp(fit.sMax)} ${u.label('spacing')}).`);
  }
  const quiet = rows.filter((r) => r.interference?.measurable === false);
  if (quiet.length) flags.push(`At ${quiet.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the drop at the neighbour after ${rows[0].interference.tDays} days is below the gauge resolution: an interference test of that length would not see the neighbour.`);
  const never = rows.filter((r) => r.rateLimit?.belowLimit);
  if (never.length) flags.push(`At ${never.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the deliverable rate is at or below the economic limit rate: the wells never produce at an economic rate.`);
  const late = rows.filter((r) => finite(r.drainage.pssDays) && r.drainage.pssDays > 365);
  if (late.length) flags.push(`At ${late.map((r) => sp(r.spacing)).join(', ')} ${u.label('spacing')} the well needs more than a year to feel its drainage boundary; a closed-area volumetric EUR is optimistic over the first years.`);
  for (const it of Object.values(inputs.intakes || {})) {
    if (!it?.fields) continue;
    for (const k of it.fields) {
      const def = FIELDS.find((d) => d.key === k);
      const now = def ? inputs.form?.[k] : inputs.context?.[k];
      if (now != null && String(now) !== '' && Number(now) !== Number(it.values?.[k])) flags.push(`${def ? def.label : k} was edited after it was taken from ${it.from?.app} (received ${it.values[k]}).`);
    }
  }
  if (finite(cc.inPlace.ratio) && (cc.inPlace.ratio > 1.25 || cc.inPlace.ratio < 0.8)) flags.push(`The volumetric OOIP is ${cc.inPlace.ratio.toFixed(2)} times the Material Balance OOIP: the stated area, pay, porosity, Swi or Bo do not describe the same oil.`);
  if (cc.eurArea.inRange === false) flags.push('The drainage area a decline EUR implies falls outside the spacing range studied.');
  const swi = num(inputs.form?.initialWaterSaturation);
  if (swi != null && swi > 0.7) flags.push(`Initial water saturation ${swi} is high for an oil reservoir; check that it is a fraction.`);

  const limits = {
    assumptions: [
      'A screening study of spacing economics. Every well recovers the stated recovery factor of the oil under its own spacing area, whatever the spacing: the model has no interference, no acceleration-only infill and no incremental recovery from tighter spacing. Field oil is therefore nearly the same at every spacing; without a rate limit NPV rises as wells are removed, and with it the wide cases are held back by what each well can deliver. Recovery that responds to spacing is a simulation or analog question.',
      'One exponential decline per well, the stated effective annual decline at every spacing, anchored so the volume to the economic limit is the EUR. A wider spacing therefore gets a proportionally higher initial rate. With the rate limit on, a well whose decline would start above its deliverable rate produces at the deliverable rate first; the deliverable rate is held at the stated average pressure for the whole plateau (no depletion of the pressure inside it), so a long plateau is optimistic.',
      `Drilling: ${scheduleText(inputs.form)}. A well comes on stream at the start of the year its cost is spent, every well has the same profile whenever it starts (no depletion by the wells before it), and there is no ramp-up, facility limit or downtime. Gas is sold at the initial solution GOR throughout (no free gas, no GOR rise below the bubble point).`,
      `Fiscal terms: ${fiscalText(inputs.form)}, the Suite screening engine's own (no bonus, no ring fence). NPV discounts each year at its middle; the Petroleum Economics Studio discounts year-end, so the two do not match for the same case.`,
      'Drainage diagnostics assume a homogeneous, isotropic layer of the stated permeability, single-phase oil, a vertical well at the centre of its drainage area and pseudosteady state at the stated average pressure. They change no EUR and no NPV.',
      'Bo is Standing\'s correlation at the bubble point unless a Bo is given; above the bubble point it slightly overstates Bo. The pressure entered is printed as stated, absolute, with no datum correction.',
    ],
    flags,
    noFlagsText: 'No input is flagged.',
  };

  if (calOn) limits.assumptions[0] = 'A screening study of spacing economics. Every well recovers the recovery factor the user\'s calibration gives at its spacing (a least-squares fit of RF against ln S on the user\'s cited points, printed with them); outside the points it is extrapolated and flagged. Beyond that fit the model has no interference and no acceleration-only infill.';
  const figures = buildFigures(rows, inputs, u, results);
  // WS-U2-007: the tornado of one case, bars from the base NPV
  const T = sensitivity.tornado;
  if (T?.sens) {
    const bars = T.sens.bars;
    figures.push({
      id: 'tornado',
      title: `Sensitivity of the NPV at ${sp(T.spacing)} ${u.label('spacing')}`,
      caption: `Change in NPV from the base (${m1(T.sens.base)} US$ MM) with one input ${SENSITIVITY_RANGE_PCT} percent down and up, largest swing first: ${bars.map((b, i) => `${i + 1} ${b.name.toLowerCase()}`).join(', ')}. The case is ${T.why}; the canonical sweep of the screening engine.`,
      panels: [{
        height: 60,
        spec: {
          xTitle: 'Input (numbered as in the caption)', yTitle: 'Change in NPV, US$ MM', barWidth: 0.6, xInclude: [0.4, bars.length + 0.6],
          series: [
            { name: 'Input 30 percent down', type: 'bar', pts: bars.map((b, i) => [i + 1, b.low - T.sens.base]), rgb: SERIES_RGB.red },
            { name: 'Input 30 percent up', type: 'bar', pts: bars.map((b, i) => [i + 1, b.high - T.sens.base]), rgb: SERIES_RGB.emerald },
          ],
        },
      }],
    });
  } else if (!rows.length) {
    figures.push({ id: 'tornado', title: 'Sensitivity of the NPV of one case', statement: 'Does not apply: no spacing case has been computed.' });
  }
  const who = [text(inputs.identification?.field) || text(inputs.form?.fieldName), text(projectName)].filter(Boolean).join(', ');
  return {
    system: sys,
    identification: identificationPairs(inputs, { projectName, organizationName, build }),
    displayUnits: u.line(),
    hasResults: rows.length > 0,
    cases,
    economics,
    incremental,
    rateLimit,
    interference,
    uncertainty,
    calibration,
    sensitivity,
    drainage,
    cross,
    crossChecks: cc,
    methods,
    inputs: { rows: inputRows(inputs, u, results), note: 'Every value the study read, with its source. [uncertainty] enters only the Monte Carlo table. [case] enters the EUR, the NPV and every number of the case table; [case, through the rate limit] enters the deliverable rate, which caps the decline when the rate limit is on; [diagnostics] enters only the drainage table; [cross-check] and [record] enter no equation. Values taken from another app name the project and the method; an edit after the intake says so.' },
    limits,
    figures,
    notes: text(inputs.identification?.notes) || null,
    footerWho: who,
    layout: layout.key,
  };
}

const span = (vs) => Math.max(...vs) - Math.min(...vs) || 1;

function buildFigures(rows, inputs, u, results) {
  const figs = [];
  if (!rows.length) {
    for (const [id, title] of [['eur', 'EUR and oil produced per well against spacing'], ['npv', 'Field NPV against the number of wells'], ['deliverability', 'Plan initial rate and deliverable rate against spacing']]) {
      figs.push({ id, title, statement: 'Does not apply: no spacing case has been computed.' });
    }
  } else {
    const xs = (k) => rows.map((r) => [u.show('spacing', r.spacing), r[k]]);
    figs.push({
      id: 'eur',
      title: 'EUR and oil produced per well against spacing',
      caption: `EUR per well is the stated recovery factor of the oil under the spacing; produced is what the decline delivers inside the project duration. Straight lines join the computed cases. Volumes in ${u.label('eur')}.`,
      panels: [{
        height: 70,
        spec: {
          xTitle: `Spacing, ${u.label('spacing')}`, yTitle: `Per well, ${u.label('eur')}`,
          yInclude: [0],
          series: [
            { name: 'EUR per well', type: 'both', pts: rows.map((r) => [u.show('spacing', r.spacing), u.show('eur', r.eurPerWell)]), rgb: SERIES_RGB.blue },
            { name: 'Produced in the project duration', type: 'line', dash: [1.5, 1], pts: rows.map((r) => [u.show('spacing', r.spacing), u.show('eur', r.producedPerWell)]), rgb: SERIES_RGB.amber },
          ],
        },
      }],
    });
    figs.push({
      id: 'npv',
      title: 'Field NPV against the number of wells',
      caption: `One point per spacing case, by its well count; mid-year discounting through the Suite screening economics engine. Capex on the right axis. Under the stated model the NPV falls as wells are added because they add capex and almost no oil${rows.some((r) => r.rateLimit?.binding) ? ', until the rate limit holds back the wide cases: the dotted line is the other side of the rate-limit switch' : ''}.`,
      panels: [{
        height: 70,
        spec: {
          xTitle: 'Wells', yTitle: 'NPV, US$ MM', y2Title: 'Capex, US$ MM',
          series: [
            { name: 'NPV', type: 'both', pts: rows.map((r) => [r.numberOfWells, r.npv]), rgb: SERIES_RGB.emerald },
            // WS-U2-001: the other side of the rate-limit switch, where it differs
            ...(rows.some((r) => r.rateLimit?.binding) ? [{
              name: inputs.form?.rateLimit !== 'off' ? 'NPV, unlimited decline' : 'NPV, rate-limited', type: 'line', dash: [0.8, 0.8],
              pts: rows.map((r) => [r.numberOfWells, inputs.form?.rateLimit !== 'off' ? r.rateLimit.npvUnlimited : r.rateLimit.npvLimited]), rgb: SERIES_RGB.red,
            }] : []),
            { name: 'Capex', type: 'line', dash: [1.5, 1], axis: 'y2', pts: rows.map((r) => [r.numberOfWells, r.totalCapex]), rgb: SERIES_RGB.slate },
          ],
        },
      }],
    });
    const deliv = rows.filter((r) => finite(r.drainage.pssRateStbd));
    if (deliv.length) {
      const all = [...rows.map((r) => r.initialRateBpd), ...deliv.map((r) => r.drainage.pssRateStbd)].filter((v) => v > 0);
      // a log axis when the two lines are more than a decade apart, so the lower one is not flattened on the floor
      const yLog = Math.max(...all) / Math.min(...all) > 20;
      figs.push({
        id: 'deliverability',
        title: 'Plan initial rate and deliverable rate against spacing',
        caption: 'The plan rate is the day-one rate of the unlimited decline; the deliverable rate is the pseudosteady-state rate of a well on that drainage area at the stated pressures, permeability and skin. Where the plan line is above the deliverable line, the unlimited case assumes a rate the well cannot give; with the rate limit on, the rate produced follows the lower of the two.',
        panels: [{
          height: 70,
          spec: {
            xTitle: `Spacing, ${u.label('spacing')}`, yTitle: `Rate, ${u.label('rate')}${yLog ? ' (log scale)' : ''}`, ...(yLog ? { yLog: true } : { yInclude: [0] }),
            series: [
              { name: 'Plan initial rate', type: 'both', pts: rows.map((r) => [u.show('spacing', r.spacing), u.show('rate', r.initialRateBpd)]), rgb: SERIES_RGB.red },
              { name: 'Deliverable (pseudosteady)', type: 'both', pts: deliv.map((r) => [u.show('spacing', r.spacing), u.show('rate', r.drainage.pssRateStbd)]), rgb: SERIES_RGB.blue },
              ...(inputs.form?.rateLimit !== 'off' && deliv.some((r) => r.rateLimit?.binding) ? [{ name: 'Rate produced (rate limit on)', type: 'line', dash: [1.5, 1], pts: rows.map((r) => [u.show('spacing', r.spacing), u.show('rate', r.rateLimit.limitedStartRateStbd)]), rgb: SERIES_RGB.emerald }] : []),
            ],
          },
        }],
      });
    } else {
      figs.push({ id: 'deliverability', title: 'Plan initial rate and deliverable rate against spacing', statement: `Does not apply: ${rows[0].drainage.deliverability || 'the deliverable rate is not computed'}` });
    }
  }
  const w = inputs.intakes?.wells;
  if (w?.wells?.length >= 2) {
    const unit = w.xyUnit || 'm';
    // relative to the south-west corner of the wells, so the ticks stay readable (the kit prints one figure from 1e5 up)
    const x0 = Math.min(...w.wells.map((x) => x.x));
    const y0 = Math.min(...w.wells.map((x) => x.y));
    figs.push({
      id: 'map',
      title: 'Wells taken from the registry',
      caption: `Surface locations in ${w.crs || 'the coordinate system the registry holds (not stated)'}, ${unit}, measured from easting ${x0.toLocaleString('en-US')} and northing ${y0.toLocaleString('en-US')}; axes not drawn to equal scale. Wells: ${w.wells.map((x) => x.name).join(', ')}.`,
      panels: [{
        height: 80,
        spec: {
          xTitle: `Easting from the origin, ${unit}`, yTitle: `Northing from the origin, ${unit}`,
          xInclude: [-0.1 * span(w.wells.map((x) => x.x)), 1.1 * span(w.wells.map((x) => x.x))],
          yInclude: [-0.1 * span(w.wells.map((x) => x.y)), 1.1 * span(w.wells.map((x) => x.y))],
          series: [{ name: 'Registry wells', type: 'scatter', pts: w.wells.map((x) => [x.x - x0, x.y - y0]), rgb: SERIES_RGB.blue, markerSize: 1.2 }],
        },
      }],
    });
  } else {
    figs.push({ id: 'map', title: 'Wells taken from the registry', statement: 'Does not apply: no wells were taken from the registry.' });
  }
  return figs;
}

export { LAYOUTS };

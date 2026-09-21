// QRA Studio (Process Safety PS3): the study model and its evaluation.
//
// A study is a register of loss of containment outcomes (scenarios) and the
// places people stand (locations). Each scenario has a frequency and an
// expected number of deaths; each scenario and location pair has a
// probability of death. From those the vendored engine
// (engines/hse/qra.js, through the shim) gives the location specific
// individual risk, the individual risk per annum of the most exposed person,
// the potential loss of life, the FAR, the F-N curve against a criterion, the
// ALARP band and the cost-benefit test with its disproportion factor.
//
// The consequence side is H4's and is not recomputed here. A probability of
// death comes from the user, or from the Purple Book rules of
// pbFatalityFractions given a dose the Consequence Modelling Studio (PS2)
// computed: a heat flux, an overpressure, a toxic probit probability.
//
// This module turns typed text into engine inputs, links a scenario's
// frequency to an event tree outcome where the user asks for it, calls the
// engine and arranges what it returns. It restates no formula. The studio's
// own arithmetic is limited to, each labelled on screen as the studio's:
//   1. unit conversion at the edge (kW/m2 to W/m2, kPa to Pa, percent to a
//      fraction), with the factors below;
//   2. a PLL reduction as the register's PLL less the PLL after a measure;
//   3. which Purple Book contour a location lies inside (a comparison);
//   4. the points the charts are drawn on.
//
// A saved study is its inputs and nothing else. Results are recomputed on
// open, so a reopened study cannot show numbers that no longer follow from it.
import {
  FN_CRITERIA, HSE_ILLUSTRATIVE_VALUES, PB_DIRECT_IGNITION_STATIONARY, PB_FRACTION_INDOORS,
  PB_IR_CONTOURS_PER_YR, PB_VAPOUR_CLOUD_SPLIT, TOLERABILITY_PRESETS,
  alarpBand, costBenefit, fatalAccidentRateFromPll, flammableReleaseEventTree, fnCriterionComparison,
  fnCurve, individualRiskPerAnnum, locationIndividualRisk, lsirTransect, pbDirectIgnitionProbability,
  pbFatalityFractions, potentialLossOfLife, thermalFatalityTransect,
} from '@/utils/processSafety/engine/qra';
import { THERMAL_PROBITS } from '@/utils/processSafety/engine/consequence';

export const STUDY_SCHEMA = 1;
export const QRA_STUDIO_ROUTE = '/dashboard/apps/process-safety/qra-studio';
export {
  FN_CRITERIA, HSE_ILLUSTRATIVE_VALUES, PB_DIRECT_IGNITION_STATIONARY, PB_FRACTION_INDOORS,
  PB_IR_CONTOURS_PER_YR, PB_VAPOUR_CLOUD_SPLIT, TOLERABILITY_PRESETS, THERMAL_PROBITS,
};

/** The unit factors the studio applies at its edge. Engine units are SI. */
export const UNIT = Object.freeze({
  W_PER_KW: 1000,
  PA_PER_KPA: 1000,
  PERCENT: 100,
});

/**
 * Text to an engine number. Blank is ABSENT (undefined), so the engine either
 * applies its documented default or refuses and names the field. Anything
 * that does not read as a number is NaN, which the engine refuses too.
 * Nothing is quietly turned into zero.
 */
export const toNumber = (v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return undefined;
  return Number(s);
};

const scaled = (v, factor) => {
  const n = toNumber(v);
  return n === undefined ? undefined : n * factor;
};

export const kwToW = (v) => scaled(v, UNIT.W_PER_KW);
export const kpaToPa = (v) => scaled(v, UNIT.PA_PER_KPA);
export const percentToFraction = (v) => scaled(v, 1 / UNIT.PERCENT);

/**
 * A comma or space separated list of numbers. Blank entries are NaN, so the
 * engine refuses the one at its index rather than the list shifting.
 */
export const toNumberList = (text) => {
  const s = String(text ?? '').trim();
  if (s === '') return [];
  return s.split(/[,;\s]+/).map((x) => (x === '' ? NaN : Number(x)));
};

const own = (obj, key) => Boolean(obj) && typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

// --------------------------------------------------------------- choices

export const EFFECTS = Object.freeze([
  { id: 'fire', label: 'Fire (pool, jet or BLEVE): heat flux' },
  { id: 'flash-fire', label: 'Flash fire: inside the flame envelope or not' },
  { id: 'explosion', label: 'Vapour cloud explosion: peak overpressure' },
  { id: 'toxic', label: 'Toxic: the probability from a toxic probit' },
]);

export const PD_MODES = Object.freeze([
  { id: 'pb', label: 'Purple Book rule from a dose' },
  { id: 'typed', label: 'A probability I type' },
]);

export const FREQUENCY_SOURCES = Object.freeze([
  { id: 'typed', label: 'A frequency I type' },
  { id: 'event-tree', label: 'An event tree outcome' },
]);

export const IGNITION_MODES = Object.freeze([
  { id: 'pb-table', label: 'Purple Book Table 4.5' },
  { id: 'typed', label: 'A probability I type' },
]);

export const RELEASE_TYPES = Object.freeze([
  { id: 'continuous', label: 'Continuous (kg/s)' },
  { id: 'instantaneous', label: 'Instantaneous (kg)' },
]);

export const SUBSTANCES = Object.freeze(Object.keys(PB_DIRECT_IGNITION_STATIONARY).map((id) => ({ id, label: id })));

export const SPLIT_MODES = Object.freeze([
  { id: 'purple-book', label: 'Purple Book 4.8: flash fire 0.6, explosion 0.4' },
  { id: 'given', label: 'A split I give' },
]);

export const IMMEDIATE_OUTCOME = 'jet or pool fire';
export const EVENT_TREE_OUTCOMES = Object.freeze([IMMEDIATE_OUTCOME, 'flash fire', 'explosion', 'no ignition']);

export const IR_CRITERIA = Object.freeze([
  { id: 'r2p2-workers', label: 'R2P2, workers (1e-3 and 1e-6 per year)' },
  { id: 'r2p2-public', label: 'R2P2, the public (1e-4 and 1e-6 per year)' },
  { id: 'custom', label: 'The limits I give' },
]);

export const PERIODS = Object.freeze([
  { id: 'day', label: `Day (${PB_FRACTION_INDOORS.day} indoors)` },
  { id: 'night', label: `Night (${PB_FRACTION_INDOORS.night} indoors)` },
]);

export const FN_CRITERION_CHOICES = Object.freeze([
  { id: 'vrom-establishments', label: 'Purple Book Figure 6.8 and Bevi: 1e-3 / N^2 for N of 10 or more' },
  { id: 'r2p2-para-136', label: 'R2P2 para 136: 50 or more deaths, 1 in 5000 per year' },
  { id: 'custom', label: 'A line I give, F = C / N^alpha' },
]);

export const TRANSECT_MODES = Object.freeze([
  { id: 'thermal', label: 'Heat fluxes along the transect (thermal probit)' },
  { id: 'typed', label: 'Probabilities of death I type' },
]);

export const THERMAL_PRESET_CHOICES = Object.freeze(Object.keys(THERMAL_PROBITS).map((id) => ({ id, label: id })));

export const DELTA_SOURCES = Object.freeze([
  { id: 'typed', label: 'A PLL reduction I type' },
  { id: 'register', label: 'The register PLL less the PLL after the measure' },
]);

// --------------------------------------------------------------- the study

let seq = 0;
/** A short id, unique within a study. */
export const newId = (prefix) => {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
};

export const blankCell = () => ({ mode: 'pb', pd: '', dose: '', inFlame: false });

export const blankScenario = (id = newId('s')) => ({
  id, name: '', frequencySource: 'typed', frequencyPerYr: '', outcome: IMMEDIATE_OUTCOME,
  fatalities: '', effect: 'fire', fireDurationS: '',
});

export const blankLocation = (id = newId('l')) => ({
  id, name: '', criterion: 'r2p2-workers', period: 'day', occupancyHoursPerYr: '', vulnerabilityFactor: '',
});

/**
 * The opening study. Illustrative: a gas line and a toxic source on one site,
 * three places people stand, and the HSE CBA checklist worked example as the
 * measure to test. Every value is yours to replace.
 */
export const defaultStudy = () => ({
  eventTree: {
    initiatingFrequencyPerYr: '1e-4',
    immediateMode: 'pb-table',
    immediateIgnitionProbability: '',
    releaseType: 'continuous',
    massRateKgS: '12',
    massKg: '',
    substance: 'gas-low-reactivity',
    delayedIgnitionProbability: '0.3',
    splitMode: 'purple-book',
    flashFire: '0.6',
    explosion: '0.4',
  },
  scenarios: [
    {
      id: 's1', name: 'Gas line, jet fire', frequencySource: 'event-tree', frequencyPerYr: '', outcome: IMMEDIATE_OUTCOME,
      fatalities: '0.8', effect: 'fire', fireDurationS: '600',
    },
    {
      id: 's2', name: 'Gas line, flash fire', frequencySource: 'event-tree', frequencyPerYr: '', outcome: 'flash fire',
      fatalities: '1.5', effect: 'flash-fire', fireDurationS: '',
    },
    {
      id: 's3', name: 'Gas line, vapour cloud explosion', frequencySource: 'event-tree', frequencyPerYr: '', outcome: 'explosion',
      fatalities: '4', effect: 'explosion', fireDurationS: '',
    },
    {
      id: 's4', name: 'H2S release', frequencySource: 'typed', frequencyPerYr: '5e-6', outcome: IMMEDIATE_OUTCOME,
      fatalities: '12', effect: 'toxic', fireDurationS: '',
    },
  ],
  locations: [
    { id: 'l1', name: 'Process area', criterion: 'r2p2-workers', period: 'day', occupancyHoursPerYr: '2000', vulnerabilityFactor: '' },
    { id: 'l2', name: 'Control room', criterion: 'r2p2-workers', period: 'day', occupancyHoursPerYr: '1500', vulnerabilityFactor: '' },
    { id: 'l3', name: 'Site boundary', criterion: 'r2p2-public', period: 'night', occupancyHoursPerYr: '0', vulnerabilityFactor: '' },
  ],
  cells: {
    s1: {
      l1: { mode: 'pb', pd: '', dose: '20', inFlame: false },
      l2: { mode: 'pb', pd: '', dose: '6', inFlame: false },
      l3: { mode: 'typed', pd: '0', dose: '', inFlame: false },
    },
    s2: {
      l1: { mode: 'pb', pd: '', dose: '', inFlame: true },
      l2: { mode: 'pb', pd: '', dose: '', inFlame: false },
      l3: { mode: 'pb', pd: '', dose: '', inFlame: false },
    },
    s3: {
      l1: { mode: 'pb', pd: '', dose: '45', inFlame: false },
      l2: { mode: 'pb', pd: '', dose: '15', inFlame: false },
      l3: { mode: 'pb', pd: '', dose: '5', inFlame: false },
    },
    s4: {
      l1: { mode: 'pb', pd: '', dose: '0.35', inFlame: false },
      l2: { mode: 'pb', pd: '', dose: '0.05', inFlame: false },
      l3: { mode: 'pb', pd: '', dose: '0.01', inFlame: false },
    },
  },
  individual: {
    irpaCriterion: 'r2p2-workers',
    customUpperPerYr: '1e-3',
    customLowerPerYr: '1e-6',
    chartCriterion: 'r2p2-workers',
  },
  societal: {
    exposedHoursPerYr: '80000',
    criterion: 'vrom-establishments',
    constantC: '1e-3',
    exponentAlpha: '2',
    minFatalities: '10',
    maxFatalities: '',
  },
  transect: {
    distancesM: '10, 20, 30, 50, 75, 100, 150, 200, 300',
    rows: [
      {
        id: 't1', scenarioId: 's1', mode: 'thermal', values: '60, 35, 22, 12, 7, 4.5, 2.5, 1.6, 0.8',
        exposureTimeS: '20', coefficients: 'eisenberg',
      },
      {
        id: 't2', scenarioId: 's2', mode: 'typed', values: '1, 1, 1, 1, 0, 0, 0, 0, 0',
        exposureTimeS: '', coefficients: 'eisenberg',
      },
      {
        id: 't3', scenarioId: 's4', mode: 'typed', values: '0.9, 0.8, 0.6, 0.35, 0.2, 0.1, 0.03, 0.01, 0.001',
        exposureTimeS: '', coefficients: 'eisenberg',
      },
    ],
  },
  costBenefit: {
    measure: 'HSE CBA checklist worked example (illustrative)',
    deltaSource: 'typed',
    deltaPllPerYr: '0.0002',
    pllAfterPerYr: '',
    vpf: '1336800',
    lifetimeYears: '25',
    capitalCost: '93000',
    annualCost: '0',
    disproportionFactor: '10',
    benefitDiscountRatePct: '',
    costDiscountRatePct: '',
    benefitGrowthRatePct: '',
    otherHarms: [
      { id: 'h1', name: 'permanently incapacitating injury', expectedCasesPerYr: '0.0004', valuePerCase: '207200' },
      { id: 'h2', name: 'serious injury', expectedCasesPerYr: '0.001', valuePerCase: '20500' },
      { id: 'h3', name: 'slight injury', expectedCasesPerYr: '0.002', valuePerCase: '300' },
    ],
  },
});

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => ({ ...base, ...(isObj(over) ? over : {}) });
const listOf = (items, blank) => (Array.isArray(items) ? items.filter(isObj).map((x) => merge(blank(x.id), x)) : null);

/** A saved payload back to a study, filling anything a newer field left out. */
export const studyFromPayload = (payload) => {
  const s = payload?.study;
  if (!isObj(s) || !Array.isArray(s.scenarios) || !Array.isArray(s.locations)) return null;
  const d = defaultStudy();
  const cells = {};
  if (isObj(s.cells)) {
    Object.keys(s.cells).forEach((sid) => {
      if (!isObj(s.cells[sid])) return;
      cells[sid] = {};
      Object.keys(s.cells[sid]).forEach((lid) => { cells[sid][lid] = merge(blankCell(), s.cells[sid][lid]); });
    });
  }
  const cb = merge(d.costBenefit, s.costBenefit);
  cb.otherHarms = listOf(s.costBenefit?.otherHarms, (id) => ({
    id: id || newId('h'), name: '', expectedCasesPerYr: '', valuePerCase: '',
  })) || [];
  const tr = merge(d.transect, s.transect);
  tr.rows = listOf(s.transect?.rows, (id) => ({
    id: id || newId('t'), scenarioId: '', mode: 'typed', values: '', exposureTimeS: '', coefficients: 'eisenberg',
  })) || [];
  return {
    eventTree: merge(d.eventTree, s.eventTree),
    scenarios: listOf(s.scenarios, blankScenario),
    locations: listOf(s.locations, blankLocation),
    cells,
    individual: merge(d.individual, s.individual),
    societal: merge(d.societal, s.societal),
    transect: tr,
    costBenefit: cb,
  };
};

// --------------------------------------------------------------- helpers

const ok = (r) => Boolean(r) && !r.error;

/** A refusal the studio raises when an input it links to has no result. */
export const upstreamMissing = (field, what) => ({
  error: `${field}: ${what} has no result yet, so there is nothing to carry over. Fix it there or type a value here.`,
  field,
  upstream: true,
});

/** Prefix a refusal's field with where in the register it came from, keeping its message. */
const within = (r, where) => ({ ...r, where });

export const scenarioLabel = (s, i) => (s?.name && String(s.name).trim() ? String(s.name).trim() : `Scenario ${i + 1}`);
export const locationLabel = (l, j) => (l?.name && String(l.name).trim() ? String(l.name).trim() : `Location ${j + 1}`);

export const cellOf = (study, sid, lid) => (own(study.cells, sid) && own(study.cells[sid], lid)
  ? study.cells[sid][lid]
  : blankCell());

// --------------------------------------------------------------- event tree

/** The direct ignition probability from PB Table 4.5, or null when typed. */
export const evaluateIgnition = (et) => {
  if (et.immediateMode !== 'pb-table') return null;
  return pbDirectIgnitionProbability({
    releaseType: et.releaseType,
    massRateKgS: et.releaseType === 'continuous' ? toNumber(et.massRateKgS) : undefined,
    massKg: et.releaseType === 'instantaneous' ? toNumber(et.massKg) : undefined,
    substance: et.substance,
  });
};

export const evaluateEventTree = (et) => {
  const ignition = evaluateIgnition(et);
  let immediate;
  if (et.immediateMode === 'pb-table') {
    if (!ok(ignition)) return { ignition, tree: upstreamMissing('immediateIgnitionProbability', 'The Table 4.5 lookup') };
    immediate = ignition.probability;
  } else {
    immediate = toNumber(et.immediateIgnitionProbability);
  }
  const tree = flammableReleaseEventTree({
    initiatingFrequencyPerYr: toNumber(et.initiatingFrequencyPerYr),
    immediateIgnitionProbability: immediate,
    delayedIgnitionProbability: toNumber(et.delayedIgnitionProbability),
    vapourCloudSplit: et.splitMode === 'given'
      ? { flashFire: toNumber(et.flashFire), explosion: toNumber(et.explosion) }
      : 'purple-book',
    immediateOutcome: IMMEDIATE_OUTCOME,
  });
  return { ignition, tree };
};

// --------------------------------------------------------------- register

/** A scenario's frequency: typed, or the named outcome of the event tree. */
export const scenarioFrequency = (s, tree) => {
  if (s.frequencySource === 'event-tree') {
    if (!ok(tree)) return { value: undefined, refusal: upstreamMissing('frequencyPerYr', 'The event tree') };
    const totals = tree.outcomeTotalsPerYr;
    if (!own(totals, s.outcome)) {
      return { value: undefined, refusal: { error: `frequencyPerYr: the event tree has no outcome '${s.outcome}'`, field: 'frequencyPerYr' } };
    }
    return { value: totals[s.outcome], linked: true };
  }
  return { value: toNumber(s.frequencyPerYr) };
};

/**
 * One cell's probability of death. Typed, or PE from the Purple Book rules
 * (pbFatalityFractions) for the scenario's effect and the location's period.
 */
export const evaluateCell = (cell, scenario, location) => {
  if (cell.mode === 'typed') return { typed: true, probabilityOfDeath: toNumber(cell.pd) };
  const args = { effect: scenario.effect, period: location.period };
  if (scenario.effect === 'fire') {
    args.insideFlameEnvelope = Boolean(cell.inFlame);
    if (!cell.inFlame) {
      args.heatFluxWM2 = kwToW(cell.dose);
      args.fireDurationS = toNumber(scenario.fireDurationS);
    }
  } else if (scenario.effect === 'flash-fire') {
    args.insideFlameEnvelope = Boolean(cell.inFlame);
  } else if (scenario.effect === 'explosion') {
    args.peakOverpressurePa = kpaToPa(cell.dose);
  } else if (scenario.effect === 'toxic') {
    args.probabilityOfDeath = toNumber(cell.dose);
  }
  return pbFatalityFractions(args);
};

/**
 * The register: every scenario's frequency, every cell's probability of
 * death, each location's LSIR (engine), its ALARP band (engine) and the
 * Purple Book contour it lies inside (the studio's comparison).
 */
export const evaluateRegister = (study, tree) => {
  const freqs = study.scenarios.map((s) => scenarioFrequency(s, tree));
  const cells = {};
  study.scenarios.forEach((s) => {
    cells[s.id] = {};
    study.locations.forEach((l) => { cells[s.id][l.id] = evaluateCell(cellOf(study, s.id, l.id), s, l); });
  });
  const locations = study.locations.map((l, j) => {
    const label = locationLabel(l, j);
    if (study.scenarios.length === 0) {
      return { id: l.id, label, lsir: locationIndividualRisk({ scenarios: [] }) };
    }
    for (let i = 0; i < study.scenarios.length; i += 1) {
      const s = study.scenarios[i];
      if (freqs[i].refusal) return { id: l.id, label, lsir: within(freqs[i].refusal, scenarioLabel(s, i)) };
      const c = cells[s.id][l.id];
      if (c.error) return { id: l.id, label, lsir: within(c, `${scenarioLabel(s, i)} at ${label}`) };
    }
    const lsir = locationIndividualRisk({
      scenarios: study.scenarios.map((s, i) => ({
        name: scenarioLabel(s, i),
        frequencyPerYr: freqs[i].value,
        fatalityProbability: cells[s.id][l.id].probabilityOfDeath,
      })),
    });
    const band = ok(lsir) ? alarpBand({ individualRiskPerYr: lsir.lsirPerYr, thresholds: thresholdsFor(l.criterion, study.individual) }) : null;
    return {
      id: l.id, label, lsir, band, contour: ok(lsir) ? contourInside(lsir.lsirPerYr) : null,
    };
  });
  return { freqs, cells, locations };
};

/** The engine preset name, or the custom limits as numbers. */
export const thresholdsFor = (criterion, individual) => (criterion === 'custom'
  ? {
    unacceptableAbovePerYr: toNumber(individual.customUpperPerYr),
    broadlyAcceptableAtOrBelowPerYr: toNumber(individual.customLowerPerYr),
  }
  : criterion);

/**
 * The smallest Purple Book contour level (1e-4 to 1e-8 per year) the value is
 * at or above: the location lies inside that contour. Null below 1e-8. This
 * is a comparison with the engine's list, labelled as the studio's reading.
 */
export const contourInside = (irPerYr) => {
  const levels = [...PB_IR_CONTOURS_PER_YR].sort((a, b) => b - a);
  return levels.find((lv) => irPerYr >= lv) ?? null;
};

// --------------------------------------------------------------- individual

export const evaluateIndividual = (study, register) => {
  const bad = register.locations.find((r) => !ok(r.lsir));
  let irpa;
  if (study.locations.length === 0) {
    irpa = individualRiskPerAnnum({ locations: [] });
  } else if (bad) {
    irpa = upstreamMissing('locations', `The LSIR at ${bad.label}`);
  } else {
    irpa = individualRiskPerAnnum({
      locations: study.locations.map((l, j) => ({
        name: locationLabel(l, j),
        lsirPerYr: register.locations[j].lsir.lsirPerYr,
        hoursPerYr: toNumber(l.occupancyHoursPerYr),
        vulnerabilityFactor: toNumber(l.vulnerabilityFactor),
      })),
    });
  }
  const irpaBand = ok(irpa)
    ? alarpBand({ individualRiskPerYr: irpa.irpaPerYr, thresholds: thresholdsFor(study.individual.irpaCriterion, study.individual) })
    : null;
  return { irpa, irpaBand, irpaContour: ok(irpa) ? contourInside(irpa.irpaPerYr) : null };
};

/** The band limits of a criterion, read from the engine (a zero risk evaluated against it). */
export const criterionLimits = (criterion, individual) => {
  const r = alarpBand({ individualRiskPerYr: 0, thresholds: thresholdsFor(criterion, individual) });
  return ok(r) ? { ...r.basis.thresholds, source: r.basis.source } : r;
};

// --------------------------------------------------------------- societal

const societalScenarios = (study, register) => {
  for (let i = 0; i < study.scenarios.length; i += 1) {
    if (register.freqs[i].refusal) return within(register.freqs[i].refusal, scenarioLabel(study.scenarios[i], i));
  }
  return study.scenarios.map((s, i) => ({
    name: scenarioLabel(s, i), frequencyPerYr: register.freqs[i].value, fatalities: toNumber(s.fatalities),
  }));
};

export const fnCriterionSpec = (soc) => {
  if (soc.criterion !== 'custom') return soc.criterion;
  const spec = {
    constantC: toNumber(soc.constantC),
    exponentAlpha: toNumber(soc.exponentAlpha),
  };
  const nMin = toNumber(soc.minFatalities);
  const nMax = toNumber(soc.maxFatalities);
  if (nMin !== undefined) spec.minFatalities = nMin;
  if (nMax !== undefined) spec.maxFatalities = nMax;
  return spec;
};

export const evaluateSocietal = (study, register) => {
  const scen = societalScenarios(study, register);
  if (scen.error) return { pll: scen, far: upstreamMissing('pllPerYr', 'The PLL'), curve: scen, comparison: scen };
  const pll = potentialLossOfLife({ scenarios: scen });
  const far = ok(pll)
    ? fatalAccidentRateFromPll({ pllPerYr: pll.pllPerYr, exposedHoursPerYr: toNumber(study.societal.exposedHoursPerYr) })
    : upstreamMissing('pllPerYr', 'The PLL');
  const curve = fnCurve({ scenarios: scen });
  const comparison = fnCriterionComparison({ scenarios: scen, criterion: fnCriterionSpec(study.societal) });
  return { pll, far, curve, comparison };
};

// --------------------------------------------------------------- transect

export const evaluateTransect = (study, register) => {
  const tr = study.transect;
  const distancesM = toNumberList(tr.distancesM);
  const rows = tr.rows.map((row) => {
    const i = study.scenarios.findIndex((s) => s.id === row.scenarioId);
    if (i < 0) return { row, refusal: { error: 'scenarioId: choose a scenario from the register', field: 'scenarioId' } };
    const s = study.scenarios[i];
    const f = register.freqs[i];
    if (f.refusal) return { row, name: scenarioLabel(s, i), refusal: f.refusal };
    if (row.mode === 'thermal') {
      const r = thermalFatalityTransect({
        heatFluxesWM2: toNumberList(row.values).map((q) => q * UNIT.W_PER_KW),
        exposureTimeS: toNumber(row.exposureTimeS),
        coefficients: row.coefficients,
      });
      if (r.error) return { row, name: scenarioLabel(s, i), refusal: r };
      return {
        row, name: scenarioLabel(s, i), frequencyPerYr: f.value, probabilities: r.probabilities, thermal: r,
      };
    }
    return {
      row, name: scenarioLabel(s, i), frequencyPerYr: f.value, probabilities: toNumberList(row.values),
    };
  });
  const firstBad = rows.find((r) => r.refusal);
  if (firstBad) return { rows, distancesM, result: within(firstBad.refusal, firstBad.name || 'transect row') };
  const result = lsirTransect({
    distancesM,
    scenarios: rows.map((r) => ({ name: r.name, frequencyPerYr: r.frequencyPerYr, fatalityProbabilities: r.probabilities })),
  });
  return { rows, distancesM, result };
};

// --------------------------------------------------------------- cost-benefit

export const deltaPll = (cb, societal) => {
  if (cb.deltaSource !== 'register') return { value: toNumber(cb.deltaPllPerYr) };
  if (!ok(societal.pll)) return { refusal: upstreamMissing('deltaPllPerYr', 'The register PLL') };
  const after = toNumber(cb.pllAfterPerYr);
  if (after === undefined || !Number.isFinite(after) || after < 0) {
    return { refusal: { error: 'pllAfterPerYr: the PLL after the measure is required, 0 or more fatalities per year', field: 'pllAfterPerYr' } };
  }
  return { value: societal.pll.pllPerYr - after, before: societal.pll.pllPerYr, after };
};

export const evaluateCostBenefit = (cb, societal) => {
  const delta = deltaPll(cb, societal);
  if (delta.refusal) return { delta, result: delta.refusal };
  const args = {
    deltaPllPerYr: delta.value,
    vpf: toNumber(cb.vpf),
    otherHarms: cb.otherHarms.map((h) => ({
      name: h.name, expectedCasesPerYr: toNumber(h.expectedCasesPerYr), valuePerCase: toNumber(h.valuePerCase),
    })),
    lifetimeYears: toNumber(cb.lifetimeYears),
    capitalCost: toNumber(cb.capitalCost),
    disproportionFactor: toNumber(cb.disproportionFactor),
  };
  // Blank keeps the engine's stated default (0, undiscounted; no annual cost).
  const optional = {
    annualCost: toNumber(cb.annualCost),
    benefitDiscountRate: percentToFraction(cb.benefitDiscountRatePct),
    costDiscountRate: percentToFraction(cb.costDiscountRatePct),
    benefitGrowthRate: percentToFraction(cb.benefitGrowthRatePct),
  };
  Object.entries(optional).forEach(([k, v]) => { if (v !== undefined) args[k] = v; });
  return { delta, result: costBenefit(args) };
};

// --------------------------------------------------------------- study

export const evaluateStudy = (study) => {
  const eventTree = evaluateEventTree(study.eventTree);
  const register = evaluateRegister(study, eventTree.tree);
  const individual = evaluateIndividual(study, register);
  const societal = evaluateSocietal(study, register);
  const transect = evaluateTransect(study, register);
  const cba = evaluateCostBenefit(study.costBenefit, societal);
  return {
    eventTree, register, individual, societal, transect, costBenefit: cba,
  };
};

// --------------------------------------------------------------- charts

/**
 * The F-N curve as a staircase to draw: F(N) holds on (N(k-1), N(k)], so each
 * step is drawn from its left edge to its corner. The first step starts at
 * N = 1 or the smallest N, whichever is lower, on a log axis.
 */
export const fnStaircase = (points) => {
  if (!Array.isArray(points) || points.length === 0) return [];
  const out = [];
  let left = Math.min(1, points[0].fatalities);
  points.forEach((p) => {
    out.push({ n: left, f: p.cumulativeFrequencyPerYr });
    out.push({ n: p.fatalities, f: p.cumulativeFrequencyPerYr });
    left = p.fatalities;
  });
  return out;
};

/** Evenly spaced in log between lo and hi, n points. */
export const logGrid = (lo, hi, n = 40) => {
  if (!(lo > 0) || !(hi > lo) || n < 2) return [];
  const a = Math.log(lo);
  const b = Math.log(hi);
  return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)));
};

/**
 * The criterion line to draw, each point the ENGINE's criterion frequency at
 * that N: a one-scenario probe curve is compared against the criterion and
 * its criterionFrequencyPerYr read back, so no line is restated here. A
 * points criterion (R2P2) comes back as its points.
 */
export const criterionLine = (criterion, nLo, nHi) => {
  if (criterion && typeof criterion === 'object' && criterion.points) return { points: criterion.points };
  if (typeof criterion === 'string' && own(FN_CRITERIA, criterion) && FN_CRITERIA[criterion].points) {
    return { points: FN_CRITERIA[criterion].points };
  }
  const line = [];
  logGrid(nLo, nHi).forEach((n) => {
    const r = fnCriterionComparison({ scenarios: [{ name: 'probe', frequencyPerYr: 1, fatalities: n }], criterion });
    if (ok(r) && r.checks.length > 0) {
      const c = r.checks.find((k) => k.fatalities === n) || r.checks[0];
      line.push({ n, f: c.criterionFrequencyPerYr });
    }
  });
  return { line };
};

// --------------------------------------------------------------- words

export const BAND_TEXT = Object.freeze({
  UNACCEPTABLE: 'Above the upper limit: unacceptable whatever the benefit, save in extraordinary circumstances (R2P2). Reduce it first.',
  TOLERABLE: 'Between the limits: tolerable only if reduced as low as reasonably practicable. An ALARP demonstration is required.',
  BROADLY_ACCEPTABLE: 'At or below the lower limit: broadly acceptable. Keep it there.',
});

export const FN_STATE_TEXT = Object.freeze({
  EXCEEDS: 'The curve lies above the criterion somewhere in its range.',
  TOUCHES: 'The curve meets the criterion at a corner and lies below it elsewhere.',
  BELOW: 'The curve lies below the criterion across its range.',
});

export const VERDICT_TEXT = Object.freeze({
  GROSSLY_DISPROPORTIONATE: 'The cost exceeds the disproportion factor times the benefit, so the measure is not reasonably practicable on this test.',
  NOT_GROSSLY_DISPROPORTIONATE: 'The cost is at or below the disproportion factor times the benefit, so the measure is reasonably practicable on this test and should be put in place.',
});

/** What this studio does not do, in the words the scope notice uses. */
export const NOT_MODELLED = Object.freeze([
  'an aversion-weighted risk integral',
  'a slope for the R2P2 societal point (it is drawn as the single point R2P2 gives)',
  'grid and wind-rose bookkeeping (the scenario frequencies, fS PM Pphi Pi, are yours)',
  'Monte Carlo uncertainty on the frequencies',
  'the consequence models themselves (the Consequence Modelling Studio computes the doses)',
]);

export const formatSci = (x, digits = 3) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'n/a';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 0.01 && abs < 1e5) return String(Number(x.toPrecision(digits)));
  return x.toExponential(digits - 1).replace('e+', 'e');
};

export const formatMoney = (x) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'n/a';
  return x.toLocaleString('en-GB', { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 });
};

export const formatPercent = (p) => {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 'n/a';
  if (p === 0) return '0 %';
  if (p < 1e-4) return `${formatSci(p * 100, 2)} %`;
  return `${Number((p * 100).toPrecision(3))} %`;
};

/** "1 in N" for a per-year risk, as R2P2 words it. */
export const oneIn = (perYr) => {
  if (typeof perYr !== 'number' || !(perYr > 0) || !Number.isFinite(perYr)) return 'n/a';
  return `1 in ${Math.round(1 / perYr).toLocaleString('en-GB')}`;
};

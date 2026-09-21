// LOPA & SIL Studio (Process Safety PS1): the study model and its evaluation.
//
// A study is a list of LOPA scenarios. Each scenario carries its own safety
// instrumented function (SIF) to verify, because the question a SIF answers
// is always "does it meet THIS scenario's required PFDavg and TMEL".
//
// Everything numeric comes from the vendored engine (engines/hse/lopa.js,
// through the shim). This module only turns the text a user typed into the
// engine's inputs, calls the engine, and arranges what it returns. It restates
// no formula: the series sum, the bands, the credit rule and the interval
// search are all the engine's. The one piece of arithmetic here is the
// subsystem's share of the required PFDavg (the required SIF PFDavg less the
// other subsystems' PFDavg), and it is labelled as the app's in the UI.
//
// A saved study is its inputs and nothing else. Results are recomputed on
// open, so a reopened study cannot show numbers that no longer follow from it.
import { v4 as uuidv4 } from 'uuid';
import {
  ARCHITECTURES, HOURS_PER_YEAR, LOPA_OUTCOME, PFD_STATE,
  lopaScenario, maxProofTestInterval, pfdAvgSif, pfdAvgSubsystem,
} from '@/utils/processSafety/engine/lopa';

export const STUDY_SCHEMA = 1;
export const LOPA_STUDIO_ROUTE = '/dashboard/apps/process-safety/lopa-sil-studio';
export const HOURS_PER_MONTH = HOURS_PER_YEAR / 12;
export { ARCHITECTURES, HOURS_PER_YEAR, LOPA_OUTCOME, PFD_STATE };

export const SUBSYSTEM_ROLES = Object.freeze([
  { id: 'sensor', label: 'Sensors' },
  { id: 'logic', label: 'Logic solver' },
  { id: 'final', label: 'Final elements' },
]);

export const DEFAULT_SENSITIVITY_MONTHS = '1, 3, 6, 12, 18, 24, 36, 48, 60';

/**
 * Text to an engine number. Blank is ABSENT (undefined), so the engine either
 * applies its documented default (lambdaDD 0, MRT 0, PTC 1) or refuses and
 * names the field. Anything that does not read as a number is NaN, which the
 * engine refuses too. Nothing is quietly turned into zero.
 */
export const toNumber = (v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return undefined;
  return Number(s);
};

// --------------------------------------------------------------- defaults

export const newProbabilityRow = (name = '', probability = '') => ({ id: uuidv4(), name, probability });

export const newIpl = (name = '', pfd = '', independent = true, auditable = true) => ({
  id: uuidv4(), name, pfd, independent, auditable,
});

export const newSubsystem = (role, overrides = {}) => ({
  id: uuidv4(),
  role,
  name: SUBSYSTEM_ROLES.find((r) => r.id === role)?.label || 'Subsystem',
  architecture: '1oo1',
  lambdaDuPerHour: '',
  lambdaDdPerHour: '',
  mttrHours: '',
  mrtHours: '',
  beta: '',
  betaD: '',
  proofTestIntervalHours: String(HOURS_PER_YEAR),
  proofTestCoverage: '1',
  lifetimeHours: '',
  ...overrides,
});

/**
 * The scenario a new study opens on.
 *
 * Every number in it is ILLUSTRATIVE, chosen to show each part of the method
 * (a conditional modifier, a credited layer, a layer that is not credited and
 * why, a SIF that closes the gap). None of it is a published worked example
 * and none of the failure rates is vendor or database data. The UI says so.
 */
export const exampleScenario = () => ({
  id: uuidv4(),
  name: 'Separator overpressure (example)',
  consequence: 'Vessel rupture on blocked outlet, with a release to the process area',
  initiatingEvent: 'Level control valve fails closed',
  iefPerYr: '0.1',
  tmelPerYr: '1e-5',
  enablingConditions: [],
  conditionalModifiers: [newProbabilityRow('Probability personnel are in the area', '0.5')],
  ipls: [
    newIpl('Pressure relief valve sized for blocked outlet', '0.01', true, true),
    newIpl('Operator response to high pressure alarm', '0.1', false, true),
  ],
  sif: {
    enabled: true,
    name: 'High pressure trip closing the inlet',
    subsystems: [
      newSubsystem('sensor', {
        name: 'Pressure transmitters',
        architecture: '1oo2',
        lambdaDuPerHour: '3e-7',
        lambdaDdPerHour: '1e-6',
        mttrHours: '8',
        mrtHours: '8',
        beta: '0.05',
        betaD: '0.025',
      }),
      newSubsystem('logic', {
        name: 'Safety PLC',
        architecture: '1oo1',
        lambdaDuPerHour: '5e-9',
        lambdaDdPerHour: '5e-7',
        mttrHours: '8',
        mrtHours: '8',
      }),
      newSubsystem('final', {
        name: 'Inlet shutdown valve',
        architecture: '1oo1',
        lambdaDuPerHour: '2e-6',
        lambdaDdPerHour: '',
        mttrHours: '',
        mrtHours: '24',
      }),
    ],
  },
  sensitivity: {
    subsystemId: null,
    months: DEFAULT_SENSITIVITY_MONTHS,
    targetMode: 'share',
    customTargetPfd: '',
  },
});

export const blankScenario = (n = 1) => ({
  ...exampleScenario(),
  id: uuidv4(),
  name: `Scenario ${n}`,
  consequence: '',
  initiatingEvent: '',
  iefPerYr: '',
  tmelPerYr: '',
  conditionalModifiers: [],
  ipls: [],
  sif: {
    enabled: false,
    name: 'SIF',
    subsystems: SUBSYSTEM_ROLES.map((r) => newSubsystem(r.id)),
  },
});

export const defaultStudy = () => {
  const s = exampleScenario();
  return { scenarios: [s], activeScenarioId: s.id };
};

/**
 * Read a saved payload back into a study, tolerating the fields a later
 * build may add. Returns null when the payload is not a study at all, so the
 * caller can say it could not be read instead of opening an empty one.
 */
export const studyFromPayload = (payload) => {
  const study = payload?.study;
  if (!study || !Array.isArray(study.scenarios) || study.scenarios.length === 0) return null;
  const scenarios = study.scenarios.map((s) => {
    const base = blankScenario();
    return {
      ...base,
      ...s,
      enablingConditions: Array.isArray(s.enablingConditions) ? s.enablingConditions : [],
      conditionalModifiers: Array.isArray(s.conditionalModifiers) ? s.conditionalModifiers : [],
      ipls: Array.isArray(s.ipls) ? s.ipls : [],
      sif: {
        ...base.sif,
        ...(s.sif || {}),
        subsystems: Array.isArray(s.sif?.subsystems) ? s.sif.subsystems : base.sif.subsystems,
      },
      sensitivity: { ...base.sensitivity, ...(s.sensitivity || {}) },
    };
  });
  const active = scenarios.some((s) => s.id === study.activeScenarioId)
    ? study.activeScenarioId
    : scenarios[0].id;
  return { scenarios, activeScenarioId: active };
};

// --------------------------------------------------------------- engine inputs

const probabilityInputs = (rows) => rows.map((r) => ({ name: r.name, probability: toNumber(r.probability) }));

export const scenarioEngineInput = (scenario, sifPfdAvg) => ({
  initiatingEventFrequencyPerYr: toNumber(scenario.iefPerYr),
  enablingConditions: probabilityInputs(scenario.enablingConditions || []),
  conditionalModifiers: probabilityInputs(scenario.conditionalModifiers || []),
  ipls: (scenario.ipls || []).map((i) => ({
    name: i.name,
    pfd: toNumber(i.pfd),
    independent: i.independent === true,
    auditable: i.auditable !== false,
  })),
  tmelPerYr: toNumber(scenario.tmelPerYr),
  ...(sifPfdAvg !== undefined ? { sifPfdAvg } : {}),
});

export const subsystemEngineInput = (sub, overrides = {}) => ({
  name: sub.name,
  architecture: sub.architecture,
  lambdaDuPerHour: toNumber(sub.lambdaDuPerHour),
  lambdaDdPerHour: toNumber(sub.lambdaDdPerHour),
  mttrHours: toNumber(sub.mttrHours),
  mrtHours: toNumber(sub.mrtHours),
  beta: toNumber(sub.beta),
  betaD: toNumber(sub.betaD),
  proofTestIntervalHours: toNumber(sub.proofTestIntervalHours),
  proofTestCoverage: toNumber(sub.proofTestCoverage),
  lifetimeHours: toNumber(sub.lifetimeHours),
  ...overrides,
});

// --------------------------------------------------------------- evaluation

/**
 * The SIF against the scenario. Two questions, kept apart on purpose:
 *   meetsSilBand     the achieved SIL is at least the required SIL
 *   meetsRequiredPfd the achieved PFDavg is at or below the required PFDavg
 * The engine's own note is that the band alone does not guarantee the
 * target, so the verdict is the second, and meetsTmel is the engine's.
 */
export const sifVerdict = (lopa, sif) => {
  if (!lopa || lopa.error || !sif || sif.error) return null;
  const outcome = lopa.outcome;
  if (outcome === LOPA_OUTCOME.NO_SIF_REQUIRED) {
    return { kind: 'not-required', meetsTmel: lopa.meetsTmel === true };
  }
  if (outcome === LOPA_OUTCOME.BEYOND_SIL3) {
    return { kind: 'redesign', meetsTmel: lopa.meetsTmel === true };
  }
  // With the SIF's PFDavg supplied, the engine's meetsTmel IS the test
  // f x PFDavg <= TMEL, which is PFDavg <= the required PFDavg, decided with
  // the engine's decade snap. It is not re-derived here.
  const meetsRequiredPfd = lopa.meetsTmel === true;
  const meetsSilBand = lopa.requiredSil === null
    ? null
    : (sif.sil !== null && sif.sil >= lopa.requiredSil);
  return {
    kind: meetsRequiredPfd ? 'meets' : 'short',
    requiredSil: lopa.requiredSil,
    achievedSil: sif.sil,
    meetsSilBand,
    meetsRequiredPfd,
    meetsTmel: lopa.meetsTmel === true,
  };
};

/**
 * Evaluate one scenario end to end. Every engine refusal is kept with the
 * field it names, so the panel can show it where the value was typed.
 */
export const evaluateScenario = (scenario) => {
  const subsystems = (scenario.sif?.subsystems || []).map((sub) => ({
    id: sub.id,
    role: sub.role,
    name: sub.name,
    result: pfdAvgSubsystem(subsystemEngineInput(sub)),
  }));
  const sifEnabled = scenario.sif?.enabled === true;
  const sif = sifEnabled
    ? pfdAvgSif((scenario.sif.subsystems || []).map((s) => subsystemEngineInput(s)))
    : null;
  const withoutSif = lopaScenario(scenarioEngineInput(scenario));
  const sifUsable = sifEnabled && sif && !sif.error;
  const lopa = sifUsable
    ? lopaScenario(scenarioEngineInput(scenario, sif.pfdAvg))
    : withoutSif;
  return {
    lopa,
    withoutSif,
    sifEnabled,
    sif,
    subsystems,
    verdict: sifUsable ? sifVerdict(lopa, sif) : null,
  };
};

/** "1, 3, 6" (months) to sorted distinct positive hours. Bad entries are reported. */
export const parseIntervalsMonths = (text) => {
  const parts = String(text ?? '').split(/[,\s;]+/).filter(Boolean);
  const bad = [];
  const months = [];
  parts.forEach((p) => {
    const n = Number(p);
    if (Number.isFinite(n) && n > 0) months.push(n);
    else bad.push(p);
  });
  const unique = [...new Set(months)].sort((a, b) => a - b);
  return { months: unique, hours: unique.map((m) => m * HOURS_PER_MONTH), bad };
};

/**
 * The SIF PFDavg and the chosen subsystem's PFDavg at each proof test
 * interval of that subsystem, every other input held. Both come from the
 * engine: the subsystem from pfdAvgSubsystem, the SIF from pfdAvgSif over the
 * set with that one subsystem's interval replaced.
 */
export const sensitivitySeries = (scenario, subsystemId, intervalsHours) => {
  const subs = scenario.sif?.subsystems || [];
  const idx = subs.findIndex((s) => s.id === subsystemId);
  if (idx === -1) return { error: 'Choose a subsystem to vary.' };
  if (!intervalsHours.length) return { error: 'Enter at least one proof test interval.' };
  const rows = [];
  for (const t of intervalsHours) {
    const sub = pfdAvgSubsystem(subsystemEngineInput(subs[idx], { proofTestIntervalHours: t }));
    if (sub.error) return { error: `At ${formatHours(t)}: ${sub.error}`, field: sub.field };
    const sif = pfdAvgSif(subs.map((s, i) => subsystemEngineInput(
      s, i === idx ? { proofTestIntervalHours: t } : {},
    )));
    rows.push({
      hours: t,
      years: t / HOURS_PER_YEAR,
      subsystemPfd: sub.pfdAvg,
      sifPfd: sif.error ? null : sif.pfdAvg,
      sifError: sif.error || null,
      warnings: sub.warnings,
    });
  }
  return { rows };
};

/**
 * The target the chosen subsystem must meet on its own, for the longest
 * interval search.
 *
 * 'share': the required SIF PFDavg less the other subsystems' PFDavg (their
 *          PFDavg as they stand). This subtraction is the app's arithmetic
 *          over engine outputs, and the panel labels it so.
 * 'custom': a PFDavg the user types.
 */
export const subsystemTarget = (scenario, evaluation, subsystemId) => {
  const mode = scenario.sensitivity?.targetMode || 'share';
  if (mode === 'custom') {
    const t = toNumber(scenario.sensitivity?.customTargetPfd);
    if (t === undefined) return { error: 'Enter a target PFDavg.' };
    return { mode, target: t };
  }
  const required = evaluation?.withoutSif?.requiredSifPfdAvg;
  if (!Number.isFinite(required)) {
    return { error: 'The scenario has no required SIF PFDavg to share out (no SIF is required, or its LOPA inputs are incomplete). Choose a typed target instead.' };
  }
  const others = (evaluation.subsystems || []).filter((s) => s.id !== subsystemId);
  const broken = others.find((s) => s.result?.error);
  if (broken) return { error: `${broken.name}: ${broken.result.error}` };
  const othersPfd = others.reduce((a, s) => a + s.result.pfdAvg, 0);
  const target = required - othersPfd;
  if (!(target > 0)) {
    return {
      error: `The other subsystems already reach ${formatSci(othersPfd)}, at or above the required SIF PFDavg of ${formatSci(required)}. No interval on this subsystem can close that.`,
      required, othersPfd,
    };
  }
  return { mode, target, required, othersPfd };
};

export const longestInterval = (scenario, subsystemId, target) => {
  const sub = (scenario.sif?.subsystems || []).find((s) => s.id === subsystemId);
  if (!sub) return { error: 'Choose a subsystem.' };
  const r = maxProofTestInterval(subsystemEngineInput(sub), target);
  if (r.error || (r.state !== 'FOUND' && r.state !== 'CAPPED_AT_LIFETIME')) return r;
  // The warnings belong to the interval found, so ask the engine at that interval.
  const at = pfdAvgSubsystem(subsystemEngineInput(sub, { proofTestIntervalHours: r.proofTestIntervalHours }));
  return { ...r, warnings: at.error ? [] : at.warnings };
};

// --------------------------------------------------------------- words

export const OUTCOME_TEXT = Object.freeze({
  [LOPA_OUTCOME.NO_SIF_REQUIRED]: 'No SIF required. The credited layers already bring the scenario to the TMEL or below.',
  [LOPA_OUTCOME.BELOW_SIL1]: 'Risk reduction is needed, but less than a SIL 1 SIF provides by definition (required RRF above 1 and at most 10).',
  [LOPA_OUTCOME.SIL1]: 'A SIL 1 SIF is required.',
  [LOPA_OUTCOME.SIL2]: 'A SIL 2 SIF is required.',
  [LOPA_OUTCOME.SIL3]: 'A SIL 3 SIF is required.',
  [LOPA_OUTCOME.BEYOND_SIL3]: 'Beyond SIL 3. The process sector treats this as a redesign: change the process or add layers outside the SIS.',
});

export const INTERVAL_STATE_TEXT = Object.freeze({
  FOUND: 'The longest proof test interval that still meets the target.',
  CAPPED_AT_LIFETIME: 'The target is met at every interval up to the lifetime T2, so the interval is capped at the lifetime.',
  UNACHIEVABLE: 'No interval meets the target. The part of PFDavg that does not depend on the interval (detected failures and their repair time, the restoration time, and any failures the proof test does not cover) already reaches it.',
  INTERVAL_INDEPENDENT: 'lambdaDU is zero for this subsystem, so the proof test interval does not enter its PFDavg.',
});

export const formatSci = (x, digits = 3) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'n/a';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 0.01 && abs < 1e4) return String(Number(x.toPrecision(digits)));
  return x.toExponential(digits - 1).replace('e+', 'e');
};

export const formatHours = (h) => {
  if (typeof h !== 'number' || !Number.isFinite(h)) return 'n/a';
  return `${Number(h.toPrecision(5)).toLocaleString('en-US')} h (${Number((h / HOURS_PER_YEAR).toPrecision(3))} yr)`;
};

export const silLabel = (sil, state) => {
  if (state === PFD_STATE.NOT_SIL_RATED) return 'Not SIL rated';
  if (state === PFD_STATE.BELOW_SIL4_FLOOR) return 'SIL 4 (below the table floor)';
  if (sil === null || sil === undefined) return 'n/a';
  return `SIL ${sil}`;
};

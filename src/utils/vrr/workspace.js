/**
 * The Voidage Replacement Monitor's derived state, from the saved inputs
 * alone (VRR-U1, RL12: one model). The provider, the report, the ledger CSV
 * and the tests all call deriveVrr, so the screen, the PDF and the file say
 * the same thing.
 *
 * Inputs (the project payload's `inputs`, oilfield units always):
 *   fvf {Bo, Bw, Bg, Rs}, periods (manual grid), mode, wellRows (imported
 *   ledger), settings, pressureSurveys, pvtMode 'constant' | 'track' |
 *   'table', fluid (the correlation track), pvtIntake (a pvt-1 table kept
 *   with the project), patterns, allocation, plus the VRR-U1 additions
 *   identification, inputMeta, importInfo, pressureImportInfo, datum.
 *
 * Pure.
 */
import {
  computeVRRSeries, summarizeVRR,
  buildFieldPeriods, classifyLedgerWells, computeRollingVRR, flagPeriods,
  attachPressure, findFillUp, buildVoidageLedger, applyPeriodFvf, buildWellVoidage,
  validateAllocation, patternHasAllocation, buildPatternPeriods, recommendPatternInjection,
} from '@/utils/vrrCalculations';
import { derivePeriodFvf } from './pvtTrack';
import { periodFvfFromTable } from './pvtIntake';

export const FVF_KEYS = Object.freeze(['Bo', 'Bw', 'Bg', 'Rs']);
export const FVF_LABELS = Object.freeze({ Bo: 'Bo', Bw: 'Bw', Bg: 'Bg', Rs: 'Rs' });
export const DEFAULT_SETTINGS = Object.freeze({ targetBandMin: '1.0', targetBandMax: '1.2', rollingWindow: '3' });
export const FLUID_FIELDS = Object.freeze([
  { key: 'api', label: 'Oil gravity' },
  { key: 'gasSg', label: 'Gas gravity' },
  { key: 'gor', label: 'Solution GOR at the bubble point' },
  { key: 'salinityPpm', label: 'Water salinity' },
  { key: 'tempF', label: 'Reservoir temperature' },
]);
/** The correlations of the pressure track (src/utils/nodal/pvt.js on the Fluid Systems kit). */
export const TRACK_METHODS = Object.freeze({
  pb: 'Standing (bubble point)',
  rs: 'Standing',
  bo: 'Standing',
  bg: 'Bg = 0.00504 Z T / p RB/scf (x 1,000 to RB/Mscf), Z by Dranchuk-Abou-Kassem (1975) with Sutton pseudo-criticals (canonical engines, as Fluid Systems Studio)',
  bw: 'McCain (1990)',
});

const strictNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? '').trim();
  if (!s || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return NaN;
  return Number(s);
};

/**
 * VRR-U1-008: the constant FVF set must be typed and positive. A blank Bo
 * read as 0 (vrr.js num('') = 0) and dropped the oil term, so VRR rose with
 * no warning; "1,25" read as 1.
 */
export function checkFvf(fvf) {
  const errors = [];
  for (const k of FVF_KEYS) {
    const raw = fvf?.[k];
    const v = strictNumber(raw);
    if (!Number.isFinite(v)) errors.push(`${FVF_LABELS[k]} "${raw ?? ''}" is not a number.`);
    else if (k === 'Rs' ? v < 0 : v <= 0) errors.push(`${FVF_LABELS[k]} must be ${k === 'Rs' ? 'zero or more' : 'above zero'}.`);
  }
  return { ok: errors.length === 0, errors };
}

/** Grid cells that are not numbers (a blank is zero, as the engine reads it). */
export function checkPeriods(periods) {
  const issues = [];
  (periods || []).forEach((p, i) => {
    for (const k of ['Np', 'Wp', 'Gp', 'Wi', 'Gi', 'Bo', 'Bw', 'Bg', 'Rs']) {
      const raw = p?.[k];
      if (raw == null || String(raw).trim() === '') continue;
      const v = strictNumber(raw);
      if (!Number.isFinite(v)) issues.push({ row: i, key: k, text: `Period ${p.label || i + 1}: ${k} "${raw}" is not a number and reads as ${k.length === 2 && k[0] === 'B' ? 'the constant set' : 'zero'}.` });
      else if (v < 0) issues.push({ row: i, key: k, text: `Period ${p.label || i + 1}: ${k} is negative.` });
    }
  });
  return issues;
}

/**
 * The operator band and rolling window, each with what was used and why
 * (VRR-U1-017: '0' was read as the default with no word).
 */
export function resolveSettings(settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const notes = [];
  const read = (key, def, ok) => {
    const v = strictNumber(s[key]);
    if (Number.isFinite(v) && ok(v)) return v;
    notes.push(`${{ targetBandMin: 'Target VRR min', targetBandMax: 'Target VRR max', rollingWindow: 'Rolling window' }[key]} "${s[key] ?? ''}" is not usable; ${def} is used.`);
    return def;
  };
  let min = read('targetBandMin', 1.0, (v) => v >= 0);
  let max = read('targetBandMax', 1.2, (v) => v > 0);
  if (min > max) { notes.push(`Target VRR min ${min} is above max ${max}; the two are swapped.`); [min, max] = [max, min]; }
  const windowPeriods = Math.floor(read('rollingWindow', 3, (v) => v >= 1));
  return { targetBand: { min, max }, windowPeriods, notes };
}

/** The fluid of the correlation track, every field typed (VRR-U1-016: blanks fell back to 35 API and friends with no word). */
export function checkFluid(fluid) {
  const missing = FLUID_FIELDS.filter((f) => !Number.isFinite(strictNumber(fluid?.[f.key]))).map((f) => f.label);
  return { ok: missing.length === 0, missing };
}

/**
 * Everything the screen, the report and the CSV show.
 * @param {object} inputs the project inputs (oilfield units)
 */
export function deriveVrr(inputs) {
  const isImported = inputs.mode === 'imported';
  const basePeriods = isImported ? buildFieldPeriods(inputs.wellRows || []) : (inputs.periods || []);
  const periodsWithPressure = attachPressure(basePeriods, inputs.pressureSurveys || []);
  const hasPressure = periodsWithPressure.some((p) => p.pressure != null);
  const fvfCheck = checkFvf(inputs.fvf);
  const periodIssues = isImported ? [] : checkPeriods(inputs.periods);
  const { targetBand, windowPeriods, notes: settingsNotes } = resolveSettings(inputs.settings);

  // the FVF set of each period: constant, the correlation track, or the pvt-1 table
  const mode = ['track', 'table'].includes(inputs.pvtMode) ? inputs.pvtMode : 'constant';
  const pvt = { mode, active: false, overrides: null, warnings: [], withheld: null, outside: [], methods: null, range: null };
  const pressures = periodsWithPressure.map((p) => p.pressure);
  if (mode === 'track') {
    const fc = checkFluid(inputs.fluid);
    if (!hasPressure) pvt.withheld = 'No pressure attaches to the periods, so the constant FVF set applies to every period.';
    else if (!fc.ok) pvt.withheld = `The pressure track needs every fluid input; missing: ${fc.missing.join(', ')}. The constant FVF set applies until they are typed.`;
    else {
      const t = derivePeriodFvf(inputs.fluid, pressures);
      pvt.active = true;
      pvt.overrides = t.overrides;
      pvt.warnings = t.warnings || [];
      pvt.methods = TRACK_METHODS;
    }
  } else if (mode === 'table') {
    const rows = inputs.pvtIntake?.table;
    if (!Array.isArray(rows) || rows.length < 2) pvt.withheld = 'No PVT table was taken from Fluid Systems Studio, so the constant FVF set applies to every period.';
    else if (!hasPressure) pvt.withheld = 'No pressure attaches to the periods, so the constant FVF set applies to every period (the table needs a pressure to be read at).';
    else {
      const t = periodFvfFromTable(rows, pressures);
      pvt.active = true;
      pvt.overrides = t.overrides;
      pvt.outside = t.outside;
      pvt.range = t.range;
      pvt.methods = inputs.pvtIntake?.contract?.methods || null;
      if (t.outside.length) {
        pvt.warnings.push(`${t.outside.length} period${t.outside.length === 1 ? '' : 's'} (${t.outside.map((i) => periodsWithPressure[i].label).slice(0, 6).join(', ')}${t.outside.length > 6 ? ', ...' : ''}) lie outside the PVT table (${t.range[0]} to ${t.range[1]} psia) and keep the constant FVF set. The table is not extrapolated.`);
      }
    }
  }
  const effectivePeriods = pvt.active
    ? periodsWithPressure.map((p, i) => (pvt.overrides[i] ? { ...p, ...pvt.overrides[i] } : p))
    : periodsWithPressure;
  // per-period FVFs by label, for the patterns and their advice (VRR-U1-009)
  const periodFvfByLabel = pvt.active
    ? Object.fromEntries(periodsWithPressure.map((p, i) => [p.label, pvt.overrides[i]]).filter(([l, o]) => l && o))
    : null;

  const fvfNumbers = Object.fromEntries(FVF_KEYS.map((k) => [k, strictNumber(inputs.fvf?.[k])]));
  const series = computeVRRSeries(effectivePeriods, inputs.fvf || {});
  const ledger = buildVoidageLedger(effectivePeriods, inputs.fvf || {});
  const withheld = fvfCheck.ok ? null : `The constant FVF set is not usable: ${fvfCheck.errors.join(' ')} No VRR is shown until it is fixed.`;
  const summary = withheld ? null : summarizeVRR(series);
  const fillUp = withheld ? null : findFillUp(series);
  const rolling = computeRollingVRR(series, windowPeriods);
  const flags = withheld ? series.map(() => null) : flagPeriods(series, targetBand);
  const ledgerWells = isImported ? classifyLedgerWells(inputs.wellRows || []) : { injectors: [], producers: [] };
  // VRR-U2-002 and U2-004: voidage by well, free gas floored well by well
  // (printed beside the field figure; the headline stays at field level)
  const wellVoidage = isImported && !withheld && (inputs.wellRows || []).length
    ? buildWellVoidage(inputs.wellRows, inputs.fvf, periodFvfByLabel)
    : null;

  const allocation = inputs.allocation || {};
  const allocationCheck = validateAllocation(allocation);
  const patternAnalyses = !isImported ? [] : (inputs.patterns || []).map((pattern) => {
    if (withheld) return { pattern, withheld: true, reason: withheld };
    if (!allocationCheck.ok) return { pattern, withheld: true, reason: 'Allocation matrix has errors (a row sums above 1 or holds a bad value). Fix it first.' };
    if (!pattern.producers?.length) return { pattern, withheld: true, reason: 'No producers assigned to this pattern yet.' };
    if (!patternHasAllocation(pattern, allocation)) return { pattern, withheld: true, reason: 'No allocation factors route injection to this pattern. Fill the matrix; even splits are never assumed.' };
    const periods = applyPeriodFvf(buildPatternPeriods(inputs.wellRows, pattern, allocation), periodFvfByLabel);
    const pSeries = computeVRRSeries(periods, inputs.fvf);
    return {
      pattern,
      withheld: false,
      series: pSeries,
      rolling: computeRollingVRR(pSeries, windowPeriods),
      flags: flagPeriods(pSeries, targetBand),
      summary: summarizeVRR(pSeries),
      recommendation: recommendPatternInjection(inputs.wellRows, pattern, allocation, inputs.fvf, { targetVRR: targetBand.min, windowPeriods, periodFvf: periodFvfByLabel }),
    };
  });
  const live = patternAnalyses.filter((a) => !a.withheld && a.summary?.cumulativeVRR != null);
  const worstPattern = live.length ? live.reduce((w, a) => (a.summary.cumulativeVRR < w.summary.cumulativeVRR ? a : w)) : null;

  return {
    isImported, basePeriods, periodsWithPressure, hasPressure, pvt, effectivePeriods, periodFvfByLabel,
    fvfCheck, fvfNumbers, periodIssues, withheld, series, ledger, summary, fillUp, rolling, flags,
    targetBand, windowPeriods, settingsNotes, ledgerWells, wellVoidage, allocationCheck, patternAnalyses, worstPattern,
    // kept for the panels that read the older names
    trackActive: pvt.active, pvtTrack: pvt.active ? { overrides: pvt.overrides, warnings: pvt.warnings } : null,
  };
}

/**
 * Black-oil correlations matched to laboratory data (FLUID-U2-004; RL8).
 *
 * One stated linear adjustment per property, value = multiplier x
 * correlation + shift, the two-parameter match commercial black-oil
 * packages make of a correlation onto measured data:
 *   - the bubble point is set to the laboratory saturation pressure;
 *   - Rs below it is multiplier x correlation + shift, the shift fixed by
 *     the condition that Rs meets the solution GOR at the bubble point,
 *     and the multiplier fitted by least squares to the laboratory Rs rows
 *     (with no comparable Rs rows it is the one-point match of
 *     FLUID-U1-005: a multiplier alone);
 *     Below the lowest laboratory pressure of the fit the shift is tapered
 *     out, so Rs still returns to zero at atmospheric pressure;
 *   - Bo is multiplier x correlation + shift, both by least squares onto
 *     every laboratory Bo, above and below the bubble point (a multiplier
 *     alone for fewer than three rows);
 *   - the oil viscosity is multiplied by the least-squares multiplier in
 *     logarithms (the geometric mean of laboratory over model), since
 *     viscosity errors are proportional.
 * Bo and the viscosity are fitted after Rs, on the matched Rs. The error
 * of each property over every laboratory row, before and after, is
 * recorded with the match.
 *
 * Each fitted parameter comes with its uncertainty (FLUID-U2-008): the
 * standard error of the least-squares estimate and a Student t 95 percent
 * interval. A parameter fixed by one measurement has none, and says so.
 *
 * "Matched to lab" holds only while it holds: the record carries the
 * fingerprint of the fluid inputs, the correlation choice and the
 * laboratory data it was fitted on, and labMatchState says `stale` as soon
 * as one of them moves.
 *
 * Pure.
 */
import { analyzeFluidSystem, normalizeFluid, rsAt, oilAt, pbRsBoMethod, oilViscosityMethod } from '@/utils/fluidStudioCalculations';
import { studentT975 } from '@/utils/fluidstudio/eos/labTune';
import { labDataOf, labComparison, labSaturationPressure, labMisfit, labFingerprint, LAB_KINDS } from './labData.js';
import { fitThroughOrigin, fitTwoRegressors, meanWithError } from './leastSquares.js';
import { blackOilEvaluator } from './labReport.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** What a match was fitted on: when this text moves, the match no longer describes the fluid. */
export function labMatchFingerprint(inputs) {
  const bo = inputs?.streamA?.blackOil ?? {};
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const corr = inputs?.correlations?.pb_rs_bo || 'standing';
  const stage = (inputs?.separatorTrain?.stages || []).find((s) => s && s.enabled && Number(s.pressure) > 0) || null;
  return JSON.stringify({
    fluid: [n(bo.api), n(bo.gor), n(bo.gasSg), n(bo.temp)],
    correlations: [corr, inputs?.correlations?.viscosity || 'beggs_robinson'],
    // the first separator stage enters the Vasquez-Beggs gas gravity and nothing else (FLUID-U2-007)
    separator: corr === 'vasquez_beggs' && stage ? [Number(stage.pressure), n(stage.temperature)] : null,
    lab: labFingerprint(labDataOf(inputs)),
  });
}

/**
 * The state of the correlation match of a project.
 * @returns {{status: 'none'|'matched'|'stale'|'not-applied', applied: ?object, fit: ?object, reason: string}}
 */
export function labMatchState(inputs) {
  const m = inputs?.labMatch;
  if (!m?.applied) return { status: 'none', applied: null, fit: null, reason: '' };
  if (inputs?.blending?.enabled) {
    return { status: 'not-applied', applied: m.applied, fit: null, reason: 'Blending is on: the blend is another fluid than the one the laboratory measured, so the match is not applied.' };
  }
  if (m.fittedOn && m.fittedOn === labMatchFingerprint(inputs) && m.fit) return { status: 'matched', applied: m.applied, fit: m.fit, reason: '' };
  return {
    status: 'stale', applied: m.applied, fit: null,
    reason: 'The fluid inputs, the correlation choice, the first separator stage or the laboratory tables changed after the match. The multipliers are still applied, but the record of the match no longer describes this fluid. Match again, or remove the match.',
  };
}

const summary = (list, id) => {
  const m = list.find((x) => x.id === id);
  return m && m.n ? { n: m.n, meanAbsPct: m.meanAbsPct, biasPct: m.biasPct, maxAbsPct: m.maxAbsPct, maxAt: m.maxAt } : null;
};

/**
 * Fit the match.
 * @param {object} inputs the page state (any saved match is ignored)
 * @param {{at?: Date}} [opts]
 * @returns {{ok: boolean, reasons: string[], applied?: {pb: ?number, rsMult: ?number, rsShift: number,
 *   rsLowP: ?number, boMult: number, boShift: number, mu: number}, fittedOn?: string, fit?: object}}
 */
export function fitLabMatch(inputs, { at = new Date() } = {}) {
  const lab = labDataOf(inputs);
  const reasons = [];
  if (!lab.cce && !lab.dl && !lab.viscosity) return { ok: false, reasons: ['Load a laboratory table first.'] };
  if (inputs?.blending?.enabled) return { ok: false, reasons: ['Blending is on. The blend is another fluid than the one the laboratory measured: switch blending off to match the correlations.'] };
  const base = { ...inputs, labMatch: undefined, streamA: { ...inputs.streamA, blackOil: { ...inputs.streamA.blackOil } } };
  const before = analyzeFluidSystem(base);
  if (!before?.pvt?.kpis) return { ok: false, reasons: ['Enter API, GOR, gas gravity and temperature first.'] };
  const fluid0 = normalizeFluid(base);
  for (const k of ['cce', 'dl', 'viscosity']) {
    const t = lab[k];
    if (t && finite(t.tempF) && Math.abs(t.tempF - fluid0.temp) > 1) {
      reasons.push(`The ${LAB_KINDS[k].label.toLowerCase()} was measured at ${t.tempF} degF and the model is at ${fluid0.temp} degF. Set the reservoir temperature to the temperature of the test before matching.`);
    }
  }
  if (reasons.length) return { ok: false, reasons };

  const cmp = labComparison(lab);
  const sat = labSaturationPressure(lab);
  const notes = [];

  const param = (value, n, se, dof) => {
    const ok = se !== null && finite(se) && dof >= 1;
    const t = ok ? studentT975(dof) : null;
    return { value, n, standardError: ok ? se : null, ci95: ok ? [value - t * se, value + t * se] : null };
  };

  // 1. the bubble point, and Rs below it
  const pbLab = sat ? sat.pressure : null;
  if (pbLab == null) notes.push('The laboratory tables state no saturation pressure, so the bubble point and the Rs correlation are left as they were.');
  const pb = pbLab ?? before.pvt.pb;
  const rsb = fluid0.rsb;
  let rs = { mult: null, shift: 0, n: 0, fitted: false, p: null };
  if (pbLab != null) {
    const fb = rsAt(pbLab, fluid0);
    const onePoint = fb > 0 ? rsb / fb : 1;
    rs = { mult: onePoint, shift: 0, n: 1, fitted: false, p: null };
    const rows = cmp.comparable.rs ? cmp.points.rs.filter((q) => q.pressure < pbLab - 0.5) : [];
    if (rows.length >= 2) {
      // Rs - Rsb = m (f - fb): the line through the bubble point
      const fit = fitThroughOrigin(rows.map((q) => rsAt(q.pressure, fluid0) - fb), rows.map((q) => q.value - rsb));
      if (fit && fit.b > 0 && finite(fit.b)) {
        rs = { mult: fit.b, shift: rsb - fit.b * fb, n: rows.length, fitted: true, lowP: Math.min(...rows.map((q) => q.pressure)), p: param(fit.b, rows.length, fit.se, fit.dof) };
      }
    } else if (lab.dl && !cmp.comparable.rs) {
      notes.push('Rs and Bo are not fitted to the differential liberation rows: they are per barrel of residual oil. Enter the separator test Bofb and Rsfb, or mark the table as already on the separator basis. The bubble point is matched, with one multiplier on Rs.');
    }
  }
  // with no laboratory bubble point the fluid is the one the table already has (a typed bubble point keeps its scale)
  const fluid1 = pbLab != null
    ? { ...fluid0, pb, rsScale: rs.mult ?? 1, rsShift: rs.shift, ...(rs.lowP ? { rsLowP: rs.lowP } : {}) }
    : { ...before.meta.fluid };

  // 2. Bo: multiplier and shift by least squares onto every laboratory Bo.
  // Below the bubble point Bo = a x correlation + b; above it the matched
  // Bo(Pb) carries the undersaturated factor g(p), so Bo = a (x g) + b g:
  // still linear in a and b, and one fit covers both sides.
  let bo = { mult: 1, shift: 0, n: 0, pMult: null, pShift: null };
  const boPts = cmp.comparable.bo ? cmp.points.bo.filter((q) => q.value > 0) : [];
  if (boPts.length) {
    const at = boPts.map((q) => oilAt(q.pressure, fluid1, pb));
    const x1 = at.map((o) => o.bo); // the unmatched model value (multiplier 1, shift 0)
    const x2 = at.map((o) => o.boShape);
    const y = boPts.map((q) => q.value);
    const n = boPts.length;
    const two = n >= 3 ? fitTwoRegressors(x1, x2, y) : null;
    if (two && two.a > 0) {
      bo = { mult: two.a, shift: two.b, n, pMult: param(two.a, n, two.seA, two.dof), pShift: param(two.b, n, two.seB, two.dof) };
    } else {
      const one = fitThroughOrigin(x1, y);
      bo = { mult: one.b, shift: 0, n, pMult: param(one.b, n, one.se, one.dof), pShift: null };
    }
  }

  // 3. oil viscosity: least squares in logarithms over every laboratory row, on the matched Rs
  let mu = { mult: 1, n: 0, p: null };
  const muPts = cmp.points.muo.filter((q) => q.value > 0);
  if (muPts.length) {
    const est = meanWithError(muPts.map((q) => Math.log(q.value / oilAt(q.pressure, fluid1, pb).muO)));
    const k = Math.exp(est.mean);
    mu = { mult: k, n: muPts.length, p: { value: k, n: muPts.length, standardError: null, ci95: null } };
    if (est.se !== null) {
      const t = studentT975(est.dof);
      mu.p = { value: k, n: muPts.length, standardError: k * est.se, ci95: [Math.exp(est.mean - t * est.se), Math.exp(est.mean + t * est.se)] };
    }
  }

  if (pbLab == null && !bo.n && !mu.n) {
    return { ok: false, reasons: ['The laboratory tables hold nothing the correlations can be matched to: no saturation pressure, no Bo on the separator basis and no oil viscosity.', ...notes] };
  }

  const applied = { pb: pbLab, rsMult: rs.mult, rsShift: rs.shift, rsLowP: rs.lowP ?? null, boMult: bo.mult, boShift: bo.shift, mu: mu.mult };
  const matchedInputs = { ...base, labMatch: { applied } };
  const after = analyzeFluidSystem(matchedInputs);
  const mBefore = labMisfit({ labData: lab, rows: before.pvt.table, pb: before.pvt.pb, evaluate: blackOilEvaluator(before) });
  const mAfter = labMisfit({ labData: lab, rows: after.pvt.table, pb: after.pvt.pb, evaluate: blackOilEvaluator(after) });

  const prb = pbRsBoMethod(fluid0).label;
  const visc = oilViscosityMethod(fluid0).label;
  const matched = [];
  if (pbLab != null) {
    matched.push({
      id: 'pb', label: 'Bubble point pressure', kind: 'pressure', n: 1,
      lab: pbLab, before: before.pvt.pb, after: after.pvt.pb,
      errorBefore: (100 * (before.pvt.pb - pbLab)) / pbLab, errorAfter: (100 * (after.pvt.pb - pbLab)) / pbLab,
    });
  }
  for (const [id, label] of [['rs', 'Solution GOR Rs'], ['bo', 'Oil formation volume factor Bo'], ['muo', 'Oil viscosity']]) {
    const b = summary(mBefore, id);
    const a = summary(mAfter, id);
    if (!b && !a) continue;
    matched.push({ id, label, n: a?.n ?? b?.n ?? 0, before: b, after: a, basis: (mAfter.find((x) => x.id === id) || {}).basis || '' });
  }

  const one = 'Fixed by one measurement: no interval can be stated';
  const parameters = [];
  if (pbLab != null) {
    parameters.push({
      key: 'rsMult', label: `Rs multiplier (${prb})`, unit: '', value: rs.mult, n: rs.n,
      standardError: rs.p?.standardError ?? null, ci95: rs.p?.ci95 ?? null,
      how: rs.fitted ? `Least squares onto ${rs.n} laboratory Rs values below the bubble point` : 'Set by the laboratory saturation pressure: Rs meets the solution GOR there',
      uncertainty: rs.fitted ? '' : one,
    });
    parameters.push({
      key: 'rsShift', label: 'Rs shift', unit: 'scf/STB', value: rs.shift, n: rs.n, standardError: null, ci95: null,
      how: rs.fitted ? 'Follows from the multiplier: Rs meets the solution GOR at the laboratory bubble point' : 'None: a multiplier alone',
      uncertainty: rs.fitted ? 'Tied to the multiplier by the bubble point condition' : '',
    });
  }
  if (bo.n) {
    parameters.push({
      key: 'boMult', label: `Bo multiplier (${prb})`, unit: '', value: bo.mult, n: bo.n, standardError: bo.pMult?.standardError ?? null, ci95: bo.pMult?.ci95 ?? null,
      how: `Least squares onto ${bo.n} laboratory Bo value${bo.n === 1 ? '' : 's'}, above and below the bubble point`, uncertainty: bo.pMult?.ci95 ? '' : one,
    });
    parameters.push({
      key: 'boShift', label: 'Bo shift', unit: 'RB/STB', value: bo.shift, n: bo.n, standardError: bo.pShift?.standardError ?? null, ci95: bo.pShift?.ci95 ?? null,
      how: bo.pShift ? 'Fitted with the multiplier' : 'None: fewer than three laboratory values, a multiplier alone', uncertainty: '',
    });
  }
  if (mu.n) {
    parameters.push({
      key: 'mu', label: `Oil viscosity multiplier (${visc})`, unit: '', value: mu.mult, n: mu.n, standardError: mu.p?.standardError ?? null, ci95: mu.p?.ci95 ?? null,
      how: `Least squares in logarithms onto ${mu.n} laboratory value${mu.n === 1 ? '' : 's'}, above and below the bubble point`, uncertainty: mu.p?.ci95 ? '' : one,
    });
  }

  const fit = {
    at: at instanceof Date ? at.toISOString() : String(at),
    correlations: { pb_rs_bo: prb, viscosity: visc },
    pb: { laboratory: pbLab, correlation: before.pvt.pb, from: sat?.from ?? null },
    oilBasis: cmp.basis.oil,
    parameters,
    matched,
    notes,
  };
  return { ok: true, reasons: [], applied, fittedOn: labMatchFingerprint(base), fit };
}

/** The match as inputs.labMatch holds it. */
export const labMatchRecord = (fitted) => (fitted?.ok ? { applied: fitted.applied, fittedOn: fitted.fittedOn, fit: fitted.fit } : null);

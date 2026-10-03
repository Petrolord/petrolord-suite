/**
 * FLUID-U2-004 and -008: the black-oil correlations matched to laboratory
 * data, with the uncertainty of each fitted parameter, and a status that
 * holds only while the match describes the fluid.
 *
 * No published worked example of a two-parameter correlation match could
 * be read, so the match is gated on what it must satisfy by construction:
 *   - the least-squares routines it calls reproduce the certified values of
 *     the NIST Statistical Reference Datasets (estimates and their standard
 *     deviations), which is where the stated uncertainty comes from;
 *   - a laboratory table generated from the engine with known parameters
 *     is recovered;
 *   - the matched table meets the solution GOR at the laboratory bubble
 *     point and is continuous there;
 *   - no neighbouring parameter value fits the laboratory rows better.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { readPdf, flat } from '@/lib/reportKit/testKit';
import { missingInputRows } from '@/lib/reportKit/completeness';
import { validatePvtContract, pvtContractSourceText, pvtContractTuningText, describePvtContract } from '@/lib/inputProvenance/pvtContract';
import { analyzeFluidSystem, computePvtTable, normalizeFluid, oilAt, saturatedRs, rsAt } from '@/utils/fluidStudioCalculations';
import { fitThroughOrigin, fitTwoRegressors, meanWithError } from '@/utils/fluidstudio/leastSquares';
import { fitLabMatch, labMatchRecord, labMatchState, labMatchFingerprint } from '@/utils/fluidstudio/labMatch';
import { labDataOf, labComparison, emptyLabData } from '@/utils/fluidstudio/labData';
import LabMatchCard from '@/components/fluidstudio/LabMatchCard';
import { blackOilMatchSection } from '@/utils/fluidstudio/reportModel';
import { fluidUnits } from '@/utils/fluidstudio/units';
import { goodOilBlackOil, matched, run, pdfOf, AT } from './fluidTestKit';

const ATM = 14.696;

describe('GATE: the least-squares routines against the NIST Statistical Reference Datasets', () => {
  // NIST/ITL StRD, Linear Least Squares Regression (itl.nist.gov/div898/strd). Certified values to 15 digits.
  it('NoInt1 (y = B1 x): the estimate, its standard deviation and the residual standard deviation', () => {
    const x = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
    const y = [130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140];
    const f = fitThroughOrigin(x, y);
    expect(f.b).toBeCloseTo(2.07438016528926, 12);
    expect(f.se).toBeCloseTo(0.0165289256198347, 12);
    expect(f.residualSd).toBeCloseTo(3.56753034006338, 11);
    expect(f.dof).toBe(10);
    // negative control: dividing by n in place of n - 1 misses the certified standard deviation
    const wrong = Math.sqrt(f.ssr / 11 / x.reduce((s, v) => s + v * v, 0));
    expect(Math.abs(wrong - 0.0165289256198347)).toBeGreaterThan(5e-4);
  });

  it('Norris (y = B0 + B1 x, 36 observations): both estimates and both standard deviations', () => {
    const data = [
      [0.1, 0.2], [338.8, 337.4], [118.1, 118.2], [888.0, 884.6], [9.2, 10.1], [228.1, 226.5], [668.5, 666.3], [998.5, 996.3], [449.1, 448.6],
      [778.9, 777.0], [559.2, 558.2], [0.3, 0.4], [0.1, 0.6], [778.1, 775.5], [668.8, 666.9], [339.3, 338.0], [448.9, 447.5], [10.8, 11.6],
      [557.7, 556.0], [228.3, 228.1], [998.0, 995.8], [888.8, 887.6], [119.6, 120.2], [0.3, 0.3], [0.6, 0.3], [557.6, 556.8], [339.3, 339.1],
      [888.0, 887.2], [998.5, 999.0], [778.9, 779.0], [10.2, 11.1], [117.6, 118.3], [228.9, 229.2], [668.4, 669.1], [449.2, 448.9], [0.2, 0.5],
    ];
    const y = data.map((d) => d[0]);
    const x = data.map((d) => d[1]);
    const f = fitTwoRegressors(x, x.map(() => 1), y);
    expect(f.a).toBeCloseTo(1.00211681802045, 11);
    expect(f.b).toBeCloseTo(-0.262323073774029, 9);
    expect(f.seA).toBeCloseTo(0.000429796848199937, 12);
    expect(f.seB).toBeCloseTo(0.232818234301152, 9);
    expect(f.residualSd).toBeCloseTo(0.884796396144373, 10);
    expect(f.dof).toBe(34);
  });

  it('refuses what it cannot fit, and states no error where there is none to state', () => {
    expect(fitThroughOrigin([0, 0], [1, 2])).toBeNull();
    expect(fitThroughOrigin([2], [3])).toMatchObject({ b: 1.5, se: null, dof: 0 });
    expect(fitTwoRegressors([1, 1, 1], [1, 1, 1], [1, 2, 3])).toBeNull(); // the two regressors are the same
    expect(fitTwoRegressors([1, 2], [1, 1], [3, 5])).toMatchObject({ dof: 0, seA: null, seB: null });
    expect(meanWithError([2])).toEqual({ mean: 2, se: null, dof: 0 });
    expect(meanWithError([1, 3])).toMatchObject({ mean: 2, dof: 1 });
    expect(meanWithError([1, 3]).se).toBeCloseTo(1, 12);
    expect(meanWithError([])).toBeNull();
  });
});

/** A laboratory data set made from the engine: the unmatched table moved by known parameters. */
function syntheticLab(inputs, { pbLab, m, a, b, k }) {
  const fluid0 = normalizeFluid({ ...inputs, labMatch: undefined, labData: undefined });
  const fb = rsAt(pbLab, fluid0); // the correlation itself at the laboratory bubble point
  const truth = { ...fluid0, pb: pbLab, rsScale: m, rsShift: fluid0.rsb - m * fb, rsLowP: 300 };
  const pressures = [5000, 4500, 4000, 3500, pbLab, 2400, 2100, 1800, 1500, 1200, 900, 600, 300];
  const rows = pressures.map((p) => {
    const o = oilAt(p, truth, pbLab);
    return { pressure: p, Rs: o.rs, Bo: a * o.bo + b * o.boShape, mu_o: k * o.muO };
  });
  return { ...emptyLabData(), dlBasis: 'separator', dl: { kind: 'dl', rows, tempF: fluid0.temp, source: { name: 'synthetic' } } };
}

describe('GATE: a laboratory table made with known parameters is recovered', () => {
  const base = goodOilBlackOil();
  const truth = { pbLab: 2800, m: 0.85, a: 0.93, b: 0.09, k: 1.2 };
  const inputs = { ...base, labData: syntheticLab(base, truth) };
  const fitted = fitLabMatch(inputs, { at: AT });

  it('recovers the bubble point, the Rs multiplier, the Bo multiplier and shift and the viscosity multiplier', () => {
    expect(fitted.ok).toBe(true);
    expect(fitted.applied.pb).toBe(2800);
    expect(fitted.applied.rsMult).toBeCloseTo(0.85, 9);
    expect(fitted.applied.boMult).toBeCloseTo(0.93, 8);
    expect(fitted.applied.boShift).toBeCloseTo(0.09, 8);
    expect(fitted.applied.mu).toBeCloseTo(1.2, 9);
    expect(fitted.applied.rsLowP).toBe(300);
  });

  it('after the match the table reproduces the laboratory rows; before it did not', () => {
    const rows = Object.fromEntries(fitted.fit.matched.map((m) => [m.id, m]));
    expect(rows.pb.errorBefore).toBeLessThan(-5);
    expect(Math.abs(rows.pb.errorAfter)).toBeLessThan(1e-9);
    for (const id of ['rs', 'bo', 'muo']) {
      expect(rows[id].before.meanAbsPct).toBeGreaterThan(1);
      // what is left is the rounding of the printed table (Rs to 0.01, Bo and viscosity to 4 decimals)
      expect(rows[id].after.meanAbsPct).toBeLessThan(0.02);
    }
  });

  it('an exact table leaves no uncertainty; the intervals are of zero width around the truth', () => {
    const p = Object.fromEntries(fitted.fit.parameters.map((x) => [x.key, x]));
    expect(p.rsMult.ci95[1] - p.rsMult.ci95[0]).toBeLessThan(1e-6);
    expect(p.boMult.ci95[1] - p.boMult.ci95[0]).toBeLessThan(1e-6);
    expect(p.mu.ci95[1] - p.mu.ci95[0]).toBeLessThan(1e-6);
  });

  it('negative control: the same table with the shift applied the wrong way round is not recovered', () => {
    // a Bo shift subtracted where the engine adds it: the after error is far from zero
    const boAt2100 = (applied) => {
      const fluid = analyzeFluidSystem({ ...inputs, labMatch: { applied } }).meta.fluid;
      return oilAt(2100, fluid, fluid.pb).bo;
    };
    const lab = inputs.labData.dl.rows.find((r) => r.pressure === 2100);
    expect(Math.abs(boAt2100({ ...fitted.applied, boShift: -fitted.applied.boShift }) - lab.Bo)).toBeGreaterThan(0.15);
    expect(Math.abs(boAt2100(fitted.applied) - lab.Bo)).toBeLessThan(1e-8);
  });

  it('noise in the laboratory rows widens the intervals, and they hold the truth', () => {
    // a fixed pattern of +-0.5 percent on Bo and +-3 percent on viscosity
    const noisy = { ...inputs, labData: { ...inputs.labData, dl: { ...inputs.labData.dl, rows: inputs.labData.dl.rows.map((r, i) => ({ ...r, Bo: r.Bo * (1 + 0.005 * Math.sin(1.7 * i + 0.3)), mu_o: r.mu_o * (1 + 0.03 * Math.cos(2.3 * i)) })) } } };
    const f = fitLabMatch(noisy, { at: AT });
    const p = Object.fromEntries(f.fit.parameters.map((x) => [x.key, x]));
    expect(p.boMult.ci95[0]).toBeLessThan(0.93);
    expect(p.boMult.ci95[1]).toBeGreaterThan(0.93);
    expect(p.boMult.ci95[1] - p.boMult.ci95[0]).toBeGreaterThan(0.005);
    expect(p.mu.ci95[0]).toBeLessThan(1.2);
    expect(p.mu.ci95[1]).toBeGreaterThan(1.2);
    expect(p.boShift.ci95[0]).toBeLessThan(0.09);
    expect(p.boShift.ci95[1]).toBeGreaterThan(0.09);
  });
});

describe('the published study: Good Oil Co. Well No. 4', () => {
  const inputs = goodOilBlackOil();
  const fitted = fitLabMatch(inputs, { at: AT });
  const withMatch = { ...inputs, labMatch: labMatchRecord(fitted) };
  const results = analyzeFluidSystem(withMatch);
  const rows = Object.fromEntries(fitted.fit.matched.map((m) => [m.id, m]));

  it('every matched property is closer to the laboratory after the match than before', () => {
    expect(fitted.ok).toBe(true);
    expect(rows.pb.lab).toBeCloseTo(2620 + ATM, 9);
    expect(Math.abs(rows.pb.errorAfter)).toBeLessThan(1e-9);
    for (const id of ['rs', 'bo', 'muo']) {
      expect(rows[id].after.meanAbsPct).toBeLessThan(rows[id].before.meanAbsPct);
      expect(rows[id].after.maxAbsPct).toBeLessThan(rows[id].before.maxAbsPct);
    }
    // pinned: Standing and Beggs-Robinson on this study
    expect(rows.rs.before.meanAbsPct).toBeCloseTo(22.1, 0);
    expect(rows.rs.after.meanAbsPct).toBeLessThan(3.5);
    expect(rows.bo.after.meanAbsPct).toBeLessThan(0.5);
    expect(rows.muo.after.meanAbsPct).toBeLessThan(5.5);
  });

  it('the matched table meets the solution GOR at the laboratory bubble point and is continuous there', () => {
    const k = results.pvt.kpis;
    expect(results.meta.pbSource).toBe('lab');
    expect(results.pvt.pb).toBeCloseTo(2634.696, 9);
    const fluid = results.meta.fluid;
    expect(saturatedRs(2634.696, fluid)).toBeCloseTo(768, 9);
    const below = oilAt(2634.696 - 1e-6, fluid, 2634.696);
    const above = oilAt(2634.696 + 1e-6, fluid, 2634.696);
    expect(Math.abs(below.bo - above.bo)).toBeLessThan(1e-6);
    expect(Math.abs(below.muO - above.muO)).toBeLessThan(1e-6);
    // the laboratory Bofb is 1.474: within 0.2 percent after the match (it was 0.9 percent off)
    expect(Math.abs(k.bo_at_pb - 1.474) / 1.474).toBeLessThan(0.002);
  });

  it('Rs rises with pressure all the way, and returns to nearly zero at atmospheric pressure', () => {
    const fluid = results.meta.fluid;
    let prev = -1;
    for (let p = 14.7; p <= 2634.696; p += 20) {
      const rs = saturatedRs(p, fluid);
      expect(rs).toBeGreaterThanOrEqual(prev);
      prev = rs;
    }
    // below the lowest laboratory pressure Rs follows the correlation, which itself leaves a few scf/STB at 14.7 psia
    expect(saturatedRs(14.7, fluid)).toBeLessThan(0.2 * saturatedRs(fluid.rsLowP, fluid));
    expect(saturatedRs(14.7, fluid)).toBeLessThan(25);
    expect(fluid.rsShift).toBeGreaterThan(50); // a shift is there: the taper is what brings Rs back to zero
    // continuous at the lowest laboratory pressure of the fit
    const low = fluid.rsLowP;
    expect(low).toBeCloseTo(159 + ATM, 9);
    expect(Math.abs(saturatedRs(low - 1e-6, fluid) - saturatedRs(low + 1e-6, fluid))).toBeLessThan(1e-3);
  });

  it('GATE: no neighbouring parameter value fits the laboratory rows better', () => {
    const lab = labComparison(labDataOf(inputs));
    const ssr = (applied) => {
      const fluid = analyzeFluidSystem({ ...inputs, labMatch: { applied } }).meta.fluid;
      const of = (pts, key) => pts.reduce((s, q) => s + (oilAt(q.pressure, fluid, fluid.pb)[key] - q.value) ** 2, 0);
      const logs = lab.points.muo.reduce((s, q) => s + Math.log(oilAt(q.pressure, fluid, fluid.pb).muO / q.value) ** 2, 0);
      return { rs: of(lab.points.rs.filter((q) => q.pressure < fluid.pb - 0.5), 'rs'), bo: of(lab.points.bo, 'bo'), mu: logs };
    };
    const best = ssr(fitted.applied);
    for (const d of [0.99, 1.01]) {
      // the Rs multiplier moves its shift with it (Rs still meets Rsb at the bubble point)
      expect(ssr({ ...fitted.applied, rsMult: fitted.applied.rsMult * d, rsShift: undefined }).rs).toBeGreaterThan(best.rs);
      expect(ssr({ ...fitted.applied, boMult: fitted.applied.boMult * d }).bo).toBeGreaterThan(best.bo);
      expect(ssr({ ...fitted.applied, mu: fitted.applied.mu * d }).mu).toBeGreaterThan(best.mu);
    }
    for (const d of [-0.005, 0.005]) expect(ssr({ ...fitted.applied, boShift: fitted.applied.boShift + d }).bo).toBeGreaterThan(best.bo);
  });

  it('the uncertainty of each fitted parameter is stated, and a parameter fixed by one condition says so', () => {
    const p = Object.fromEntries(fitted.fit.parameters.map((x) => [x.key, x]));
    expect(p.rsMult.n).toBe(10);
    expect(p.rsMult.ci95[0]).toBeLessThan(p.rsMult.value);
    expect(p.rsMult.ci95[1]).toBeGreaterThan(p.rsMult.value);
    expect(p.rsShift.ci95).toBeNull();
    expect(p.rsShift.uncertainty).toBe('Tied to the multiplier by the bubble point condition');
    expect(p.boMult.n).toBe(20);
    expect(p.boShift.ci95[1] - p.boShift.ci95[0]).toBeGreaterThan(0.01);
    expect(p.mu.n).toBe(18);
    // the interval is value +- t(0.975, dof) standard errors: 18 points, 17 degrees of freedom, t = 2.110 (in logarithms)
    expect(Math.log(p.mu.ci95[1] / p.mu.value)).toBeCloseTo(2.110 * (p.mu.standardError / p.mu.value), 9);
    // 20 points, two parameters: 18 degrees of freedom, t = 2.101
    expect(p.boMult.ci95[1] - p.boMult.value).toBeCloseTo(2.101 * p.boMult.standardError, 9);
  });

  it('with all three correlation sets the match improves every property', () => {
    for (const corr of ['vasquez_beggs', 'glaso']) {
      const other = goodOilBlackOil();
      other.correlations.pb_rs_bo = corr;
      const f = fitLabMatch(other, { at: AT });
      const r = Object.fromEntries(f.fit.matched.map((m) => [m.id, m]));
      for (const id of ['rs', 'bo', 'muo']) expect(r[id].after.meanAbsPct).toBeLessThan(r[id].before.meanAbsPct);
    }
  });
});

describe('what cannot be matched is refused or left alone, with the reason', () => {
  it('no laboratory table, a blend, another temperature', () => {
    const none = goodOilBlackOil();
    none.labData = undefined;
    expect(fitLabMatch(none).reasons[0]).toMatch(/Load a laboratory table first/);
    const blend = goodOilBlackOil();
    blend.blending = { enabled: true, streamB_fraction: 30 };
    expect(fitLabMatch(blend).reasons[0]).toMatch(/Blending is on/);
    const cold = goodOilBlackOil();
    cold.streamA.blackOil.temp = 180;
    const f = fitLabMatch(cold);
    expect(f.ok).toBe(false);
    expect(f.reasons.join(' ')).toMatch(/was measured at 220 degF and the model is at 180 degF/);
  });

  it('differential rows with no separator test: the bubble point and the viscosity are matched, Bo and Rs rows are not fitted', () => {
    const f = fitLabMatch(goodOilBlackOil({ separator: false }), { at: AT });
    expect(f.ok).toBe(true);
    expect(f.applied.pb).toBeCloseTo(2634.696, 9);
    expect(f.applied.rsShift).toBe(0);
    expect(f.applied.boMult).toBe(1);
    expect(f.applied.boShift).toBe(0);
    expect(f.applied.mu).not.toBe(1);
    expect(f.fit.notes.join(' ')).toMatch(/Rs and Bo are not fitted to the differential liberation rows/);
    expect(f.fit.parameters.find((p) => p.key === 'rsMult').uncertainty).toBe('Fixed by one measurement: no interval can be stated');
  });

  it('a viscosity table alone: only the viscosity is matched; the bubble point stays solved', () => {
    const inputs = goodOilBlackOil();
    inputs.labData = { ...inputs.labData, cce: null, dl: null };
    const f = fitLabMatch(inputs, { at: AT });
    expect(f.ok).toBe(true);
    expect(f.applied.pb).toBeNull();
    const r = analyzeFluidSystem({ ...inputs, labMatch: labMatchRecord(f) });
    expect(r.meta.pbSource).toBe('solved');
    expect(r.meta.fluid.rsScale).toBe(1);
    expect(r.meta.fluid.match.mu).toBeCloseTo(f.applied.mu, 12);
  });
});

describe('"Matched to lab" holds only while it holds', () => {
  const inputs = matched(goodOilBlackOil());

  it('matched: the status, the fingerprint, and edits that do not touch the fluid', () => {
    expect(labMatchState(inputs).status).toBe('matched');
    expect(inputs.labMatch.fittedOn).toBe(labMatchFingerprint(inputs));
    const renamed = { ...inputs, identification: { ...inputs.identification, analyst: 'Someone else' }, unitSystem: 'si', flowAssurance: { measuredWat: 95 } };
    expect(labMatchState(renamed).status).toBe('matched');
    // Standing does not read the separator stage, so a stage edit leaves the match standing
    const stage = { ...inputs, separatorTrain: { stages: [{ pressure: 300, temperature: 100, enabled: true }] } };
    expect(labMatchState(stage).status).toBe('matched');
  });

  it.each([
    ['the API gravity', (i) => ({ ...i, streamA: { ...i.streamA, blackOil: { ...i.streamA.blackOil, api: 39 } } })],
    ['the solution GOR', (i) => ({ ...i, streamA: { ...i.streamA, blackOil: { ...i.streamA.blackOil, gor: 800 } } })],
    ['the temperature', (i) => ({ ...i, streamA: { ...i.streamA, blackOil: { ...i.streamA.blackOil, temp: 221 } } })],
    ['the correlation choice', (i) => ({ ...i, correlations: { ...i.correlations, pb_rs_bo: 'glaso' } })],
    ['the viscosity correlation', (i) => ({ ...i, correlations: { ...i.correlations, viscosity: 'beal_cook_spillman' } })],
    ['a laboratory row', (i) => ({ ...i, labData: { ...i.labData, dl: { ...i.labData.dl, rows: i.labData.dl.rows.map((r, n) => (n === 3 ? { ...r, Bo: r.Bo + 0.01 } : r)) } } })],
    ['the separator test', (i) => ({ ...i, labData: { ...i.labData, separatorTest: { bofb: 1.48, rsfb: 768 } } })],
    ['a removed table', (i) => ({ ...i, labData: { ...i.labData, viscosity: null } })],
  ])('stale when %s changes: the status, the report, the contract and the consumer text all withdraw the claim', (_what, edit) => {
    const moved = edit(inputs);
    const st = labMatchState(moved);
    expect(st.status).toBe('stale');
    expect(st.fit).toBeNull();
    const ws = run(moved);
    expect(ws.report.model.tuning.status).toBe('stale');
    expect(ws.report.model.tuning.text).toMatch(/^Matched, not confirmed\./);
    expect(ws.report.model.tuning.table).toBeNull();
    expect(ws.contract.tuning.status).toBe('stale');
    expect(ws.contract.tuning.matched).toBeUndefined();
    expect(pvtContractTuningText(ws.contract)).toBe('correlation multipliers of a lab match applied, but the inputs or the lab data changed after the match');
    expect(pvtContractSourceText(ws.contract, 'bo')).not.toMatch(/correlations matched to lab data/);
  });

  it('with Vasquez-Beggs the first separator stage is part of the fingerprint', () => {
    const vb = goodOilBlackOil();
    vb.correlations.pb_rs_bo = 'vasquez_beggs';
    const m = matched(vb);
    expect(labMatchState(m).status).toBe('matched');
    expect(labMatchState({ ...m, separatorTrain: { stages: [{ pressure: 300, temperature: 100, enabled: true }] } }).status).toBe('stale');
  });

  it('blending on: the saved match is not applied, and the engine says so', () => {
    const blend = { ...inputs, blending: { enabled: true, streamB_fraction: 30 } };
    expect(labMatchState(blend).status).toBe('not-applied');
    const r = analyzeFluidSystem(blend);
    expect(r.meta.fluid.match).toBeUndefined();
    expect(r.meta.pbSource).toBe('solved');
    expect(r.meta.warnings.join(' ')).toMatch(/It is not applied to the blend/);
    expect(run(blend).contract.tuning).toEqual({ status: 'none' });
  });

  it('removing the match returns the table to the unmatched correlations exactly', () => {
    const plain = goodOilBlackOil();
    const removed = { ...inputs, labMatch: undefined };
    expect(analyzeFluidSystem(removed).pvt).toEqual(analyzeFluidSystem(plain).pvt);
    expect(labMatchState(removed).status).toBe('none');
    // and a fluid that never had a match is untouched by the new code path
    const fluid = normalizeFluid(plain);
    expect(fluid.match).toBeUndefined();
    expect(fluid.pbFrom).toBeUndefined();
    expect(computePvtTable({ ...fluid, pb: 2503 }).kpis.bo_at_pb).toBe(1.4873);
  });
});

describe('the report, the methods and the pvt-1 block carry the match', () => {
  const inputs = matched(goodOilBlackOil());
  const ws = run(inputs, { projectName: 'Good Oil Well No. 4 PVT' });
  const built = pdfOf(ws);
  let pdf;
  beforeAll(() => { pdf = readPdf(built.doc); });
  afterAll(() => pdf.close?.());

  it('the methods name the multiplier and shift beside the correlation', () => {
    const m = Object.fromEntries(ws.results.meta.methods.map((x) => [x.key, x]));
    const a = inputs.labMatch.applied;
    expect(m.pb.method).toBe('Laboratory saturation pressure (correlation match)');
    expect(m.pb.kind).toBe('lab');
    expect(m.rs.method).toBe(`Standing, multiplied by ${a.rsMult.toFixed(4)} plus ${a.rsShift.toFixed(1)} scf/STB (laboratory match)`);
    expect(m.bo.method).toBe(`Standing, multiplied by ${a.boMult.toFixed(4)} plus ${a.boShift.toFixed(4)} RB/STB (laboratory match)`);
    expect(m.mu_o.method).toBe(`Beggs-Robinson, multiplied by ${a.mu.toFixed(4)} (laboratory match)`);
    expect(m.mu_od.method).toBe(m.mu_o.method);
    expect(m.pb.note).toMatch(/Below 174 psia, the lowest laboratory pressure of the fit, Rs follows the correlation scaled to meet the matched curve there\./);
    const text = flat(pdf.text);
    expect(text).toContain('(laboratory match)');
  });

  it('the report states what was matched, the error before and after, and the parameters with their intervals', () => {
    const t = ws.report.model.tuning;
    expect(t.status).toBe('matched');
    expect(t.text).toMatch(/^Matched to lab\. The black-oil correlations \(Standing; Beggs-Robinson\) were matched to the laboratory tables/);
    expect(t.text).toMatch(/Matched on 2026-10-02\./);
    expect(t.table.rows.map((r) => r[0])).toEqual(['Bubble point pressure', 'Solution GOR Rs', 'Oil formation volume factor Bo', 'Oil viscosity']);
    const fit = inputs.labMatch.fit;
    const bo = fit.matched.find((m) => m.id === 'bo');
    expect(t.table.rows[2].slice(3, 7)).toEqual([`${bo.before.meanAbsPct.toFixed(1)}%`, `${bo.after.meanAbsPct.toFixed(1)}%`, `${bo.before.maxAbsPct.toFixed(1)}%`, `${bo.after.maxAbsPct.toFixed(1)}%`]);
    expect(t.parameters.rows.map((r) => r[0])).toEqual(['Rs multiplier (Standing)', 'Rs shift', 'Bo multiplier (Standing)', 'Bo shift', 'Oil viscosity multiplier (Beggs-Robinson)']);
    expect(t.parameters.rows[1][2]).toBe('Tied to the multiplier by the bubble point condition');
    expect(t.parameters.rows[2][2]).toMatch(/^0\.\d{4} to 0\.\d{4}$/);
    const text = flat(pdf.text);
    expect(text).toMatch(/Lab tuning Matched to lab\. The black-oil correlations \(Standing; Beggs-Robinson\) were matched/);
    expect(text).toMatch(/Lab values matched/);
    expect(text).toMatch(/Bubble point pressure 1 2,635 psia measured 2,503 2,635 n\/a n\/a \(-5\.0%\) \(\+0\.0%\)/);
    expect(text).toContain(`${bo.before.meanAbsPct.toFixed(1)}% ${bo.after.meanAbsPct.toFixed(1)}% ${bo.before.maxAbsPct.toFixed(1)}% ${bo.after.maxAbsPct.toFixed(1)}%`);
    expect(text).toMatch(/Tuning parameters/);
    expect(text).toMatch(/Each interval is the Student t 95 percent interval of the least-squares estimate/);
    expect(text).toMatch(/Bubble point pressure Pb 2,635 psia Laboratory saturation pressure \(correlation match\) \(measured \(lab\)\)/);
  });

  it('completeness: every match parameter the engine reads has its row', () => {
    const m = ws.report.model;
    expect(missingInputRows(m.engineInput, m.inputs.rows)).toEqual([]);
    expect(Object.keys(m.engineInput.match).sort()).toEqual(['boMult', 'boShift', 'mu', 'rsLowP', 'rsMult', 'rsShift']);
    expect(missingInputRows(m.engineInput, m.inputs.rows.filter((r) => r.key !== 'match.boShift'))).toEqual(['match.boShift']);
  });

  it('pvt-1.tuning records the match: parameters, what was matched with the error before and after, the uncertainty', () => {
    const b = ws.contract;
    expect(validatePvtContract(b).ok).toBe(true);
    expect(b.pb_source).toBe('lab');
    expect(b.tuning.status).toBe('tuned');
    expect(b.tuning.kind).toBe('black-oil-correlation-match');
    expect(Object.keys(b.tuning.parameters).sort()).toEqual(['bo_multiplier', 'bo_shift_RB_per_STB', 'bubble_point_psia', 'mu_o_multiplier', 'rs_multiplier', 'rs_shift_scf_per_STB']);
    expect(b.tuning.matched.map((m) => m.target)).toEqual(['pb', 'Rs', 'Bo', 'mu_o']);
    const bo = b.tuning.matched.find((m) => m.target === 'Bo');
    expect(bo.error_after).toBeLessThan(bo.error_before);
    expect(bo.points).toBe(20);
    expect(b.tuning.uncertainty.map((u) => u.parameter)).toEqual(['rsMult', 'rsShift', 'boMult', 'boShift', 'mu']);
    expect(b.tuning.uncertainty.find((u) => u.parameter === 'boMult').ci95).toHaveLength(2);
    expect(b.model_detail.rs_scale).toBeCloseTo(inputs.labMatch.applied.rsMult, 12);
    // the handoff a consumer prints
    expect(pvtContractTuningText(b)).toBe('correlations matched to lab data');
    expect(pvtContractSourceText(b, 'bo')).toMatch(/^Correlation: Standing, multiplied by 0\.\d{4} plus 0\.\d{4} RB\/STB \(laboratory match\), correlations matched to lab data, at the bubble point, from Fluid Systems Studio project "Good Oil Well No\. 4 PVT"/);
    expect(pvtContractSourceText(b, 'z')).not.toMatch(/matched to lab/);
    expect(describePvtContract(b).find((r) => r[0] === 'Lab tuning')[1]).toBe('correlations matched to lab data');
    expect(describePvtContract(b).find((r) => r[0] === 'Bubble point')[1]).toBe('measured (lab)');
    expect(ws.handoff.contract.tuning.kind).toBe('black-oil-correlation-match');
    // the black-oil handoff of a fluid with no match says none, as before
    expect(run(goodOilBlackOil()).contract.tuning).toEqual({ status: 'none' });
  });

  it('a typed bubble point gives way to the laboratory one, and the report says so', () => {
    const typed = goodOilBlackOil();
    typed.streamA.blackOil.pb = 2400;
    const m = matched(typed);
    const w = run(m);
    expect(w.results.pvt.pb).toBeCloseTo(2634.696, 9);
    expect(w.results.meta.warnings.join(' ')).toMatch(/A bubble point is also typed in the inputs\. The laboratory match takes its place while the match is applied\./);
    const row = w.report.model.inputs.rows.find((r) => r.key === 'pb');
    expect(row.value).toBe('2,400');
    expect(row.source).toBe('Entered, and not used: the laboratory saturation pressure of the correlation match takes its place');
  });
});

describe('the match card', () => {
  const u = fluidUnits('oilfield');
  it('matches on the button, shows the before and after table, and removes the match', () => {
    let state = goodOilBlackOil();
    const onMatch = (record) => { state = { ...state, labMatch: record || undefined }; };
    const view = render(<LabMatchCard inputs={state} onMatch={onMatch} section={blackOilMatchSection({ inputs: state, u })} />);
    expect(screen.getByTestId('fluid-lab-match-status').textContent).toBe('Not matched');
    fireEvent.click(screen.getByTestId('fluid-lab-match-run'));
    expect(state.labMatch.applied.pb).toBeCloseTo(2634.696, 9);
    view.rerender(<LabMatchCard inputs={state} onMatch={onMatch} section={blackOilMatchSection({ inputs: state, u })} />);
    expect(screen.getByTestId('fluid-lab-match-status').textContent).toBe('Matched to lab');
    expect(screen.getByTestId('fluid-lab-match-table').textContent).toMatch(/Solution GOR Rs10?1?/);
    expect(screen.getByTestId('fluid-lab-match-parameters').textContent).toMatch(/Bo multiplier \(Standing\)0\.\d{4}0\.\d{4} to 0\.\d{4}/);
    // an edit of the fluid: the card withdraws the claim
    const edited = { ...state, streamA: { ...state.streamA, blackOil: { ...state.streamA.blackOil, api: 39 } } };
    view.rerender(<LabMatchCard inputs={edited} onMatch={onMatch} section={blackOilMatchSection({ inputs: edited, u })} />);
    expect(screen.getByTestId('fluid-lab-match-status').textContent).toBe('Matched, not confirmed');
    expect(screen.getByTestId('fluid-lab-match-text').textContent).toMatch(/^Matched, not confirmed\./);
    expect(screen.queryByTestId('fluid-lab-match-table')).toBeNull();
    fireEvent.click(screen.getByTestId('fluid-lab-match-reset'));
    expect(state.labMatch).toBeUndefined();
  });

  it('says why it cannot match', () => {
    const cold = goodOilBlackOil();
    cold.streamA.blackOil.temp = 180;
    render(<LabMatchCard inputs={cold} onMatch={() => { throw new Error('must not match'); }} section={blackOilMatchSection({ inputs: cold, u })} />);
    fireEvent.click(screen.getByTestId('fluid-lab-match-run'));
    expect(screen.getByTestId('fluid-lab-match-reasons').textContent).toMatch(/Set the reservoir temperature to the temperature of the test before matching/);
  });
});

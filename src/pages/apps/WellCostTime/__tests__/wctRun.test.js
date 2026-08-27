// Well Cost & Time closed loop (D11/WC2): the pure wctRun service
// reproduces the oracle golden (schedule, AFE, curves), the canonical
// Monte Carlo sampler reproduces the oracle's ANALYTIC mean/variance on
// the linear fixture, and seeded risk runs are bit-reproducible.
import fs from 'fs';
import path from 'path';
import {
  runDeterministic, runMonteCarlo, defaultCaseDoc, buildGoldenCaseDoc,
  sectionsFromGeometry, applyUncertainties, uncertaintyLabel, mulberry32,
  benchmarkSuggestion, ENGINE_VERSION,
} from '../services/wctRun';

const golden = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
  'test-data', 'drilling', 'goldens', 'wellcost_cases.json',
), 'utf8'));

const expectClose = (a, b, rtol, atol = 0) => {
  expect(Number.isFinite(a)).toBe(true);
  expect(Math.abs(a - b)).toBeLessThanOrEqual(atol + rtol * Math.abs(b));
};

describe('deterministic run vs oracle golden', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runDeterministic({ caseDoc: doc });

  test('schedule totals and time-depth curve', () => {
    expect(res.program.totals.totalDays).toBe(golden.totals.totalDays);
    expect(res.program.totals.productiveHr).toBe(golden.totals.productiveHr);
    expect(res.program.totals.drilledM).toBe(golden.totals.drilledM);
    res.program.curve.forEach((p, i) => {
      expectClose(p.tHr, golden.curve[i].tHr, 1e-12);
      expectClose(p.mdM, golden.curve[i].mdM, 1e-12);
    });
  });

  test('AFE rollup and cost-time accrual', () => {
    expect(res.costs.baseUsd).toBe(golden.afe.baseUsd);
    expect(res.costs.totalUsd).toBe(golden.afe.totalUsd);
    expect(res.costs.tangibleUsd).toBe(golden.afe.tangibleUsd);
    res.costCurve.forEach((p, i) => {
      expectClose(p.usd, golden.costCurve[i].usd, 1e-12);
    });
    expectClose(res.costCurve[res.costCurve.length - 1].usd, res.costs.baseUsd, 1e-12);
  });

  test('kpis and status', () => {
    expect(res.kpis.totalDays).toBe(18);
    expect(res.kpis.totalUsd).toBe(5918000);
    expect(res.kpis.status).toBe('PASS');
    expect(ENGINE_VERSION).toMatch(/wct/);
  });
});

describe('default case doc and geometry prefill', () => {
  test('default program evaluates cleanly', () => {
    const doc = defaultCaseDoc({ tdMdM: 2500 });
    const res = runDeterministic({ caseDoc: doc });
    expect(res.program.totals.tdMdM).toBe(2500);
    expect(res.kpis.totalUsd).toBeGreaterThan(0);
    expect(res.kpis.status).toBe('PASS');
  });

  test('sectionsFromGeometry maps the module spine rows', () => {
    const secs = sectionsFromGeometry([
      { from_md_m: 500, to_md_m: 2000, description: 'intermediate' },
      { from_md_m: 0, to_md_m: 500, description: 'surface' },
      { from_md_m: 0, to_md_m: 500, description: 'duplicate end' },
    ]);
    expect(secs).toEqual([
      { name: 'surface', endMdM: 500 },
      { name: 'intermediate', endMdM: 2000 },
    ]);
    const doc = defaultCaseDoc({ tdMdM: 2000, sections: secs });
    expect(runDeterministic({ caseDoc: doc }).program.totals.tdMdM).toBe(2000);
  });
});

describe('Monte Carlo via the canonical sampler', () => {
  test('linear fixture reproduces the oracle analytic mean and variance', () => {
    const caseDoc = {
      name: 'mc',
      program: golden.mc.program,
      costs: golden.mc.costs,
      risk: { iterations: 20000, seed: 7, uncertainties: golden.mc.uncertainties },
    };
    const mc = runMonteCarlo({ caseDoc });
    expect(mc.valid).toBe(20000);
    expect(mc.failed).toBe(0);
    const an = golden.mc.analytic;
    // CLT tolerance: 5 standard errors on the mean, 5% on the variance.
    expectClose(mc.cost.mean, an.meanUsd, 0, 5 * (an.sdUsd / Math.sqrt(20000)));
    expectClose(mc.cost.stdDev * mc.cost.stdDev, an.varUsd, 0.05);
    expectClose(mc.days.mean, an.meanDays * 24 / 24, 5e-3);
    expect(mc.cost.p10).toBeLessThan(mc.cost.p50);
    expect(mc.cost.p50).toBeLessThan(mc.cost.p90);
  });

  test('seeded risk run on the golden case is bit-reproducible', () => {
    const doc = buildGoldenCaseDoc(golden);
    const a = runMonteCarlo({ caseDoc: doc });
    const b = runMonteCarlo({ caseDoc: doc });
    expect(a.cost.p50).toBe(b.cost.p50);
    expect(a.days.p90).toBe(b.days.p90);
    expect(a.valid).toBeGreaterThan(1900);
    expect(a.cost.p10).toBeLessThan(a.cost.p90);
    expect(a.tornado.length).toBe(4);
    expect(a.tornado[0].contribution).toBeGreaterThan(0);
  });

  test('uncertainty overlay and labels', () => {
    const doc = buildGoldenCaseDoc(golden);
    const u = doc.risk.uncertainties[0]; // activity a4 ropMPerHr
    const overlaid = applyUncertainties(doc, [u], { [`${u.target}:${u.id}:${u.field}`]: 12 });
    expect(overlaid.program.activities.find((a) => a.id === 'a4').ropMPerHr).toBe(12);
    expect(doc.program.activities.find((a) => a.id === 'a4').ropMPerHr).toBe(15);
    expect(uncertaintyLabel(doc, 'activity:a4:ropMPerHr')).toMatch(/intermediate/i);
    expect(runMonteCarlo({ caseDoc: { ...doc, risk: { uncertainties: [] } } })).toBeNull();
  });

  test('mulberry32 is deterministic per seed', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('benchmark salvage', () => {
  test('suggestion matches the oracle fixture', () => {
    expect(benchmarkSuggestion(golden.benchmark.inputs)).toEqual(golden.benchmark.suggestion);
  });
});

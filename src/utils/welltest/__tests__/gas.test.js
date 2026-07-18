/**
 * WT4 gas engine tests: correlation twins pinned to the Fluid Systems
 * Studio implementations, pseudo-pressure vs the oracle's fine-Simpson
 * route, deliverability least squares vs the oracle, and a full synthetic
 * gas round trip through the equivalent-liquid machinery.
 */
import fs from 'fs';
import path from 'path';
import { zFactor as fsZFactor, muGas as fsMuGas } from '../../fluidStudioCalculations';
import {
  gasZFactor, gasViscosity, buildGasPvtTable, makePseudoPressure,
  normalizedPseudoTime, gasEquivalentReservoir, gasMdhAnalysis,
  backPressureFit, litFit, deliverabilityAnalysis, GAS,
} from '../gas.js';
import { getModel, evaluateDrawdown } from '../models/modelCatalog.js';

const goldens = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'goldens.json'), 'utf8')
);

const relErr = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

describe('gas PVT correlation twins', () => {
  test('gasZFactor and gasViscosity are numerically identical to the Fluid Systems Studio exports', () => {
    for (const p of [100, 500, 1500, 3000, 5000, 8000]) {
      for (const [tempF, gg] of [[120, 0.6], [180, 0.65], [250, 0.8]]) {
        const z = gasZFactor(p, tempF, gg);
        expect(z).toBe(fsZFactor(p, tempF, gg));
        expect(gasViscosity(p, tempF, gg, z)).toBe(fsMuGas(p, tempF, gg, z));
      }
    }
  });
});

describe('pseudo-pressure transform', () => {
  const { gasGravity, tempF, values } = goldens.gasPseudoPressure;
  const pp = makePseudoPressure(buildGasPvtTable({ gasGravity, tempF, pMax: 7000, points: 200 }));

  test('trapezoid m(p) matches the oracle fine-Simpson route', () => {
    for (const row of values) {
      // the 2p/(mu z) integrand curves most below ~1000 psi, where the
      // 35-psi trapezoid grid carries its largest discretization error
      expect(relErr(pp.mOfP(row.p), row.m)).toBeLessThan(row.p < 1000 ? 2e-3 : 5e-4);
    }
  });

  test('m(p) is monotonic and pOfM inverts it', () => {
    let prev = 0;
    for (const p of [200, 800, 1600, 2400, 3600, 4800, 6000]) {
      const m = pp.mOfP(p);
      expect(m).toBeGreaterThan(prev);
      prev = m;
      expect(relErr(pp.pOfM(m), p)).toBeLessThan(1e-6);
    }
  });

  test('gas compressibility is positive and near 1/p at low pressure', () => {
    expect(pp.cgOf(3000)).toBeGreaterThan(0);
    expect(relErr(pp.cgOf(300), 1 / 300)).toBeLessThan(0.2);
  });
});

describe('deliverability fits vs oracle least squares', () => {
  const { points, backPressure, lit } = goldens.deliverabilityFits;

  test('back-pressure C and n', () => {
    const fit = backPressureFit(points);
    expect(relErr(fit.n, backPressure.n)).toBeLessThan(1e-10);
    expect(relErr(fit.C, backPressure.C)).toBeLessThan(1e-10);
  });

  test('LIT a and b', () => {
    const fit = litFit(points);
    expect(relErr(fit.a, lit.a)).toBeLessThan(1e-10);
    expect(relErr(fit.b, lit.b)).toBeLessThan(1e-10);
  });

  test('deliverabilityAnalysis wires deltas and AOF consistently', () => {
    const res = deliverabilityAnalysis({
      points: [{ q: 2624.6, pwf: 1700 }, { q: 4154.7, pwf: 1500 }, { q: 5425.1, pwf: 1300 }],
      pr: 1952,
      baseP: 0,
    });
    expect(res.method).toBe('pressure-squared');
    expect(res.backPressure.aof).toBeGreaterThan(res.points[2].q);
    expect(res.lit.aof).toBeGreaterThan(res.points[2].q);
  });
});

describe('pseudo-time', () => {
  test('reduces to elapsed time for constant properties', () => {
    const history = [{ t: 0, p: 3000 }, { t: 10, p: 2500 }, { t: 40, p: 2000 }];
    const ta = normalizedPseudoTime(history, { muCtOf: () => 3e-6, muCtInitial: 3e-6 });
    ta.forEach((r) => expect(Math.abs(r.ta - r.t)).toBeLessThan(1e-9));
  });

  test('runs ahead of clock time as pressure falls (mu ct drops)', () => {
    const history = [{ t: 0, p: 4000 }, { t: 10, p: 3000 }, { t: 40, p: 2000 }];
    const muCtOf = (p) => 3e-6 * (p / 4000); // falls with pressure
    const ta = normalizedPseudoTime(history, { muCtOf, muCtInitial: 3e-6 });
    expect(ta[ta.length - 1].ta).toBeGreaterThan(40);
  });
});

describe('synthetic gas drawdown round trip (equivalent-liquid identity)', () => {
  test('gasMdhAnalysis recovers k and skin from model-generated m(p) data', () => {
    const gasGravity = 0.65;
    const tempF = 180;
    const pi = 5000;
    const pp = makePseudoPressure(buildGasPvtTable({ gasGravity, tempF, pMax: 7500, points: 200 }));
    const muI = pp.muOf(pi);
    const ctI = pp.cgOf(pi);
    const truth = { k: 8, skin: 3, C: 0 };
    const gasRes = { phi: 0.12, rw: 0.3, h: 60, qg: 4000, tempR: tempF + 460, muI, ctI };
    const reservoir = { ...gasEquivalentReservoir(gasRes), pi: pp.mOfP(pi) };
    // forward drawdown in m(p) space through the standard model machinery
    const times = Array.from({ length: 30 }, (_, i) => Math.pow(10, -1 + (2.5 * i) / 29));
    const series = evaluateDrawdown({ model: getModel('homogeneous'), params: truth, reservoir, times });
    // gauge pressures the well would actually record
    const points = series.map((row, i) => ({ t: times[i], pwf: pp.pOfM(reservoir.pi - row.dp) }));
    const result = gasMdhAnalysis({ points, pi, mOfP: pp.mOfP, ...gasRes });
    expect(relErr(result.k, truth.k)).toBeLessThan(0.02);
    expect(Math.abs(result.skin - truth.skin)).toBeLessThan(0.3);
  });

  test('the equivalent FVF reproduces the 1422 qT Darcy coefficient', () => {
    const res = gasEquivalentReservoir({ phi: 0.1, rw: 0.3, h: 50, qg: 5000, tempR: 660, muI: 0.02, ctI: 2e-4 });
    expect(relErr(141.2 * res.B * res.mu, GAS.PD_FACTOR * 660)).toBeLessThan(5e-4);
  });
});

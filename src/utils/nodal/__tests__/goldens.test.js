/**
 * Cross-validation against the independent Python oracle
 * (tools/validation/nodal/oracle.py, stdlib-only: Colebrook by bisection on
 * 1/sqrt(f), gas pseudo-pressure by composite Simpson quadrature, black-oil
 * correlations re-derived from their published forms). Regenerate goldens:
 *   python3 tools/validation/nodal/genfixtures.py
 * The full labeled-CASE gate lives in tools/validation/nodal/run-validation.mjs;
 * this suite keeps the same goldens enforced in CI.
 */
import fs from 'fs';
import path from 'path';
import { moodyFrictionFactor } from '../friction.js';
import { buildFluidModel, pvtAt } from '../pvt.js';
import { computeIpr, rateAtPwf } from '../ipr.js';
import { buildTrajectory, tvdAtMd } from '../trajectory.js';
import { darcyGasIpr } from '../iprGas.js';
import { gradientFor } from '../correlations/index.js';
import { linearGeothermal } from '../temperature.js';
import { bhpFromWhp } from '../traverse.js';
import { cullenderSmithBhp } from '../cullenderSmith.js';
import { solveOperatingPoint, solveGasOperatingPoint } from '../system.js';
import { backPressureIpr } from '../iprGas.js';

const goldens = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'goldens.json'), 'utf8')
);

const relErr = (actual, expected) =>
  Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-300);

describe('friction vs oracle goldens', () => {
  test('Moody/Colebrook agrees with the bisection-route oracle', () => {
    for (const c of goldens.friction) {
      expect(relErr(moodyFrictionFactor(c.re, c.relRough), c.f)).toBeLessThan(2e-3);
    }
  });
});

describe('oil IPR family vs oracle goldens', () => {
  test('Vogel curve matches the dimensionless identity points', () => {
    const v = goldens.ipr.vogel;
    const ipr = computeIpr({ model: 'vogel', pr: v.pr, qmax: v.qmax });
    for (const p of v.points) {
      expect(relErr(rateAtPwf(ipr, p.pwf), p.q)).toBeLessThan(1e-12);
    }
  });

  test('composite Standing curve and below-pb calibration agree', () => {
    const c = goldens.ipr.composite;
    const ipr = computeIpr({ model: 'composite', pr: c.pr, pb: c.pb, pi: c.pi });
    for (const p of c.points) {
      expect(relErr(rateAtPwf(ipr, p.pwf), p.q)).toBeLessThan(1e-9);
    }
    const qTest = rateAtPwf(ipr, 1500);
    const cal = computeIpr({
      model: 'composite',
      pr: c.pr,
      pb: c.pb,
      testPoint: { q: qTest, pwf: 1500 },
    });
    expect(relErr(cal.pi, c.jFromTestBelowPb)).toBeLessThan(1e-9);
  });

  test('Fetkovich and Jones curves agree', () => {
    const f = goldens.ipr.fetkovich;
    const fIpr = computeIpr({ model: 'fetkovich', pr: f.pr, c: f.c, n: f.n });
    for (const p of f.points) {
      expect(relErr(rateAtPwf(fIpr, p.pwf), p.q)).toBeLessThan(1e-9);
    }
    const j = goldens.ipr.jones;
    const jIpr = computeIpr({ model: 'jones', pr: j.pr, a: j.a, b: j.b });
    for (const p of j.points) {
      expect(relErr(rateAtPwf(jIpr, p.pwf), p.q)).toBeLessThan(1e-9);
    }
  });
});

describe('black-oil PVT adapter vs oracle p, T matrix', () => {
  const tols = {
    pb: 2e-3,
    rs: 2e-3,
    bo: 1e-3,
    muO: 5e-3,
    z: 1e-9,
    muG: 1e-9,
    bw: 1e-9,
    muW: 1e-9,
    rhoO: 1e-3,
    rhoG: 1e-9,
    rhoW: 1e-9,
    sigmaOG: 1e-9,
    sigmaWG: 1e-9,
  };

  test('every property agrees at every grid point', () => {
    const model = buildFluidModel({
      api: goldens.model.api,
      gasSg: goldens.model.gasSg,
      gor: goldens.model.gor,
      salinityPpm: goldens.model.salinityPpm,
    });
    for (const c of goldens.pvt) {
      const js = pvtAt(model, c.p, c.tF);
      for (const [prop, tol] of Object.entries(tols)) {
        expect(relErr(js[prop], c.props[prop])).toBeLessThan(tol);
      }
    }
  });
});

describe('minimum-curvature trajectory vs oracle goldens', () => {
  test('TVDs agree at every survey station', () => {
    const t = goldens.trajectory;
    const traj = buildTrajectory({ mode: 'deviated', survey: t.survey });
    t.survey.forEach((s, i) => {
      expect(relErr(tvdAtMd(traj, s.md), t.tvds[i])).toBeLessThan(1e-9);
    });
  });
});

describe('NA2 gradient correlations vs oracle transcription', () => {
  test('holdup exact, dpdz within the Colebrook route difference, pattern equal', () => {
    for (const c of goldens.gradients) {
      const js = gradientFor(c.correlation)({
        p: c.p,
        thetaDeg: c.thetaDeg,
        dIn: c.dIn,
        rough: c.rough,
        flows: c.flows,
        pvt: { rhoG: 5.0, muG: 0.015 },
        glr: c.glr,
      });
      expect(relErr(js.holdup, c.out.holdup)).toBeLessThan(1e-9);
      expect(relErr(js.dpdz, c.out.dpdz)).toBeLessThan(2e-3);
      expect(js.pattern).toBe(c.out.pattern);
    }
  });
});

describe('NA2 traverse vs oracle RK4 route', () => {
  test('Heun 50 ft matches RK4 5 ft within 0.3% on every case', () => {
    const model = buildFluidModel({
      api: goldens.model.api,
      gasSg: goldens.model.gasSg,
      gor: goldens.model.gor,
      salinityPpm: goldens.model.salinityPpm,
    });
    for (const c of goldens.traverse) {
      const trajectory = c.survey
        ? buildTrajectory({ mode: 'deviated', survey: c.survey })
        : buildTrajectory({ mode: 'vertical', depthFt: c.nodeMd });
      const res = bhpFromWhp({
        fluidModel: model,
        rates: c.rates,
        trajectory,
        tAt: linearGeothermal({ whtF: c.whtF, bhtF: c.bhtF, tvdMaxFt: c.tvdMax }),
        idIn: c.idIn,
        roughnessIn: c.roughnessIn,
        correlation: c.correlation,
        whp: c.whp,
        nodeMd: c.nodeMd,
        stepFt: 50,
      });
      expect(res.ok).toBe(true);
      expect(relErr(res.pEnd, c.bhp)).toBeLessThan(3e-3);
    }
  });
});

describe('NA2 Cullender-Smith vs oracle RK4 ODE route', () => {
  test('two-step + Simpson matches fine RK4 within 0.5%', () => {
    for (const c of goldens.cullenderSmith) {
      const res = cullenderSmithBhp(c);
      expect(res.converged).toBe(true);
      expect(relErr(res.pwf, c.pwf)).toBeLessThan(5e-3);
    }
  });
});

describe('NA3 operating point vs oracle bisection + RK4 route', () => {
  test('oil node solve (whp 250 case) matches within 1%', () => {
    const model = buildFluidModel(goldens.model);
    const c = goldens.operatingPoint.oil.find((x) => x.vlp.whp === 250);
    const ipr = computeIpr({ model: 'composite', pr: c.ipr.pr, pb: c.ipr.pb, pi: c.ipr.pi });
    const res = solveOperatingPoint({
      ipr,
      vlp: {
        fluidModel: model,
        rates: c.vlp.rates,
        trajectory: buildTrajectory({ mode: 'vertical', depthFt: c.vlp.nodeMd }),
        tAt: linearGeothermal({ whtF: c.vlp.whtF, bhtF: c.vlp.bhtF, tvdMaxFt: c.vlp.tvdMax }),
        idIn: c.vlp.idIn,
        roughnessIn: c.vlp.roughnessIn,
        correlation: c.vlp.correlation,
        whp: c.vlp.whp,
        nodeMd: c.vlp.nodeMd,
        stepFt: 100,
      },
    });
    expect(res.status).toBe('flowing');
    expect(relErr(res.op.q, c.op.q)).toBeLessThan(1e-2);
    expect(relErr(res.op.pwf, c.op.pwf)).toBeLessThan(1e-2);
  });

  test('gas node solve matches within 2%', () => {
    const g = goldens.operatingPoint.gas;
    const iprResult = backPressureIpr({ pr: g.ipr.pr, c: g.ipr.c, n: g.ipr.n, nPoints: 80 });
    const res = solveGasOperatingPoint({ iprResult, vlp: g.cs, nGrid: 60 });
    expect(res.status).toBe('flowing');
    expect(relErr(res.op.q, g.op.q)).toBeLessThan(2e-2);
    expect(relErr(res.op.pwf, g.op.pwf)).toBeLessThan(2e-2);
  });
});

describe('gas deliverability vs oracle Simpson route', () => {
  test('Darcy gas IPR (trapezoid m(p)) matches within 1.5%', () => {
    const g = goldens.gasIpr;
    // nPoints 7 lands the JS pwf grid exactly on the golden pwfs
    const js = darcyGasIpr({ ...g.base, nPoints: 7 });
    for (const p of g.points) {
      if (p.q <= 0) continue;
      const qJs = js.curve.find((pt) => Math.abs(pt.pwf - p.pwf) < 1e-6)?.q;
      expect(qJs).toBeDefined();
      expect(relErr(qJs, p.q)).toBeLessThan(1.5e-2);
    }
  });
});

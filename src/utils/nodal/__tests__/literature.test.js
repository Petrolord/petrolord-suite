/**
 * Literature anchors in CI: mirrors harness CASE 8 over the armed
 * fixtures in tools/validation/nodal/literature-fixtures.json. Sources,
 * verification levels and tolerance rationale live in that file.
 */
import fs from 'fs';
import path from 'path';
import { cullenderSmithBhp, averageTzBhp } from '../cullenderSmith.js';
import { beggsBrillHoldupDetail, frictionRatioExponent } from '../correlations/beggsBrill.js';
import { fancherBrownFriction } from '../correlations/fancherBrown.js';
import { gradientFor } from '../correlations/index.js';
import { chokeWhp, gasChokeRate, gasChokeUpstream } from '../chokes.js';

const literature = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../../tools/validation/nodal/literature-fixtures.json'),
    'utf8'
  )
);

const relErr = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const armed = literature.fixtures.filter((f) => f.armed);

describe('armed literature fixtures', () => {
  test('the NA2+NA3 anchor set stays armed', () => {
    expect(armed.length).toBeGreaterThanOrEqual(11);
  });

  for (const f of armed) {
    test(`${f.id} (${f.verification})`, () => {
      if (f.type === 'cullenderSmith') {
        const res = cullenderSmithBhp(f.inputs);
        expect(res.converged).toBe(true);
        expect(relErr(res.pwf, f.expect.pwf)).toBeLessThan(f.relTol);
        if (f.expect.pmf) expect(relErr(res.pmf, f.expect.pmf)).toBeLessThan(f.relTol);
      } else if (f.type === 'averageTz') {
        const res = averageTzBhp(f.inputs);
        expect(res.converged).toBe(true);
        expect(relErr(res.pwf, f.expect.pwf)).toBeLessThan(f.relTol);
      } else if (f.type === 'bbHoldupChain') {
        const { lambdaL, nfr, nlv, thetaDeg } = f.inputs;
        const d = beggsBrillHoldupDetail(lambdaL, nfr, nlv, thetaDeg, false);
        expect(d.pattern).toBe(f.expect.pattern);
        expect(relErr(d.hl0, f.expect.hl0)).toBeLessThan(f.relTol);
        expect(relErr(d.psi, f.expect.psi)).toBeLessThan(f.relTol);
        expect(relErr(d.holdup, f.expect.holdup)).toBeLessThan(f.relTol);
        const y = lambdaL / (d.holdup * d.holdup);
        expect(relErr(y, f.expect.y)).toBeLessThan(f.relTol);
        expect(relErr(Math.exp(frictionRatioExponent(y)), f.expect.ftpOverFn)).toBeLessThan(f.relTol);
      } else if (f.type === 'chokeWhp') {
        expect(relErr(chokeWhp(f.inputs).pwh, f.expect.pwh)).toBeLessThan(f.relTol);
      } else if (f.type === 'gasChokeRate') {
        const res = gasChokeRate(f.inputs);
        expect(res.regime).toBe(f.expect.regime);
        expect(relErr(res.qMscfd, f.expect.qMscfd)).toBeLessThan(f.relTol);
        expect(Math.abs(res.tDnF - f.expect.tDnF)).toBeLessThanOrEqual(f.tDnTolF ?? 1);
      } else if (f.type === 'gasChokeUpstream') {
        const res = gasChokeUpstream(f.inputs);
        expect(res.regime).toBe(f.expect.regime);
        expect(relErr(res.pUp, f.expect.pUp)).toBeLessThan(f.relTol);
        expect(relErr(res.pUpSonicMin, f.expect.pUpSonicMin)).toBeLessThan(f.relTol);
        expect(relErr(res.qAtSonicMin, f.expect.qAtSonicMin)).toBeLessThan(f.relTol);
      } else if (f.type === 'fbFriction') {
        expect(relErr(fancherBrownFriction(f.inputs.drhov, f.inputs.glr), f.expect.f)).toBeLessThan(
          f.relTol
        );
      } else if (f.type === 'mhbGradient') {
        const js = gradientFor('hagedornBrown')({
          p: f.inputs.p,
          thetaDeg: f.inputs.thetaDeg,
          dIn: f.inputs.dIn,
          rough: f.inputs.rough,
          flows: f.inputs.flows,
          pvt: { rhoG: f.inputs.rhoG, muG: f.inputs.muG },
        });
        expect(relErr(js.dpdz, f.expect.dpdz)).toBeLessThan(f.relTol);
      } else {
        throw new Error(`armed fixture ${f.id} has unknown type ${f.type}`);
      }
    });
  }
});

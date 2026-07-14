/**
 * G6.1 acceptance — every engine matches the INDEPENDENT oracle
 * goldens (test-data/rockphysics/, constants cross-checked against
 * bruges / open_petro_elastic / rockphypy / auralib; see the goldens
 * README). Comparator: 1e-12 relative with a 1e-12 absolute floor
 * (Math.pow vs Python ** may differ in the last ULPs — never assert
 * bit equality).
 */

import fs from 'fs';
import path from 'path';
import { brine, gas, deadOil, liveOil, woodMix, apiToRho0 } from '../engine/fluids';
import { ksat, kdry, substitute, substituteVels } from '../engine/gassmann';
import { voigtReussHill, mixMinerals, MINERALS } from '../engine/minerals';
import { mudrockVs, gcLithVs, greenbergCastagnaVs, shearForWell } from '../engine/vsEstimate';
import { zoeppritzRpp, akiRichards, shuey, avoClass } from '../engine/avo';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'rockphysics');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b, tol = 1e-12) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function expectClose(actual, golden, label, tol = 1e-12) {
  if (!close(actual, golden, tol)) {
    throw new Error(`${label}: engine ${actual} vs golden ${golden}`);
  }
  expect(true).toBe(true);
}

describe('Batzle-Wang fluids vs goldens', () => {
  test('brine grid', () => {
    for (const row of G.fluids.brine) {
      const out = brine(row.t, row.p, row.s);
      expectClose(out.rho, row.rho, `brine rho @${row.t}/${row.p}/${row.s}`);
      expectClose(out.vp, row.vp, `brine vp @${row.t}/${row.p}/${row.s}`);
      expectClose(out.k, row.k, `brine k @${row.t}/${row.p}/${row.s}`);
    }
  });

  test('gas grid', () => {
    for (const row of G.fluids.gas) {
      const out = gas(row.t, row.p, row.g);
      expectClose(out.rho, row.rho, `gas rho @${row.t}/${row.p}/${row.g}`);
      expectClose(out.k, row.k, `gas k @${row.t}/${row.p}/${row.g}`);
    }
  });

  test('dead oil grid', () => {
    for (const row of G.fluids.dead_oil) {
      const out = deadOil(row.t, row.p, row.rho0);
      expectClose(out.rho, row.rho, `dead oil rho @${row.t}/${row.p}/${row.rho0}`);
      expectClose(out.vp, row.vp, `dead oil vp @${row.t}/${row.p}/${row.rho0}`);
    }
  });

  test('live oil grid', () => {
    for (const row of G.fluids.live_oil) {
      const out = liveOil(row.t, row.p, row.rho0, row.rg, row.g);
      expectClose(out.rho, row.rho, `live oil rho @rg=${row.rg}/${row.t}/${row.p}`);
      expectClose(out.vp, row.vp, `live oil vp @rg=${row.rg}/${row.t}/${row.p}`);
    }
  });

  test('Wood mixing', () => {
    const br = brine(60, 25, 0.035);
    const gs = gas(60, 25, 0.6);
    for (const row of G.fluids.wood) {
      const out = woodMix([
        { sat: row.sw, ...br },
        { sat: 1 - row.sw, ...gs },
      ]);
      expectClose(out.k, row.k, `wood k @sw=${row.sw}`);
      expectClose(out.rho, row.rho, `wood rho @sw=${row.sw}`);
    }
  });

  test('API conversion is the exact definition', () => {
    expectClose(apiToRho0(10), 1.0, 'API 10');
    expectClose(apiToRho0(35), 141.5 / 166.5, 'API 35');
  });
});

describe('Gassmann vs goldens', () => {
  test('moduli-domain cases + round trips', () => {
    for (const c of G.gassmann.cases) {
      expectClose(ksat(c.kdry, c.kmin, c.kfl_brine, c.phi), c.ksat_brine, 'ksat brine');
      expectClose(ksat(c.kdry, c.kmin, c.kfl_gas, c.phi), c.ksat_gas, 'ksat gas');
      expectClose(kdry(c.ksat_brine, c.kmin, c.kfl_brine, c.phi), c.kdry, 'kdry back');
      expectClose(
        substitute(c.ksat_gas, c.kmin, c.kfl_gas, c.kfl_brine, c.phi),
        c.ksat_brine, 'substitute gas->brine',
      );
    }
  });

  test('log-domain substitution', () => {
    const ld = G.gassmann.log_domain;
    const out = substituteVels(3200, 1800, 2250, ld.kmin, ld.phi, ld.fl_a, ld.fl_b);
    expectClose(out.vp, ld.vp, 'sub vp');
    expectClose(out.vs, ld.vs, 'sub vs');
    expectClose(out.rho, ld.rho, 'sub rho');
    expectClose(out.ksat, ld.ksat, 'sub ksat');
    expectClose(out.mu, ld.mu, 'sub mu (invariant)');
  });

  test('unphysical inputs throw, never NaN', () => {
    expect(() => ksat(40e9, 37e9, 2.7e9, 0.25)).toThrow(/K_dry/);
    expect(() => ksat(8e9, 37e9, 2.7e9, 0)).toThrow(/Porosity/);
    expect(() => ksat(8e9, 37e9, -1, 0.25)).toThrow(/positive/);
    expect(() => substituteVels(3200, 3100, 2250, 37e9, 0.25,
      { k: 2.7e9, rho: 1017 }, { k: 5e7, rho: 172 })).toThrow(/vp\/vs/);
  });
});

describe('minerals (VRH)', () => {
  test('endmember identity and bounds', () => {
    expectClose(voigtReussHill([{ frac: 1, m: 36.6e9 }]), 36.6e9, 'pure quartz');
    const mixed = mixMinerals([
      { name: 'quartz', frac: 0.8 },
      { name: 'clay', frac: 0.2 },
    ]);
    expect(mixed.k).toBeLessThan(MINERALS.quartz.k);
    expect(mixed.k).toBeGreaterThan(MINERALS.clay.k);
    expectClose(mixed.rho, 0.8 * 2650 + 0.2 * 2580, 'mixed rho');
  });
});

describe('Vs estimation vs goldens', () => {
  test('mudrock line', () => {
    for (const row of G.vs.mudrock) {
      expectClose(mudrockVs(row.vp), row.vs, `mudrock @${row.vp}`);
    }
  });

  test('GC single lithologies', () => {
    for (const [lith, rows] of Object.entries(G.vs.gc)) {
      for (const row of rows) {
        expectClose(gcLithVs(row.vp, lith), row.vs, `gc ${lith} @${row.vp}`);
      }
    }
  });

  test('GC 70/30 sand/shale composite', () => {
    for (const row of G.vs.gc_mix_70_30) {
      expectClose(
        greenbergCastagnaVs(row.vp, { sandstone: 0.7, shale: 0.3 }),
        row.vs, `gc mix @${row.vp}`,
      );
    }
  });

  test('shearForWell provenance', () => {
    const measured = shearForWell({ vpCurve: [3000], dtsVsCurve: [1500] });
    expect(measured.source).toBe('measured');
    expect(measured.vs[0]).toBe(1500);
    const est = shearForWell({ vpCurve: [3000, NaN], vshCurve: [0.3, 0.3] });
    expect(est.source).toBe('estimated');
    expectClose(est.vs[0], greenbergCastagnaVs(3000, { sandstone: 0.7, shale: 0.3 }), 'gc mix path');
    expect(Number.isNaN(est.vs[1])).toBe(true);
  });
});

describe('AVO vs goldens', () => {
  test('all four class fixtures, all angles, all approximations', () => {
    for (const c of G.avo) {
      const u = c.upper;
      const lo = c.lower;
      const args = [u.vp, u.vs, u.rho, lo.vp, lo.vs, lo.rho];
      const sh0 = shuey(...args, 0);
      expectClose(sh0.a, c.A, `${c.name} A`);
      expectClose(sh0.b, c.B, `${c.name} B`);
      expect(avoClass(sh0.a, sh0.b)).toBe(c.expect);
      for (const row of c.curve) {
        const z = zoeppritzRpp(...args, row.theta);
        expectClose(z.re, row.zoeppritz_re, `${c.name} zoep re @${row.theta}`);
        expectClose(z.im, row.zoeppritz_im, `${c.name} zoep im @${row.theta}`);
        expectClose(akiRichards(...args, row.theta), row.aki_richards,
          `${c.name} AR @${row.theta}`);
        expectClose(shuey(...args, row.theta, { threeTerm: false }).r, row.shuey2,
          `${c.name} shuey2 @${row.theta}`);
        expectClose(shuey(...args, row.theta).r, row.shuey3,
          `${c.name} shuey3 @${row.theta}`);
      }
    }
  });

  test('normal-incidence identity holds in the engine too', () => {
    const z = zoeppritzRpp(2900, 1330, 2290, 4000, 2400, 2260, 0);
    const r0 = (2260 * 4000 - 2290 * 2900) / (2260 * 4000 + 2290 * 2900);
    expectClose(z.re, r0, 'engine theta=0');
    expect(Math.abs(z.im)).toBeLessThan(1e-15);
  });

  test('halfspace validation throws', () => {
    expect(() => zoeppritzRpp(2900, 2950, 2290, 4000, 2400, 2260, 10)).toThrow(/vs >= vp/);
    expect(() => zoeppritzRpp(0, 1330, 2290, 4000, 2400, 2260, 10)).toThrow(/positive/);
  });
});

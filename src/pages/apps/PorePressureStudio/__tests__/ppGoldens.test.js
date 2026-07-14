/**
 * P1 acceptance — every engine matches the INDEPENDENT oracle goldens
 * (packages/engines/test-data/porepressure/, tools/validation/porepressure/).
 * Comparator: 1e-12 relative with an absolute floor (Math.pow vs
 * Python ** may differ in the last ULPs — never assert bit equality);
 * the synthetic-well recovery uses the oracle's own 1e-9 anchor
 * tolerance.
 */

import fs from 'fs';
import path from 'path';
import { hydrostatic, overburden } from '../engine/pressures';
import { gardnerRho, gardnerV } from '../engine/gardner';
import { nctDt, fitNct } from '../engine/nct';
import { eaton } from '../engine/eaton';
import {
  bowersVLoading, bowersSigmaLoading,
  bowersVUnloading, bowersSigmaUnloading,
} from '../engine/bowers';
import { fracPressure, eatonK } from '../engine/fracgrad';
import { computeProfile } from '../engine/profile';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b, tol = 1e-12) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function expectClose(actual, golden, label, tol = 1e-12) {
  if (!close(actual, golden, tol)) {
    throw new Error(`${label}: engine ${actual} vs golden ${golden}`);
  }
  expect(true).toBe(true);
}

describe('gardner', () => {
  test('matches goldens both ways', () => {
    for (const c of G.gardner) {
      expectClose(gardnerRho(c.v_ms), c.rho_kg_m3, `rho(${c.v_ms})`);
      expectClose(gardnerV(c.rho_kg_m3), c.v_ms, `v(${c.rho_kg_m3})`);
    }
  });
  test('throws on unphysical input', () => {
    expect(() => gardnerRho(0)).toThrow();
    expect(() => gardnerV(-1)).toThrow();
  });
});

describe('nct', () => {
  test('fit recovers the golden parameters', () => {
    const g = G.nct_fit;
    const fit = fitNct(g.picks_z_m, g.picks_dt_us_per_m, g.dt_ma);
    expectClose(fit.dtMl, g.fitted.dt_ml, 'dt_ml', 1e-9);
    expectClose(fit.c, g.fitted.c, 'c', 1e-9);
  });
  test('nctDt reproduces every pick', () => {
    const g = G.nct_fit;
    g.picks_z_m.forEach((z, i) => {
      expectClose(nctDt(z, g.fitted.dt_ml, g.dt_ma, g.fitted.c),
        g.picks_dt_us_per_m[i], `dt_n(${z})`, 1e-9);
    });
  });
  test('rejects picks at/below matrix and single-depth sets', () => {
    expect(() => fitNct([100, 200], [220, 300], 220)).toThrow();
    expect(() => fitNct([100, 100], [300, 310], 220)).toThrow();
  });
});

describe('eaton', () => {
  test('matches the golden table', () => {
    for (const c of G.eaton) {
      expectClose(eaton(c.S_pa, c.Ph_pa, c.ratio, c.n), c.pp_pa,
        `eaton(r=${c.ratio}, n=${c.n})`);
    }
  });
  test('ratio 1 returns hydrostatic exactly', () => {
    expect(eaton(60e6, 30e6, 1.0, 3.0)).toBe(30e6);
  });
  test('throws on non-positive ratio', () => {
    expect(() => eaton(60e6, 30e6, 0)).toThrow();
  });
});

describe('bowers', () => {
  test('loading matches goldens and round-trips', () => {
    for (const c of G.bowers_loading) {
      const v = bowersVLoading(c.sigma_pa, c.A, c.B);
      expectClose(v, c.v_ms, `vLoad(${c.sigma_pa})`);
      expectClose(bowersSigmaLoading(v, c.A, c.B), c.sigma_pa,
        `sigmaLoad roundtrip(${c.sigma_pa})`);
    }
  });
  test('unloading matches goldens and round-trips', () => {
    for (const c of G.bowers_unloading) {
      const v = bowersVUnloading(c.sigma_pa, c.sigma_max_pa, c.A, c.B, c.U);
      expectClose(v, c.v_ms, `vUnload(${c.sigma_pa})`);
      expectClose(bowersSigmaUnloading(v, c.sigma_max_pa, c.A, c.B, c.U),
        c.sigma_pa, `sigmaUnload roundtrip(${c.sigma_pa})`);
    }
  });
  test('unloading rejoins loading at sigma_max; U=1 collapses to loading', () => {
    const { A, B, sigma_max_pa: smax } = G.bowers_unloading[0];
    expectClose(bowersVUnloading(smax, smax, A, B, 3.0),
      bowersVLoading(smax, A, B), 'rejoin at sigma_max', 1e-15);
    expectClose(bowersVUnloading(20e6, smax, A, B, 1.0),
      bowersVLoading(20e6, A, B), 'U=1 is loading');
  });
  test('throws below mudline velocity and on bad U', () => {
    expect(() => bowersSigmaLoading(1000, 10, 0.75)).toThrow();
    expect(() => bowersVUnloading(10e6, 50e6, 10, 0.75, 0.5)).toThrow();
  });
});

describe('fracture gradient', () => {
  test('matches the golden table', () => {
    for (const c of G.frac_gradient) {
      expectClose(fracPressure(c.S_pa, c.PP_pa, eatonK(c.nu)), c.fp_pa,
        `fp(nu=${c.nu})`);
    }
  });
  test('nu = 1/3 gives the exact midpoint', () => {
    expectClose(fracPressure(60e6, 30e6, eatonK(1 / 3)), 45e6, 'midpoint', 1e-15);
  });
  test('rejects nu outside [0, 0.5)', () => {
    expect(() => eatonK(0.5)).toThrow();
    expect(() => eatonK(-0.1)).toThrow();
  });
});

describe('synthetic well (forward-inverse consistency)', () => {
  const W = G.well;
  const p = W.params;
  const result = computeProfile({
    zBmlM: W.z_bml_m,
    dtUsPerM: W.dt_us_per_m,
    rhoKgM3: W.rho_kg_m3,
    params: {
      waterDepthM: p.water_depth_m,
      rhoSeawaterKgM3: p.rho_seawater,
      rhoFluidKgM3: p.rho_fluid,
      nct: {
        dtMlUsPerM: p.dt_ml_us_per_m,
        dtMaUsPerM: p.dt_ma_us_per_m,
        cPerM: p.c_nct_per_m,
      },
      method: 'eaton',
      eatonN: p.eaton_n,
      nu: p.nu,
    },
  });

  test('overburden and hydrostatic match the goldens', () => {
    W.z_bml_m.forEach((_, i) => {
      expectClose(result.overburdenPa[i], W.overburden_pa[i], `S[${i}]`);
      expectClose(result.hydrostaticPa[i], W.hydrostatic_pa[i], `Ph[${i}]`);
    });
  });

  test('Eaton recovers the imposed pore-pressure profile', () => {
    W.z_bml_m.forEach((_, i) => {
      expectClose(result.porePressurePa[i], W.pore_pressure_pa[i],
        `PP[${i}]`, 1e-9);
      expectClose(result.fracPressurePa[i], W.frac_pressure_pa[i],
        `FP[${i}]`, 1e-9);
    });
  });

  test('density provenance is per-sample and Gardner kicks in on gaps', () => {
    expect(result.rhoSource.every((s) => s === 'log')).toBe(true);
    const rhoGap = W.rho_kg_m3.map((r, i) => (i === 5 ? null : r));
    const withGap = computeProfile({
      zBmlM: W.z_bml_m, dtUsPerM: W.dt_us_per_m, rhoKgM3: rhoGap,
      params: {
        waterDepthM: p.water_depth_m, rhoSeawaterKgM3: p.rho_seawater,
        rhoFluidKgM3: p.rho_fluid,
        nct: {
          dtMlUsPerM: p.dt_ml_us_per_m, dtMaUsPerM: p.dt_ma_us_per_m,
          cPerM: p.c_nct_per_m,
        },
        method: 'eaton', eatonN: p.eaton_n, nu: p.nu,
      },
    });
    expect(withGap.rhoSource[5]).toBe('gardner');
    expectClose(withGap.rhoUsedKgM3[5],
      gardnerRho(1e6 / W.dt_us_per_m[5]), 'gardner fallback density');
  });

  test('rejects mismatched arrays and unknown methods', () => {
    expect(() => computeProfile({
      zBmlM: [0, 10], dtUsPerM: [600],
      params: { method: 'eaton' },
    })).toThrow();
    expect(() => computeProfile({
      zBmlM: [0], dtUsPerM: [600],
      params: { method: 'magic' },
    })).toThrow();
  });
});

/**
 * G2.1 acceptance — every engine matches the INDEPENDENT oracle
 * goldens (test-data/petrophysics/, generated from primary-literature
 * implementations) on the analytic type well. Comparator contract
 * (README): 1e-12 relative with a 1e-12 absolute floor near zero
 * (Math.pow vs Python ** may differ in the last ULPs — never assert
 * bit equality), null in goldens <-> NaN from engines.
 */

import fs from 'fs';
import path from 'path';
import { igr, VSH_METHODS } from '../engine/vsh';
import { phiDensity, phiSonicWyllie, phiSonicRhg, phiNd, clampDisplay } from '../engine/porosity';
import { pickettFit } from '../engine/rw';
import { swCurve } from '../engine/sw';
import { netPay } from '../engine/netpay';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const P = typewell.params;
const C = typewell.curves;
// JSON null -> NaN for engine input
const curve = (name) => C[name].map((v) => (v === null ? NaN : v));

const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

/** Assert engine output array matches a golden array (null<->NaN). */
function expectMatches(actual, golden, label) {
  expect(actual.length).toBe(golden.length);
  for (let i = 0; i < golden.length; i++) {
    const g = golden[i];
    const a = actual[i];
    if (g === null) {
      if (!Number.isNaN(a)) throw new Error(`${label}[${i}]: expected null/NaN, got ${a}`);
    } else if (!close(a, g)) {
      throw new Error(`${label}[${i}]: ${a} !== golden ${g}`);
    }
  }
}

const IGR = curve('GR').map((g) => igr(g, P.gr_clean, P.gr_clay));
const PHID = curve('RHOB').map((r) => phiDensity(r, P.rho_ma, P.rho_fl));

describe('Vsh models vs oracle', () => {
  test.each([
    ['IGR', 'linear'],
    ['VSH_LARIONOV_TERTIARY', 'larionov-tertiary'],
    ['VSH_LARIONOV_OLDER', 'larionov-older'],
    ['VSH_CLAVIER', 'clavier'],
    ['VSH_STEIBER', 'steiber'],
  ])('%s', (goldenKey, method) => {
    expectMatches(IGR.map(VSH_METHODS[method]), goldens[goldenKey], goldenKey);
  });
});

describe('porosity transforms vs oracle', () => {
  test('PHID', () => expectMatches(PHID, goldens.PHID, 'PHID'));
  test('PHIS_WYLLIE', () => {
    expectMatches(curve('DT').map((d) => phiSonicWyllie(d, P.dt_ma, P.dt_fl)), goldens.PHIS_WYLLIE, 'PHIS_WYLLIE');
  });
  test('PHIS_RHG', () => {
    expectMatches(curve('DT').map((d) => phiSonicRhg(d, P.dt_ma)), goldens.PHIS_RHG, 'PHIS_RHG');
  });
  test.each([['PHIND_AVG', 'avg'], ['PHIND_RMS', 'rms']])('%s', (key, method) => {
    const nphi = curve('NPHI');
    expectMatches(PHID.map((d, i) => phiNd(d, nphi[i], method)), goldens[key], key);
  });
});

describe('Sw models vs oracle (phi = PHID, vsh = Larionov tertiary)', () => {
  const rt = curve('RT');
  const vsh = IGR.map(VSH_METHODS['larionov-tertiary']);
  const base = { rt, phi: PHID, vsh };
  test('SW_ARCHIE', () => {
    expectMatches(Array.from(swCurve(base, { method: 'archie', rw: P.rw, a: P.a, m: P.m, n: P.n })),
      goldens.SW_ARCHIE, 'SW_ARCHIE');
  });
  test('SW_SIMANDOUX', () => {
    expectMatches(Array.from(swCurve(base, { method: 'simandoux', rw: P.rw, rsh: P.rsh, a: P.a, m: P.m })),
      goldens.SW_SIMANDOUX, 'SW_SIMANDOUX');
  });
  test('SW_INDONESIA', () => {
    expectMatches(Array.from(swCurve(base, { method: 'indonesia', rw: P.rw, rsh: P.rsh, a: P.a, m: P.m, n: P.n })),
      goldens.SW_INDONESIA, 'SW_INDONESIA');
  });
});

describe('zone cutoffs + net pay vs oracle', () => {
  const vsh = IGR.map(VSH_METHODS['larionov-tertiary']);
  const rt = curve('RT');
  const swClamped = Array.from(swCurve({ rt, phi: PHID, vsh: null }, { method: 'archie', rw: P.rw, a: P.a, m: P.m, n: P.n }))
    .map((s) => clampDisplay(s));

  test.each(Object.entries(P.zones))('%s', (name, [top, base]) => {
    const g = goldens.ZONES[name];
    const { flags, summary } = netPay(
      { depth: C.DEPT, phi: PHID, vsh, sw: swClamped },
      { cutPhi: P.cut_phi, cutVsh: P.cut_vsh, cutSw: P.cut_sw, top, base },
    );
    expect(flags).toEqual(g.flags);
    for (const [k, gv] of Object.entries(g.summary)) {
      if (gv === null) expect(summary[k]).toBeNull();
      else if (!close(summary[k], gv)) throw new Error(`${name}.${k}: ${summary[k]} !== ${gv}`);
    }
  });
});

describe('Pickett fit vs oracle', () => {
  test('recovers m and a*Rw from the exact water line', () => {
    const { m, aRw } = pickettFit(goldens.PICKETT.points);
    expect(close(m, goldens.PICKETT.m)).toBe(true);
    expect(close(aRw, goldens.PICKETT.a_rw)).toBe(true);
    // and the analytic truth itself
    expect(close(m, P.m)).toBe(true);
    expect(close(aRw, P.a * P.rw)).toBe(true);
  });
});

/**
 * G2.1 — analytic cases (hand-derivable, README-documented), model
 * identities/limits, and hostile-input fuzz. These hold regardless of
 * the goldens: they are the properties the formulas must have.
 */

import fs from 'fs';
import path from 'path';
import { igr, vshLarionovTertiary, vshLarionovOlder, vshClavier, vshSteiber, vshFromGr } from '../engine/vsh';
import { phiDensity, phiSonicWyllie, phiSonicRhg, phiNd, phiShaleCorrected, clampDisplay } from '../engine/porosity';
import { rwArps, spK, rweFromSsp, pickettFit } from '../engine/rw';
import { swArchie, swSimandoux, swIndonesia, swCurve } from '../engine/sw';
import { netPay, sampleThickness } from '../engine/netpay';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const AC = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'analytic_cases.json'), 'utf8'));

const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

describe('analytic scalar cases', () => {
  test('Archie basic: sqrt(0.1)', () => {
    const { rt, phi, rw, a, m, n } = AC.archie_basic.in;
    expect(close(swArchie(rt, phi, rw, a, m, n), AC.archie_basic.out)).toBe(true);
    expect(close(swArchie(rt, phi, rw, a, m, n), Math.sqrt(0.1))).toBe(true);
  });
  test('Vsh models at the documented points', () => {
    expect(close(vshLarionovTertiary(1), AC.larionov_tertiary_igr1.out)).toBe(true);
    expect(close(vshLarionovOlder(1), AC.larionov_older_igr1.out)).toBe(true);
    expect(close(vshSteiber(0.5), 0.25)).toBe(true);
    expect(Math.abs(vshClavier(0))).toBeLessThan(1e-12);
    expect(Math.abs(vshClavier(1) - 1)).toBeLessThan(1e-12);
  });
  test('porosity endpoints are exactly 0 and 1', () => {
    expect(phiDensity(2.65, 2.65, 1.0)).toBe(0);
    expect(close(phiDensity(1.0, 2.65, 1.0), 1)).toBe(true);
    expect(phiSonicWyllie(182, 182, 656)).toBe(0);
    expect(close(phiSonicWyllie(656, 182, 656), 1)).toBe(true);
    expect(phiSonicRhg(182, 182)).toBe(0);
  });
  test('Arps + SP quicklook', () => {
    expect(close(rwArps(0.1, 75, 150), AC.arps_75_to_150.out)).toBe(true);
    expect(close(spK(150), 80.95)).toBe(true);
    expect(close(rweFromSsp(-100, 0.5, 150), AC.sp_quicklook.out)).toBe(true);
  });
});

describe('model identities and limits', () => {
  const grid = [];
  for (const rt of [0.5, 2, 8, 40, 200]) {
    for (const phi of [0.05, 0.12, 0.2, 0.3]) grid.push([rt, phi]);
  }

  test('Simandoux and Indonesia degenerate EXACTLY to Archie at Vsh=0', () => {
    for (const [rt, phi] of grid) {
      const archie = swArchie(rt, phi, 0.05, 1, 2, 2);
      expect(close(swSimandoux(rt, phi, 0.05, 0, 2.0), archie)).toBe(true);
      expect(close(swIndonesia(rt, phi, 0.05, 0, 2.0), archie)).toBe(true);
    }
  });

  test('every Sw model is monotonically non-increasing in Rt', () => {
    for (const phi of [0.08, 0.2]) {
      for (const vsh of [0, 0.2, 0.5]) {
        let prevA = Infinity;
        let prevS = Infinity;
        let prevI = Infinity;
        for (const rt of [0.5, 1, 2, 5, 10, 50, 500]) {
          const a = swArchie(rt, phi, 0.05);
          const s = swSimandoux(rt, phi, 0.05, vsh, 2.0);
          const ind = swIndonesia(rt, phi, 0.05, vsh, 2.0);
          expect(a).toBeLessThanOrEqual(prevA + 1e-15);
          expect(s).toBeLessThanOrEqual(prevS + 1e-15);
          expect(ind).toBeLessThanOrEqual(prevI + 1e-15);
          prevA = a; prevS = s; prevI = ind;
        }
      }
    }
  });

  test('Vsh models anchor at 0, top out at/near 1, and increase between', () => {
    // Clavier and Steiber hit exactly 1 at IGR=1 by construction; the
    // Larionov forms famously top out just short (tertiary 0.9957,
    // older 0.99) — that is the published behaviour, not an error.
    for (const f of [vshClavier, vshSteiber]) expect(Math.abs(f(1) - 1)).toBeLessThan(1e-12);
    for (const f of [vshLarionovTertiary, vshLarionovOlder]) {
      expect(f(1)).toBeGreaterThan(0.98);
      expect(f(1)).toBeLessThanOrEqual(1);
    }
    for (const f of [vshLarionovTertiary, vshLarionovOlder, vshClavier, vshSteiber]) {
      expect(Math.abs(f(0))).toBeLessThan(1e-12);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = f(i / 20);
        expect(v).toBeGreaterThan(prev);
        prev = v;
      }
    }
  });

  test('nonlinear Vsh models sit at or below linear IGR (the point of them)', () => {
    for (let i = 1; i < 20; i++) {
      const x = i / 20;
      expect(vshLarionovTertiary(x)).toBeLessThan(x);
      expect(vshLarionovOlder(x)).toBeLessThan(x);
      expect(vshSteiber(x)).toBeLessThan(x + 1e-15);
      expect(vshClavier(x)).toBeLessThan(x + 1e-15);
    }
  });

  test('phiNd rms >= avg (rms inequality), equality when phiN == phiD', () => {
    expect(close(phiNd(0.2, 0.2, 'rms'), phiNd(0.2, 0.2, 'avg'))).toBe(true);
    expect(phiNd(0.25, 0.1, 'rms')).toBeGreaterThan(phiNd(0.25, 0.1, 'avg'));
  });

  test('shale correction subtracts exactly Vsh*phiShale', () => {
    expect(close(phiShaleCorrected(0.25, 0.4, 0.1), 0.25 - 0.04)).toBe(true);
  });

  test('Pickett fit inverts an exact Archie water line for any (m, aRw)', () => {
    for (const [m, aRw] of [[1.8, 0.03], [2.0, 0.05], [2.3, 0.2]]) {
      const pts = [0.06, 0.1, 0.15, 0.22, 0.3].map((p) => [p, aRw / p ** m]);
      const fit = pickettFit(pts);
      expect(close(fit.m, m)).toBe(true);
      expect(close(fit.aRw, aRw)).toBe(true);
    }
  });
});

describe('hostile input fuzz', () => {
  test('invalid scalars return NaN, never silent defaults', () => {
    for (const bad of [NaN, 0, -3]) {
      expect(Number.isNaN(swArchie(bad, 0.2, 0.05))).toBe(true);
      expect(Number.isNaN(swArchie(10, bad, 0.05))).toBe(true);
      expect(Number.isNaN(swSimandoux(bad, 0.2, 0.05, 0.3, 2))).toBe(true);
      expect(Number.isNaN(swIndonesia(bad, 0.2, 0.05, 0.3, 2))).toBe(true);
    }
    expect(Number.isNaN(igr(NaN, 20, 120))).toBe(true);
    expect(Number.isNaN(phiDensity(NaN, 2.65, 1))).toBe(true);
    expect(Number.isNaN(phiNd(NaN, 0.2))).toBe(true);
    expect(Number.isNaN(rwArps(NaN, 75, 150))).toBe(true);
    expect(Number.isNaN(clampDisplay(NaN))).toBe(true);
  });

  test('bad parameters throw plain domain errors', () => {
    expect(() => igr(50, 120, 20)).toThrow(/clay line/);
    expect(() => phiDensity(2.3, 1.0, 2.65)).toThrow(/Matrix density/);
    expect(() => phiSonicWyllie(300, 656, 182)).toThrow(/Fluid slowness/);
    expect(() => phiSonicWyllie(300, 182, 656, 0.5)).toThrow(/Compaction/);
    expect(() => phiNd(0.2, 0.2, 'nope')).toThrow(/Unknown/);
    expect(() => vshFromGr([50], { grClean: 20, grClay: 120, method: 'nope' })).toThrow(/Unknown Vsh/);
    expect(() => swCurve({ rt: [1], phi: [0.2] }, { method: 'nope', rw: 0.05 })).toThrow(/Unknown Sw/);
    expect(() => swCurve({ rt: [1], phi: [0.2] }, { method: 'simandoux', rw: 0.05, rsh: 2 })).toThrow(/needs a Vsh/);
    expect(() => pickettFit([[0.2, 5]])).toThrow(/at least two/);
    expect(() => pickettFit([[0.2, 5], [0.2, 9]])).toThrow(/degenerate/);
  });

  test('all-NaN curves flow through to all-NaN outputs and zero net pay', () => {
    const nan = new Array(5).fill(NaN);
    const depth = [1000, 1000.5, 1001, 1001.5, 1002];
    const vsh = vshFromGr(nan, { grClean: 20, grClay: 120, method: 'clavier' });
    expect(Array.from(vsh).every(Number.isNaN)).toBe(true);
    const sw = swCurve({ rt: nan, phi: nan, vsh }, { method: 'indonesia', rw: 0.05, rsh: 2 });
    expect(Array.from(sw).every(Number.isNaN)).toBe(true);
    const { summary } = netPay({ depth, phi: nan, vsh, sw }, { cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 });
    expect(summary.net_m).toBe(0);
    expect(summary.gross_m).toBeCloseTo(2.5, 12);
    expect(summary.phi_avg).toBeNull();
  });

  test('reversed depth vector is rejected loudly', () => {
    expect(() => sampleThickness([1002, 1001, 1000])).toThrow(/must increase/);
  });

  test('irregular steps integrate by true sample thickness', () => {
    // 3 samples at 1000, 1001, 1003: thicknesses 1, 1.5, 2 (midpoint split)
    const th = sampleThickness([1000, 1001, 1003]);
    expect(Array.from(th)).toEqual([1, 1.5, 2]);
    const ones = [0.2, 0.2, 0.2];
    const { summary } = netPay(
      { depth: [1000, 1001, 1003], phi: ones, vsh: [0, 0, 0], sw: [0.3, 0.3, 0.3] },
      { cutPhi: 0.08, cutVsh: 0.5, cutSw: 0.6 },
    );
    expect(summary.net_m).toBeCloseTo(4.5, 12);
    expect(summary.ntg).toBeCloseTo(1, 12);
  });
});

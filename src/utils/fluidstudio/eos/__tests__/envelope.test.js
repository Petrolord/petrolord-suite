/**
 * FS4 gates — phase boundaries, saturation pressure, PT envelope.
 *
 * GATE I (oracle): phaseBoundaries must reproduce the oracle's
 * stability-bisection boundary grid (count, kind, pressure) in
 * goldens.json — the oracle scans with plain-SS stability, bisection
 * cubic and bisection-only Rachford-Rice.
 * Identity gates: the Raoult bubble-point band anchored to the
 * NIST-gated purePsat, and flash phase counts flipping across a
 * detected boundary.
 */

import { mixtureFromKeys, purePsat } from '../pr78';
import { COMPONENTS } from '../components';
import { degFtoR } from '../units';
import { flashPT } from '../flash';
import { phaseBoundaries, saturationPressure, tracePhaseEnvelope } from '../envelope';
import { mixtureWithPlusFraction } from '../characterization';
import goldens from './goldens.json';

const envMix = (env) => (env.plus ? mixtureWithPlusFraction(env.keys, env.plus) : mixtureFromKeys(env.keys));

describe('FS4 GATE I: phase boundaries vs oracle stability bisection', () => {
  describe.each(goldens.envelopes)('fluid $name', (env) => {
    const mix = envMix(env);
    test.each(env.states)('$tF F', (st) => {
      const bounds = phaseBoundaries(mix, env.x, degFtoR(st.tF));
      expect(bounds.length).toBe(st.boundaries.length);
      st.boundaries.forEach((ob, i) => {
        expect(bounds[i].kind).toBe(ob.kind);
        expect(Math.abs(bounds[i].pPsia - ob.pPsia) / ob.pPsia).toBeLessThan(2e-4);
      });
    });
  });

  test('grid exercises bubble, dew and empty outcomes', () => {
    const all = goldens.envelopes.flatMap((e) => e.states);
    const kinds = all.flatMap((s) => s.boundaries.map((b) => b.kind));
    expect(kinds.filter((k) => k === 'bubble').length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === 'dew').length).toBeGreaterThanOrEqual(3);
    expect(all.some((s) => s.boundaries.length === 0)).toBe(true);
  });
});

describe('FS4 identity gates: saturation pressure', () => {
  const tR = degFtoR(100);

  test('equimolar C3/nC4 bubble point sits in the Raoult band of the NIST-gated Psat', () => {
    const mix = mixtureFromKeys(['C3', 'nC4']);
    const sat = saturationPressure(mix, [0.5, 0.5], tR, { pMaxPsia: 600 });
    expect(sat).not.toBeNull();
    expect(sat.kind).toBe('bubble');
    const raoult = 0.5 * purePsat(COMPONENTS.C3, tR) + 0.5 * purePsat(COMPONENTS.nC4, tR);
    expect(Math.abs(sat.pPsia - raoult) / raoult).toBeLessThan(0.06);
  });

  test('flash flips phase count across the bubble point', () => {
    const env = goldens.envelopes.find((e) => e.name === 'char-oil');
    const mix = envMix(env);
    const st = env.states[1];
    const bub = st.boundaries[0];
    const tOil = degFtoR(st.tF);
    const inside = flashPT(mix, env.x, tOil, bub.pPsia - 25);
    const outside = flashPT(mix, env.x, tOil, bub.pPsia + 25);
    expect(inside.phases).toBe(2);
    expect(inside.beta).toBeLessThan(0.05);
    expect(outside.phases).toBe(1);
  });

  test('single-phase-everywhere temperature returns null', () => {
    const env = goldens.envelopes.find((e) => e.name === 'full-11');
    const empty = env.states.find((s) => s.boundaries.length === 0);
    expect(saturationPressure(envMix(env), env.x, degFtoR(empty.tF))).toBeNull();
  });
});

describe('FS4: tracePhaseEnvelope', () => {
  test('char-condensate trace produces dew points and respects the T grid', () => {
    const env = goldens.envelopes.find((e) => e.name === 'char-condensate');
    const mix = envMix(env);
    const trace = tracePhaseEnvelope(mix, env.x, {
      tMinR: degFtoR(100), tMaxR: degFtoR(200), nT: 3, nScan: 25,
    });
    expect(trace.points).toHaveLength(3);
    expect(trace.dew.length).toBeGreaterThanOrEqual(2);
    // endpoints agree with the golden boundary states at 100F and 200F
    const at100 = trace.points[0].boundaries;
    const golden100 = env.states.find((s) => s.tF === 100).boundaries;
    expect(at100.length).toBe(golden100.length);
    expect(Math.abs(at100[0].pPsia - golden100[0].pPsia) / golden100[0].pPsia).toBeLessThan(2e-4);
  });

  test('rejects a missing or inverted temperature window', () => {
    const mix = mixtureFromKeys(['C1', 'nC4']);
    expect(() => tracePhaseEnvelope(mix, [0.5, 0.5], { tMinR: 600, tMaxR: 500 })).toThrow();
  });
});

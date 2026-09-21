/**
 * Numeric gates for the Pump Station Designer state layer (FC3-0).
 *
 * The engine shim is a two-line re-export, so the composition that makes
 * this app lives here in the context, and until this file existed
 * nothing in the Suite asserted a single number about either rotating
 * studio (FC3 finding S4). The smoke test mounts the page and checks
 * that headings and prose are present, which is exactly what let S1
 * ship: two answers for one change, one of them wrong.
 *
 * The load-bearing gate is "the two paths agree". The studio scales the
 * whole pump CURVE and re-intersects it with the system; the changes
 * card applies the affinity and trim laws to a POINT. Those answer two
 * different questions and both are worth showing, but the point the
 * card reports must at least lie on the curve the chart draws. Against
 * the shipped code it does not: the change was applied to the curve and
 * then applied a second time to the duty that curve had already
 * produced, so at a 20 percent trim the card read 752 gpm and 137 ft
 * where the curve makes 262 ft at that flow.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn(),
  };
  return { createSavedProjectsService: () => service, __service: service };
});
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabase: { from: jest.fn(() => builder) } };
});

const savedService = jest.requireMock('@/utils/savedProjects').__service;

import { PumpStudioProvider, usePump, changeFactors } from '@/contexts/PumpStudioContext';
import { impellerTrim, speedChange } from '@/utils/facilities/engine/pumps';

let api = null;
const Probe = () => {
  api = usePump();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <PumpStudioProvider>
        <Probe />
      </PumpStudioProvider>,
    );
  });
};

const set = async (section, key, value) => {
  await act(async () => { api.setSection(section, key, value); });
};

/** Relative agreement, because these are ratios of large head numbers. */
const agreesWith = (got, want, tol = 1e-12) => {
  expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(tol);
};

beforeEach(async () => {
  jest.clearAllMocks();
  api = null;
  savedService.list.mockResolvedValue([]);
  await mount();
});

describe('the default study, as numbers', () => {
  it('solves the duty as an intersection and prices it', () => {
    expect(api.duty.error).toBeUndefined();
    expect(api.duty.qGpm).toBeCloseTo(1508.866, 3);
    expect(api.duty.headFt).toBeCloseTo(352.3713, 3);
    expect(api.power.brakeHp).toBeCloseTo(146.3121, 3);
    expect(api.power.hydraulicHp).toBeCloseTo(114.1234, 3);
    expect(api.power.motorInputKw).toBeCloseTo(116.0691, 3);
    expect(api.power.motorError).toBeUndefined();
    expect(api.region.region).toBe('preferred');
    expect(api.region.percentOfBep).toBeCloseTo(100.591, 3);
    expect(api.npsh.npshaFt).toBeCloseTo(43.5906, 3);
    expect(api.npsh.check.severity).toBe('adequate');
    expect(api.npsh.check.pass).toBe(true);
  });

  it('is the duty before any change, so the changes card starts level', () => {
    expect(api.baseDuty.qGpm).toBe(api.duty.qGpm);
    expect(api.changeEffect.changed).toBe(false);
    expect(api.changeEffect.after.qGpm).toBe(api.changeEffect.before.qGpm);
    expect(api.changeEffect.onCurve.qGpm).toBeCloseTo(api.duty.qGpm, 9);
  });
});

describe('S1: the curve and the changes card must agree', () => {
  // the ratios a user actually types, plus the 5 percent boundary where
  // the trim shortfall is exactly zero and the two paths still diverged
  const cases = [
    ['0.95', 1400.691, 1433.423, 318.015],
    ['0.9', 1259.039, 1337.610, 276.858],
    ['0.85', 1114.405, 1244.060, 239.313],
    ['0.8', 964.648, 1152.774, 205.221],
    ['0.75', 806.016, 1063.751, 174.424],
  ];

  it.each(cases)(
    'at a trim of %s the card point sits on the curve the chart draws',
    async (dr, afterQ, onCurveQ, onCurveH) => {
      await set('changes', 'diameterRatio', dr);
      const { onCurve, after, before } = api.changeEffect;

      // the agreement: the affinity-mapped point is ON the configured curve
      agreesWith(api.configured.curve.headAt(onCurve.qGpm), onCurve.headFt);

      // the operating point the card quotes is the one the chart marks
      expect(after.qGpm).toBe(api.duty.qGpm);
      expect(after.headFt).toBe(api.duty.headFt);
      expect(before.qGpm).toBeCloseTo(1508.866, 3);

      // and the two are genuinely different questions, not one answer twice
      expect(after.qGpm).toBeCloseTo(afterQ, 2);
      expect(onCurve.qGpm).toBeCloseTo(onCurveQ, 2);
      expect(onCurve.headFt).toBeCloseTo(onCurveH, 2);
      expect(Math.abs(onCurve.qGpm - after.qGpm)).toBeGreaterThan(1);
    },
  );

  it('agrees on a speed change too, in both directions', async () => {
    for (const [sr, afterQ, onCurveQ] of [['0.8', 1056.024, 1207.093], ['1.2', 1922.922, 1810.639]]) {
      await set('changes', 'speedRatio', sr);
      const { onCurve, after } = api.changeEffect;
      agreesWith(api.configured.curve.headAt(onCurve.qGpm), onCurve.headFt);
      expect(after.qGpm).toBeCloseTo(afterQ, 2);
      expect(onCurve.qGpm).toBeCloseTo(onCurveQ, 2);
    }
  });

  it('agrees with a speed change and a trim applied together', async () => {
    await set('changes', 'speedRatio', '1.2');
    await set('changes', 'diameterRatio', '0.9');
    const { onCurve, after } = api.changeEffect;
    agreesWith(api.configured.curve.headAt(onCurve.qGpm), onCurve.headFt);
    expect(after.qGpm).toBeCloseTo(1643.547, 2);
    expect(onCurve.qGpm).toBeCloseTo(1605.132, 2);
  });

  it('applies the change exactly once: the card never re-trims the trimmed duty', async () => {
    await set('changes', 'diameterRatio', '0.8');
    const { before, onCurve } = api.changeEffect;
    const once = impellerTrim({
      qGpm: before.qGpm, headFt: before.headFt, brakeHp: before.brakeHp, diameterRatio: 0.8,
    });
    expect(onCurve.qGpm).toBeCloseTo(once.qGpm, 9);
    // the shipped code applied it to the already-trimmed duty, which is
    // this number and is 22 percent lower
    const twice = impellerTrim({
      qGpm: api.duty.qGpm, headFt: api.duty.headFt, brakeHp: 1, diameterRatio: 0.8,
    });
    expect(Math.abs(onCurve.qGpm - twice.qGpm)).toBeGreaterThan(200);
  });
});

describe('S2: one trim law, the engine\'s', () => {
  it('scales the curve by exactly what the engine does to a point', async () => {
    await set('changes', 'diameterRatio', '0.8');
    // an arbitrary point on the catalogue curve, nothing to do with the duty
    const q0 = 1600;
    const h0 = api.curve.headAt(q0);
    const moved = impellerTrim({
      qGpm: q0, headFt: h0, brakeHp: 1, diameterRatio: 0.8,
    });
    agreesWith(api.configured.curve.headAt(moved.qGpm), moved.headFt);
  });

  it('shortens the flow leg, which the context law used to ignore', () => {
    const f = changeFactors({ speedRatio: 1, diameterRatio: 0.8 });
    const engine = impellerTrim({
      qGpm: 1, headFt: 1, brakeHp: 1, diameterRatio: 0.8,
    });
    expect(f.qScale).toBe(engine.qGpm);
    expect(f.hScale).toBe(engine.headFt);
    expect(f.hpScale).toBe(engine.brakeHp);
    // the old context law used a flow scale of exactly the diameter ratio
    expect(f.qScale).toBeLessThan(0.8);
    expect(f.qScale).toBeCloseTo(0.8 * (1 - 0.045), 12);
  });

  it('leaves the speed law exact and the boundary at 5 percent quiet', () => {
    const f = changeFactors({ speedRatio: 1.2, diameterRatio: 1 });
    const engine = speedChange({
      qGpm: 1, headFt: 1, brakeHp: 1, speedRatio: 1.2,
    });
    expect(f.qScale).toBe(engine.qGpm);
    expect(f.hScale).toBe(engine.headFt);
    // a 5 percent trim carries no shortfall worth a displayed digit
    expect(changeFactors({ speedRatio: 1, diameterRatio: 0.95 }).shortfallPct).toBeLessThan(1e-12);
  });

  it('moves the duty at a deep trim, and not at all above 5 percent', async () => {
    await set('changes', 'diameterRatio', '0.95');
    expect(api.duty.qGpm).toBeCloseTo(1400.691, 2);
    await set('changes', 'diameterRatio', '0.8');
    expect(api.duty.qGpm).toBeCloseTo(964.648, 2);
  });
});

describe('S3: a refusal is a named refusal', () => {
  it('keeps the shaft power and refuses only the motor figures', async () => {
    await set('changes', 'motorEfficiency', '5');
    expect(api.power.error).toBeUndefined();
    expect(api.power.brakeHp).toBeCloseTo(146.3121, 3);
    expect(api.power.motorInputHp).toBeNull();
    expect(api.power.motorInputKw).toBeNull();
    expect(api.power.motorError).toMatch(/motor efficiency must be above 0 and at most 1/i);
  });

  it.each([['0'], ['-0.5'], ['1.5']])('refuses a motor efficiency of %s by name', async (v) => {
    await set('changes', 'motorEfficiency', v);
    expect(api.power.motorError).toMatch(/motor efficiency/i);
    expect(api.power.motorInputKw).toBeNull();
  });

  it.each([['1'], ['0.94'], ['0.5']])('accepts a motor efficiency of %s', async (v) => {
    await set('changes', 'motorEfficiency', v);
    expect(api.power.motorError).toBeUndefined();
    expect(Number.isFinite(api.power.motorInputKw)).toBe(true);
  });

  it('refuses a trim ratio above 1 by name instead of scaling the curve up', async () => {
    await set('changes', 'diameterRatio', '1.2');
    expect(api.configured.error).toMatch(/cannot trim an impeller larger/i);
    expect(api.duty.error).toMatch(/cannot trim an impeller larger/i);
    expect(api.changeEffect.error).toMatch(/cannot trim an impeller larger/i);
  });

  it.each([['0'], ['-0.5']])('refuses a trim ratio of %s by name', async (v) => {
    await set('changes', 'diameterRatio', v);
    expect(api.duty.error).toMatch(/trim ratio must be between 0 and 1/i);
  });

  it('refuses a speed ratio at or below zero by name', async () => {
    await set('changes', 'speedRatio', '0');
    expect(api.duty.error).toMatch(/speed ratio must be positive/i);
  });

  it('names an affinity extrapolation instead of quoting it flat', async () => {
    await set('changes', 'speedRatio', '3');
    expect(api.changeEffect.speedWarning).toMatch(/outside the range the affinity laws hold/i);
    // the boundary: a normal drive turndown is not warned about
    await set('changes', 'speedRatio', '1.5');
    expect(api.changeEffect.speedWarning).toBeNull();
    // and the boundary itself, with no duty in the way
    expect(changeFactors({ speedRatio: 0.5, diameterRatio: 1 }).speedWarning).toBeNull();
    expect(changeFactors({ speedRatio: 0.499, diameterRatio: 1 }).speedWarning).toMatch(/extrapolation/i);
    expect(changeFactors({ speedRatio: 1.501, diameterRatio: 1 }).speedWarning).toMatch(/extrapolation/i);
  });

  it('names the pump that can no longer start the system after a deep speed cut', async () => {
    // at half speed this machine makes 130 ft at shutoff against 150 ft
    // of static head, which is a real answer rather than a number
    await set('changes', 'speedRatio', '0.5');
    expect(api.duty.error).toMatch(/cannot start this system/i);
    expect(api.changeEffect.error).toMatch(/cannot start this system/i);
  });

  it('refuses a duty on a curve that does not droop', async () => {
    // every head box typed rising, which fits a curve that climbs
    await set('pump', 'h1', '180');
    await set('pump', 'h2', '200');
    await set('pump', 'h3', '260');
    await set('pump', 'h4', '360');
    expect(api.curve.warning).toMatch(/must droop/i);
    expect(api.duty.error).toMatch(/does not fall with flow/i);
    expect(api.power.error).toMatch(/does not fall with flow/i);
  });

  it('refuses a flat curve, and scores its fit as undefined', async () => {
    await set('pump', 'h1', '400');
    await set('pump', 'h2', '400');
    await set('pump', 'h3', '400');
    await set('pump', 'h4', '400');
    // With four identical heads there is no variance for a fit to explain,
    // so R squared is undefined. The engine used to return 1, which read as
    // a perfect fit beside a warning saying the curve was not a pump curve
    // at all; engines PR #197 returns null instead.
    expect(api.curve.rSquared).toBeNull();
    expect(api.duty.error).toMatch(/does not fall with flow/i);
  });

  it('solves a flat curve whose fit lands a whisker below zero, and still has no R squared', async () => {
    // The undefined R squared is reachable WITH a duty on the screen: on
    // these four flows the least-squares solve puts c2 at -2.3e-12 rather
    // than at zero, so the studio reads the curve as drooping, the
    // crossing solves, and the results card renders the fit quality line.
    // That is the line whose "--" the panel now explains.
    await set('pump', 'q1', '0');
    await set('pump', 'q2', '600');
    await set('pump', 'q3', '1200');
    await set('pump', 'q4', '1800');
    await set('pump', 'h1', '400');
    await set('pump', 'h2', '400');
    await set('pump', 'h3', '400');
    await set('pump', 'h4', '400');
    expect(api.curve.coefficients.c2).toBeLessThan(0);
    expect(api.curve.rSquared).toBeNull();
    expect(api.duty.error).toBeUndefined();
    expect(Number.isFinite(api.duty.qGpm)).toBe(true);
  });

  it('still solves the drooping control curve', () => {
    expect(api.curve.warning).toBeNull();
    expect(api.duty.error).toBeUndefined();
  });
});

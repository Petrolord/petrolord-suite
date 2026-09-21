/**
 * Numeric gates for the Relief & Flare Studio state layer (FC5-0).
 *
 * The engine shim is a two-line re-export, so this context and the six
 * panel files are the whole Suite-side composition, and nothing in the
 * Suite asserted a number about any of it before this file. The only
 * test that existed mounted the page and read its headings.
 *
 * Ten of the wave's forty-three findings live here. The largest was
 * `num`: a `parseFloat` that reads '50,000' as 50 and hands the engine
 * a number it would otherwise have refused, so a thousands separator in
 * the relief-load box sized 0.002454 in2 instead of 2.453842 and
 * printed orifice D where the answer is L. A saved study carries
 * whatever string it was saved with, so it is reachable without a
 * keyboard.
 *
 * Every case below is a value that reaches the engine through a box in
 * the shipped studio, or an argument this layer decides on the user's
 * behalf.
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

import {
  ReliefStudioProvider, useRelief, defaultInputs, relievingPsia, num, SCF_PER_LBMOL,
} from '@/contexts/ReliefStudioContext';
import { helpContent } from '@/components/reliefstudio/ReliefHelpGuide';
import * as E from '@/utils/facilities/engine/relief';

let api = null;
const Probe = () => { api = useRelief(); return null; };

const mount = async () => {
  await act(async () => {
    render(<ReliefStudioProvider><Probe /></ReliefStudioProvider>);
  });
};

const set = async (section, key, value) => {
  await act(async () => { api.setSection(section, key, value); });
};
const scenario = async (s) => { await act(async () => { api.setScenario(s); }); };

beforeEach(async () => {
  jest.clearAllMocks();
  api = null;
  savedService.list.mockResolvedValue([]);
  await mount();
});

/* ------------------------------------------------------------------ *
 * the shipped defaults
 * ------------------------------------------------------------------ */

describe('the shipped defaults, as numbers', () => {
  it('answers all four derived blocks', () => {
    expect(api.psv.error).toBeUndefined();
    expect(api.drum.error).toBeUndefined();
    expect(api.radiation.error).toBeUndefined();
    expect(api.blowdownResult.error).toBeUndefined();
  });

  it('wires the gas tab to the engine with the arguments on screen', () => {
    const g = defaultInputs().gas;
    const p1 = relievingPsia(285, 10);
    const direct = E.gasVaporArea({
      wLbHr: 50000, p1Psia: p1, p2Psia: 14.7, tR: 150 + 459.67,
      mw: 19, z: 0.9, k: 1.25, kd: 0.975, kb: 1, kc: 1,
    });
    expect(g.wLbHr).toBe('50000');
    expect(api.psv.areaIn2).toBe(direct.areaIn2);
    expect(api.psv.p1Psia).toBeCloseTo(328.2, 6);
    expect(api.psv.orifice.orifice).toBe('L');
  });
});

/* ------------------------------------------------------------------ *
 * F-S1: the parser that laundered what the engine refuses
 * ------------------------------------------------------------------ */

describe('the studio no longer launders what the engine refuses', () => {
  it('parses the whole value or hands the engine a NaN', () => {
    expect(num('50000')).toBe(50000);
    expect(num('')).toBeNaN();
    expect(num('', 0.975)).toBe(0.975);        // an EMPTY box takes the default
    ['50,000', '50 000', '50000 lb/hr', '0.5.5', '1/2', 'abc'].forEach((typed) => {
      expect(num(typed)).toBeNaN();
      expect(num(typed, 0.975)).toBeNaN();     // and garbage does NOT take it
      // what parseFloat used to do with the same string
      expect(Number.isFinite(parseFloat(typed))).toBe(typed !== 'abc');
    });
  });

  it.each([['50,000'], ['50 000'], ['0.5.5'], ['1/2']])(
    'refuses %s in the relief load box instead of sizing the leading digits', async (typed) => {
      await set('gas', 'wLbHr', typed);
      expect(api.psv.error).toBeTruthy();
      expect(api.psv.areaIn2).toBeUndefined();
    },
  );

  it('is the factor of 1000 the old parser cost', () => {
    // parseFloat('50,000') is 50, and the studio sized that without a word
    expect(parseFloat('50,000')).toBe(50);
    const p1 = relievingPsia(285, 10);
    const args = { p1Psia: p1, p2Psia: 14.7, tR: 609.67, mw: 19, z: 0.9, k: 1.25 };
    const laundered = E.gasVaporArea({ ...args, wLbHr: 50 });
    const meant = E.gasVaporArea({ ...args, wLbHr: 50000 });
    expect(laundered.areaIn2).toBeCloseTo(0.002454, 6);
    expect(meant.areaIn2).toBeCloseTo(2.453842, 6);
    expect(E.selectOrifice(laundered.areaIn2).orifice).toBe('D');
    expect(E.selectOrifice(meant.areaIn2).orifice).toBe('L');
  });
});

/* ------------------------------------------------------------------ *
 * F-S2 and F-S3: the fire tab dropped what the gas tab honoured
 * ------------------------------------------------------------------ */

describe('the fire case sizes with the coefficients and back pressure on screen', () => {
  const fireChain = (over = {}) => {
    const f = { ...defaultInputs().fire, ...over };
    const wet = E.wettedAreaFt2({
      orientation: f.orientation,
      diameterFt: Number(f.diameterFt),
      lengthFt: Number(f.lengthFt),
      liquidLevelFt: Number(f.liquidLevelFt),
    });
    const duty = E.fireHeatInput({
      wettedFt2: wet.areaFt2, adequateDrainage: true, envFactor: Number(f.envFactor),
    });
    const load = E.fireReliefLoad({ qBtuHr: duty.qBtuHr, latentBtuLb: Number(f.latentBtuLb) });
    return E.gasVaporArea({
      wLbHr: load.wLbHr,
      p1Psia: relievingPsia(Number(f.setPsig), Number(f.overpressurePct)),
      p2Psia: Number(f.backPsig) + 14.7,
      tR: Number(f.tF) + 459.67, mw: Number(f.mw), z: Number(f.z), k: Number(f.k),
      kd: Number(f.kd), kb: Number(f.kb), kc: Number(f.kc),
    });
  };

  it('honours a typed Kd, which used to be dropped: orifice J becomes K', async () => {
    await scenario('fire');
    expect(api.psv.areaIn2).toBeCloseTo(1.235639, 6);
    expect(api.psv.orifice.orifice).toBe('J');
    await set('fire', 'kd', '0.9');
    expect(api.psv.areaIn2).toBeCloseTo(1.338609, 6);
    expect(api.psv.orifice.orifice).toBe('K');
    expect(api.psv.areaIn2).toBe(fireChain({ kd: '0.9' }).areaIn2);
  });

  it('honours a stated back pressure, which used to be hardcoded to 14.7 psia', async () => {
    await scenario('fire');
    const atmospheric = api.psv.areaIn2;
    await set('fire', 'backPsig', '200');
    expect(api.psv.critical).toBe(false);          // it is subcritical at 214.7 psia
    expect(api.psv.areaIn2).not.toBeCloseTo(atmospheric, 6);
    expect(api.psv.areaIn2).toBe(fireChain({ backPsig: '200' }).areaIn2);
  });

  it('refuses a coefficient no certified valve has', async () => {
    await scenario('fire');
    await set('fire', 'kd', '2');
    expect(api.psv.error).toMatch(/Kd/);
    await set('fire', 'kd', '0');
    expect(api.psv.error).toMatch(/Kd/);
  });
});

/* ------------------------------------------------------------------ *
 * F-S4: two halves of one derivation disagreed about standard conditions
 * ------------------------------------------------------------------ */

describe('one standard base for the knockout drum', () => {
  it('converts the standard rate through the mass rate and the density it uses', () => {
    expect(SCF_PER_LBMOL).toBeCloseTo(379.483572, 6);
    const d = defaultInputs().drum;
    const mw = 28.9625 * Number(d.gasSg);
    const tR = Number(d.tF) + 459.67;
    const rhoV = (mw * Number(d.pPsia)) / (10.7316 * tR);
    const massLbHr = ((Number(d.qVaporMMscfd) * 1e6) / SCF_PER_LBMOL) * mw / 24;
    expect(api.drum.rhoVUsed).toBeCloseTo(rhoV, 12);
    expect(api.drum.massLbHr).toBeCloseTo(massLbHr, 9);
    expect(api.drum.qVaporAcfs).toBeCloseTo(massLbHr / (3600 * rhoV), 9);
  });

  it('is the 0.3763 percent the 14.65 psia and 520 R base used to cost', () => {
    const d = defaultInputs().drum;
    const tR = Number(d.tF) + 459.67;
    const oldQ = ((Number(d.qVaporMMscfd) * 1e6) / 86400) * (14.65 / Number(d.pPsia)) * (tR / 520);
    expect(oldQ / api.drum.qVaporAcfs).toBeCloseTo(0.996237268, 9);
  });

  it('carries a typed real density into the rate, so its own z comes with it', async () => {
    await set('drum', 'rhoVLbFt3', '0.12');
    expect(api.drum.rhoVUsed).toBe(0.12);
    expect(api.drum.qVaporAcfs).toBeCloseTo(api.drum.massLbHr / (3600 * 0.12), 9);
  });
});

/* ------------------------------------------------------------------ *
 * the holdup box, end to end through the studio
 * ------------------------------------------------------------------ */

describe('the holdup box moves the answer beside it', () => {
  it('sweeps the required length instead of printing one number six times', async () => {
    const lengths = [];
    for (const f of ['0', '0.1', '0.25', '0.5', '0.75', '0.9']) {
      await set('drum', 'liquidFraction', f);
      lengths.push(api.drum.requiredLengthFt);
    }
    const spread = Math.max(...lengths) - Math.min(...lengths);
    expect(spread).toBeGreaterThan(1);       // it used to be 8.9e-16 ft
    expect(new Set(lengths.map((l) => l.toFixed(6))).size).toBeGreaterThan(4);
  });

  it('refuses a level outside the drum, by the right reason', async () => {
    await set('drum', 'liquidFraction', '-0.5');
    expect(api.drum.error).toMatch(/from 0/);
    await set('drum', 'liquidFraction', '1.2');
    expect(api.drum.error).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * the blowdown tab, where the worst finding printed as reassurance
 * ------------------------------------------------------------------ */

describe('the blowdown tab', () => {
  it('no longer reports 0.0 min as a pass', async () => {
    await set('blowdownIn', 'orificeDIn', '38');
    expect(api.blowdownResult.error).toBeUndefined();
    expect(api.blowdownResult.timeS).toBeGreaterThan(0);
    const last = api.blowdownResult.stations[api.blowdownResult.stations.length - 1];
    expect(last.pPsia).toBeCloseTo(114.7, 6);
  });

  it('runs the discharge coefficient the box states', () => {
    // 275.0 s before, from a hidden 0.975 on the typed 0.85
    expect(api.blowdownResult.timeS).toBeCloseTo(268.15, 1);
    expect(api.blowdownResult.timeS).toBeLessThan(274);
  });

  it('refuses a negative discharge coefficient instead of returning a NaN temperature', async () => {
    await set('blowdownIn', 'cd', '-0.85');
    expect(api.blowdownResult.error).toBeTruthy();
    expect(api.blowdownResult.finalTR).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * the fails-open sweep, through the boxes
 * ------------------------------------------------------------------ */

describe('every derived block either answers or refuses, by name', () => {
  const cases = [
    ['gas', 'kd', '0', 'psv'],
    ['gas', 'kd', '2', 'psv'],
    ['gas', 'kb', '0', 'psv'],
    ['gas', 'kc', '0', 'psv'],
    ['gas', 'mw', '', 'psv'],
    ['drum', 'muVCp', '-1', 'drum'],
    ['drum', 'rhoLLbFt3', '0', 'drum'],
    ['drum', 'diameterFt', '', 'drum'],
    ['radiation', 'fractionRadiated', '1.5', 'radiation'],
    ['radiation', 'transmissivity', '2', 'radiation'],
    ['radiation', 'distanceM', '0', 'radiation'],
    ['blowdownIn', 'cd', '1.5', 'blowdownResult'],
    ['blowdownIn', 'volumeFt3', '-500', 'blowdownResult'],
    ['blowdownIn', 'k', '1', 'blowdownResult'],
  ];

  it.each(cases)('%s.%s = "%s" is refused, never rendered as a dash', async (section, key, value, block) => {
    await set(section, key, value);
    const r = api[block];
    expect(r.error).toBeTruthy();
    Object.values(r).forEach((v) => {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    });
  });

  it('refuses a liquid viscosity the engine would have discarded', async () => {
    await scenario('liquid');
    await set('liquid', 'muCp', '-400');
    expect(api.psv.error).toMatch(/viscosity/);
  });

  it('refuses an environment factor of zero on the fire tab', async () => {
    await scenario('fire');
    await set('fire', 'envFactor', '0');
    expect(api.psv.error).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * the copy the studio teaches
 * ------------------------------------------------------------------ */

describe('the help guide says what the studio does', () => {
  const text = () => helpContent.map((h) => h.content).join('\n');

  it('does not assert a relieving pressure the user can change', () => {
    expect(text()).not.toMatch(/121 percent/);
  });

  it('keeps both halves of the L/D judgment', () => {
    expect(text()).toMatch(/above six/);
    expect(text()).toMatch(/below two/);
  });

  it('carries no em dash and no "X, not Y" contrastive', () => {
    helpContent.forEach((h) => {
      expect(h.content).not.toMatch(/—/);
      expect(h.content).not.toMatch(/, not /);
    });
  });
});

/**
 * Numeric gates for the Gas Processing Studio state layer (FC4-0).
 *
 * The engine shim is a two-line re-export, so this context and the two
 * panel files are the whole Suite-side composition, and nothing in the
 * Suite asserted a number about any of it before this file.
 *
 * FC4 finding F-U3 is why twenty-one of the forty-nine recon findings
 * were LIVE rather than theoretical: `NumberInput` was a bare
 * `type="number"` with no bounds, and `fmt` rendered NaN and Infinity
 * as `--`, which is what it renders for a box nobody has typed in. So a
 * user who typed something the engine could not handle saw exactly what
 * they saw before typing anything.
 *
 * Every case below is a value that reaches the engine through a box in
 * the shipped studio. Each one is asserted twice: that the studio
 * refuses it by name, and, where the recon measured it, what the engine
 * used to answer instead.
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

// The contactor call is spied on so the gates can read the arguments
// this studio hands the engine, which is where the amine column's
// liquid density lives (F-U1).
jest.mock('@/utils/facilities/engine/gasProcessing', () => {
  const actual = jest.requireActual('@/utils/facilities/engine/gasProcessing');
  return { ...actual, contactorDiameter: jest.fn(actual.contactorDiameter) };
});

const savedService = jest.requireMock('@/utils/savedProjects').__service;
const engine = jest.requireMock('@/utils/facilities/engine/gasProcessing');
const realEngine = jest.requireActual('@/utils/facilities/engine/gasProcessing');

/** The arguments this studio hands `aminePackage` on its own defaults. */
const amineArgs = (over = {}) => ({
  gasMMscfd: 100, co2MolPct: 4, h2sMolPct: 1,
  co2SpecMolPct: 2, h2sSpecMolPct: 0.0004,
  amineId: 'MDEA', amineWtPct: 45, leanLoading: 0.05, richLoading: 0.5,
  dutyBtuPerGal: 800, ...over,
});

import {
  GasProcessingProvider, useGasProcessing, defaultInputs,
  FIELD_LIMITS, fieldIssue, tegIssue, amineIssue, dewpointIssue,
  dakStanding, liquidDensityUsed, amineSolutionLbFt3, nonFiniteFields,
  nonFiniteNote, TEG_LIQUID_LB_FT3, GAL_PER_FT3, WATER_LB_PER_GAL,
} from '@/contexts/GasProcessingContext';
import {
  fmt, accentFor, ABSENT, NOT_A_NUMBER, INFINITE, MINUS_INFINITE,
} from '@/components/gasprocessing/fields';

let api = null;
const Probe = () => { api = useGasProcessing(); return null; };

const mount = async () => {
  await act(async () => {
    render(<GasProcessingProvider><Probe /></GasProcessingProvider>);
  });
};

const set = async (section, key, value) => {
  await act(async () => { api.setSection(section, key, value); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  engine.contactorDiameter.mockImplementation(realEngine.contactorDiameter);
  api = null;
  savedService.list.mockResolvedValue([]);
  await mount();
});

/* ------------------------------------------------------------------ *
 * The shipped defaults still answer
 * ------------------------------------------------------------------ */

describe('the shipped defaults, as numbers', () => {
  it('answers all three tabs', () => {
    expect(api.dehydration.error).toBeUndefined();
    expect(api.sweetening.error).toBeUndefined();
    expect(api.dewpoint.error).toBeUndefined();
  });

  it('holds the dehydration figures the studio shipped with', () => {
    const d = api.dehydration;
    expect(d.inletLbMMscf).toBeCloseTo(45.0458, 3);
    expect(d.circGpm).toBeCloseTo(3.9631, 3);
    expect(d.reboilerMMBtuHr).toBeCloseTo(0.4495, 3);
    expect(d.contactor.diameterFt).toBeCloseTo(2.8033, 3);
  });

  it('holds the sweetening figures the studio shipped with', () => {
    const s = api.sweetening;
    expect(s.acidMolesDay).toBeCloseTo(7904.2926, 2);
    expect(s.circGpm).toBeCloseTo(372.3974, 2);
    expect(s.reboilerMMBtuHr).toBeCloseTo(17.8751, 3);
  });

  it('reports nothing non-finite anywhere on the defaults', () => {
    expect(api.dehydration.nonFinite).toEqual([]);
    expect(api.sweetening.nonFinite).toEqual([]);
    expect(api.dewpoint.nonFinite).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * F-U3, half one: a non-finite result is not an empty field
 * ------------------------------------------------------------------ */

describe('fmt tells an absent value from a broken one (F-U3)', () => {
  it('renders nothing at all as the absent marker', () => {
    expect(fmt(undefined, 1)).toBe(ABSENT);
    expect(fmt(null, 1)).toBe(ABSENT);
    expect(fmt('', 1)).toBe(ABSENT);
  });

  it('renders a non-finite number as something a reader can act on', () => {
    expect(fmt(NaN, 1)).toBe(NOT_A_NUMBER);
    expect(fmt(Infinity, 1)).toBe(INFINITE);
    expect(fmt(-Infinity, 1)).toBe(MINUS_INFINITE);
  });

  it('never renders a broken value the same way as an absent one', () => {
    [NaN, Infinity, -Infinity].forEach((v) => {
      expect(fmt(v, 1)).not.toBe(fmt(undefined, 1));
      expect(fmt(v, 1)).not.toBe(ABSENT);
    });
  });

  it('still formats a real number', () => {
    expect(fmt(1234.5678, 2)).toBe('1,234.57');
    expect(fmt(0, 0)).toBe('0');
  });

  it('colours a broken value and leaves an absent one alone', () => {
    expect(accentFor(12)).toBe('text-slate-100');
    expect(accentFor(undefined)).toBe('text-slate-100');
    expect(accentFor(NaN)).toBe('text-amber-400');
    expect(accentFor(Infinity)).toBe('text-amber-400');
  });

  it('names the results that came back broken', () => {
    expect(nonFiniteFields({ a: 1, b: NaN, c: Infinity, d: 'x' })).toEqual(['b', 'c']);
    expect(nonFiniteNote([])).toBeNull();
    expect(nonFiniteNote(['circGpm'])).toContain('the circulation');
    const note = nonFiniteNote(['circGpm', 'reboilerMMBtuHr']);
    expect(note).toContain('the circulation and the reboiler duty');
    expect(note).toContain('Nothing on this tab that depends on them is a design figure');
  });
});

/* ------------------------------------------------------------------ *
 * F-U3, half two: bounds at the box
 * ------------------------------------------------------------------ */

describe('every typed box carries the bounds of its quantity (F-U3)', () => {
  it('refuses a blank box by name', () => {
    expect(fieldIssue('teg', 'tF', '')).toBe('the gas temperature needs a number');
    expect(fieldIssue('dewpoint', 'tF', 'abc')).toBe('the upstream temperature needs a number');
  });

  it('holds the bound open where the bound itself is refused', () => {
    expect(fieldIssue('teg', 'circulationGalPerLb', '0')).toContain('must be above 0');
    expect(fieldIssue('teg', 'refluxRatio', '0')).toBeNull();
  });

  it('names the unit in the refusal where the quantity has one', () => {
    expect(fieldIssue('amine', 'amineWtPct', '150')).toBe('the amine strength must be below 100 wt %');
  });

  it('accepts every shipped default', () => {
    const base = defaultInputs();
    Object.keys(FIELD_LIMITS).forEach((section) => {
      Object.keys(FIELD_LIMITS[section]).forEach((name) => {
        expect([section, name, fieldIssue(section, name, base[section][name])])
          .toEqual([section, name, null]);
      });
    });
  });
});

/**
 * Each of these is a recon finding, reproduced through the box that
 * reaches it. The `whatItUsedToDo` line runs the engine directly with
 * the same value, which is exactly what the studio used to hand it.
 */
describe('the fails-open list, refused at the box', () => {
  it('F-E4: a reboiler below the absorber is refused, and used to run the still backwards', async () => {
    const before = realEngine.tegPackage({
      gasMMscfd: 50, inletLbMMscf: 60, outletLbMMscf: 7, absorberTF: 380, reboilerTF: 100,
    });
    expect(before.error).toBeUndefined();
    expect(before.reboilerMMBtuHr).toBeLessThan(0);
    expect(before.warning).toBeNull();

    await set('teg', 'absorberTF', '380');
    await set('teg', 'reboilerTF', '100');
    expect(api.dehydration.error).toContain('reboiler temperature must be above the absorber temperature');
  });

  it('F-E5: a negative circulation ratio is refused', async () => {
    const before = realEngine.tegPackage({
      gasMMscfd: 50, inletLbMMscf: 60, outletLbMMscf: 7, circulationGalPerLb: -3,
    });
    expect(before.circGpm).toBeCloseTo(-5.5208, 3);
    await set('teg', 'circulationGalPerLb', '-3');
    expect(api.dehydration.error).toBe('the circulation ratio must be above 0 gal per lb');
  });

  it('F-E6: a negative reflux ratio is refused', async () => {
    await set('teg', 'refluxRatio', '-2');
    expect(api.dehydration.error).toBe('the reflux ratio must be above 0');
  });

  it('F-E7: a BTEX absorbed fraction outside zero to one is refused', async () => {
    await set('teg', 'btexAbsorbedFrac', '5');
    expect(api.dehydration.error).toBe('the BTEX absorbed fraction must be below 1');
  });

  it('F-E8: a negative outlet spec is refused', async () => {
    const before = realEngine.tegPackage({
      gasMMscfd: 50, inletLbMMscf: 60, outletLbMMscf: -20,
    });
    expect(before.circGpm).toBeCloseTo(8.3333, 3);
    await set('teg', 'outletLbMMscf', '-20');
    expect(api.dehydration.error).toBe('the outlet spec must be above 0 lb/MMscf');
  });

  it('F-E10 and F-E11: a solution strength above 100 or below zero is refused', async () => {
    const high = realEngine.aminePackage(amineArgs({ amineWtPct: 150 }));
    expect(high.error).toBeUndefined();
    expect(high.circGpm).toBeCloseTo(111.7192, 3);
    const low = realEngine.aminePackage(amineArgs({ amineWtPct: -45 }));
    expect(low.circGpm).toBeCloseTo(-372.3974, 3);
    expect(low.reboilerMMBtuHr).toBeCloseTo(-17.8751, 3);
    await set('amine', 'amineWtPct', '150');
    expect(api.sweetening.error).toBe('the amine strength must be below 100 wt %');
    await set('amine', 'amineWtPct', '-45');
    expect(api.sweetening.error).toBe('the amine strength must be above 0 wt %');
  });

  it('F-E12: a negative lean loading is refused', async () => {
    await set('amine', 'leanLoading', '-1');
    expect(api.sweetening.error).toBe('the lean loading must be above 0 mol/mol');
  });

  it('F-E13: a regenerator that produces heat is refused', async () => {
    const before = realEngine.aminePackage(amineArgs({ dutyBtuPerGal: -800 }));
    expect(before.error).toBeUndefined();
    expect(before.reboilerMMBtuHr).toBeCloseTo(-17.8751, 3);
    await set('amine', 'dutyBtuPerGal', '-800');
    expect(api.sweetening.error).toBe('the regenerator duty must be above 0 Btu/gal');
  });

  it('F-E16: the gas gravity that makes Sutton pseudo-criticals negative is out of reach', async () => {
    const hot = realEngine.jouleThomsonFPerPsi({ pPsia: 1000, tF: 100, gasSg: 5.07 });
    expect(hot.muFPerPsi).toBeLessThan(0);
    const dead = realEngine.jouleThomsonFPerPsi({ pPsia: 1000, tF: 100, gasSg: 5.08 });
    expect(dead.muFPerPsi).toBe(0);

    await set('dewpoint', 'gasSg', '5.07');
    expect(api.dewpoint.error).toBe('the gas gravity must be below 2');
    await set('dewpoint', 'gasSg', '5.08');
    expect(api.dewpoint.error).toBe('the gas gravity must be below 2');
  });

  it('F-E17: a temperature below absolute zero is refused', async () => {
    const before = realEngine.jouleThomsonFPerPsi({ pPsia: 1000, tF: -600, gasSg: 0.65 });
    expect(before.error).toBeUndefined();
    await set('dewpoint', 'tF', '-600');
    expect(api.dewpoint.error).toBe('the upstream temperature must be above -100 F');
  });

  it('F-C8: a spec above its own inlet names the spec rather than the sum', async () => {
    const before = realEngine.aminePackage(amineArgs({
      h2sMolPct: 0, co2SpecMolPct: 6, h2sSpecMolPct: 0,
    }));
    expect(before.error).toBe('no acid gas to remove at these specs');
    await set('amine', 'h2sMolPct', '0');
    await set('amine', 'h2sSpecMolPct', '0');
    await set('amine', 'co2SpecMolPct', '6');
    expect(api.sweetening.error).toContain('the CO2 spec is above the CO2 already in the gas');
  });
});

describe('the fails-silent list, refused at the box', () => {
  it('F-S1: a stage count of zero is refused, and used to render as an empty field', async () => {
    expect(realEngine.kremserFractionRemoved({ absorptionFactor: 2.5, stages: 0 })).toBeNaN();
    await set('teg', 'stages', '0');
    expect(api.dehydration.error).toBe('the theoretical stage count must be above 0');
  });

  it('F-S2: a circulation ratio of exactly zero is refused, and used to go to infinity', async () => {
    const before = realEngine.tegPackage({
      gasMMscfd: 50, inletLbMMscf: 60, outletLbMMscf: 7, circulationGalPerLb: 0,
    });
    expect(before.error).toBeUndefined();
    expect(before.dutyBtuPerGal).toBe(Infinity);
    expect(Number.isNaN(before.reboilerMMBtuHr)).toBe(true);

    await set('teg', 'circulationGalPerLb', '0');
    expect(api.dehydration.error).toBe('the circulation ratio must be above 0 gal per lb');
  });

  it('F-S3: a solution strength of exactly zero is refused, and used to go to infinity', async () => {
    const before = realEngine.aminePackage(amineArgs({ amineWtPct: 0 }));
    expect(before.error).toBeUndefined();
    expect(before.circGpm).toBe(Infinity);
    expect(before.reboilerMMBtuHr).toBe(Infinity);

    await set('amine', 'amineWtPct', '0');
    expect(api.sweetening.error).toBe('the amine strength must be above 0 wt %');
  });

  it('F-S4: a cleared temperature box is refused, and used to size a contactor from NaN', async () => {
    const before = realEngine.contactorDiameter({
      gasMMscfd: 50, pPsia: 1000, tF: NaN, gasSg: 0.65, ksFtS: 0.3,
    });
    expect(before.error).toBeUndefined();
    expect(Number.isNaN(before.diameterFt)).toBe(true);

    await set('teg', 'tF', '');
    expect(api.dehydration.error).toBe('the gas temperature needs a number');
  });

  it('F-S5: a cleared temperature box is refused on the dew point tab too', async () => {
    const before = realEngine.jouleThomsonFPerPsi({ pPsia: 1000, tF: NaN, gasSg: 0.65 });
    expect(before.error).toBeUndefined();
    expect(Number.isNaN(before.muFPerPsi)).toBe(true);

    await set('dewpoint', 'tF', '');
    expect(api.dewpoint.error).toBe('the upstream temperature needs a number');
  });
});

/* ------------------------------------------------------------------ *
 * The saturated-inlet fallback
 * ------------------------------------------------------------------ */

describe('the saturated inlet mode says so when the fit refuses', () => {
  it('refuses rather than falling back to a box the mode hides', async () => {
    // 250 F is 121 C, past the top of the saturation fit. The typed
    // inlet box is not on screen in saturated mode, so answering from
    // it answered from a number nobody had seen.
    expect(realEngine.waterSatPsia(250)).toBeNaN();
    expect(api.inputs.teg.inletMode).toBe('saturated');
    expect(api.inputs.teg.inletLbMMscf).toBe('60');

    await set('teg', 'tF', '250');
    expect(api.dehydration.error).toContain('saturated at line conditions');
    expect(api.dehydration.inletLbMMscf).toBeUndefined();
  });

  it('uses the typed box when the user asked for the typed box', async () => {
    await set('teg', 'inletMode', 'typed');
    await set('teg', 'tF', '250');
    expect(api.dehydration.error).toBeUndefined();
    expect(api.dehydration.inletLbMMscf).toBe(60);
  });
});

/* ------------------------------------------------------------------ *
 * F-U1: the amine column is full of amine
 * ------------------------------------------------------------------ */

describe('the contactor is sized against the liquid in it (F-U1)', () => {
  it('derives the amine solution density from the same water the circulation uses', () => {
    expect(GAL_PER_FT3).toBeCloseTo(7.4805194805, 9);
    expect(WATER_LB_PER_GAL).toBe(8.34);
    expect(amineSolutionLbFt3({ sgSolution: 1.04 })).toBeCloseTo(64.8830, 3);
    expect(amineSolutionLbFt3({ sgSolution: 1.01 })).toBeCloseTo(63.0114, 3);
    expect(amineSolutionLbFt3(null)).toBeNaN();
  });

  it('hands the sweetening contactor the amine solution density', () => {
    const call = engine.contactorDiameter.mock.calls
      .map(([a]) => a)
      .filter((a) => a.gasMMscfd === 100)
      .pop();
    expect(call).toBeDefined();
    expect(call.rhoLLbFt3).toBeCloseTo(64.8830, 3);
  });

  it('hands the dehydration contactor the glycol density', () => {
    const call = engine.contactorDiameter.mock.calls
      .map(([a]) => a)
      .filter((a) => a.gasMMscfd === 50)
      .pop();
    expect(call).toBeDefined();
    expect(call.rhoLLbFt3).toBe(TEG_LIQUID_LB_FT3);
  });

  it('follows the amine the user picked', async () => {
    await set('amine', 'amineId', 'MEA');
    expect(api.sweetening.liquidAsked).toBeCloseTo(63.0114, 3);
    await set('amine', 'amineId', 'DEA');
    expect(api.sweetening.liquidAsked).toBeCloseTo(63.6353, 3);
  });

  it('reads back the liquid the engine really used, so the screen can name it', () => {
    // The engine hard-codes 69.9 lb/ft3 today and takes no liquid
    // density, so the read-back is the glycol value on BOTH tabs. That
    // is the finding, stated on screen instead of implied away.
    expect(liquidDensityUsed(api.dehydration.contactor, 0.3)).toBeCloseTo(69.9, 6);
    expect(liquidDensityUsed(api.sweetening.contactor, 0.25)).toBeCloseTo(69.9, 6);
    expect(api.sweetening.liquidUsed).toBeCloseTo(69.9, 6);
    expect(api.sweetening.liquidUsed).not.toBeCloseTo(api.sweetening.liquidAsked, 3);
  });

  it('reads back whatever density it is given, not a constant', () => {
    const c = realEngine.contactorDiameter({
      gasMMscfd: 100, pPsia: 1000, tF: 110, gasSg: 0.7, ksFtS: 0.25,
    });
    // vAllow = ks sqrt((rhoL - rhoG)/rhoG), inverted.
    expect(liquidDensityUsed(c, 0.25)).toBeCloseTo(69.9, 6);
    expect(liquidDensityUsed({ rhoG: 4, vAllowFtS: 0.25 * Math.sqrt((62.4 - 4) / 4) }, 0.25))
      .toBeCloseTo(62.4, 6);
    expect(liquidDensityUsed({ error: 'no' }, 0.25)).toBeNaN();
    expect(liquidDensityUsed({ rhoG: -1, vAllowFtS: 1 }, 0.25)).toBeNaN();
  });

  it('gets the amine column right the moment the engine reads the density', async () => {
    // The engine half of F-U1 is a separate repair. This is the Suite
    // half proved against an engine that honours `rhoLLbFt3`: the same
    // Souders-Brown call with the liquid this studio already passes.
    engine.contactorDiameter.mockImplementation(({ rhoLLbFt3, ...rest }) => {
      const base = realEngine.contactorDiameter(rest);
      if (base.error || !(rhoLLbFt3 > 0)) return base;
      const vAllow = rest.ksFtS * Math.sqrt((rhoLLbFt3 - base.rhoG) / base.rhoG);
      return { ...base, vAllowFtS: vAllow, diameterFt: base.diameterFt * Math.sqrt(base.vAllowFtS / vAllow) };
    });
    await mount();
    expect(api.sweetening.contactor.diameterFt).toBeCloseTo(4.5245, 3);
    expect(api.sweetening.liquidUsed).toBeCloseTo(api.sweetening.liquidAsked, 6);
    expect(api.dehydration.contactor.diameterFt).toBeCloseTo(2.8033, 3);
  });
});

/* ------------------------------------------------------------------ *
 * F-U2: the correlation branch no published case exercises
 * ------------------------------------------------------------------ */

describe('the default z branch, across the range the boxes offer (F-U2)', () => {
  const PRESSURES = [14.7, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000];
  const TEMPS = [-100, -50, -30, 0, 32, 60, 100, 140, 180, 212, 300, 400];
  const GRAVITIES = [0.55, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2];

  it('is the branch this studio actually runs', () => {
    const calls = engine.contactorDiameter.mock.calls.map(([a]) => a);
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach((a) => expect(a.z).toBeUndefined());
  });

  it('either converges to a positive z or says it did not, everywhere the boxes reach', () => {
    let flagged = 0;
    let clean = 0;
    GRAVITIES.forEach((gasSg) => PRESSURES.forEach((pPsia) => TEMPS.forEach((tF) => {
      const standing = dakStanding({ pPsia, tF, gasSg });
      expect(standing).not.toBeNull();
      if (standing.warning) { flagged += 1; return; }
      clean += 1;
      const c = realEngine.contactorDiameter({ gasMMscfd: 50, pPsia, tF, gasSg, ksFtS: 0.3 });
      // Nothing that passes unflagged may reach the screen as a
      // non-number or as a negative compressibility.
      expect([pPsia, tF, gasSg, c.z > 0]).toEqual([pPsia, tF, gasSg, true]);
      expect([pPsia, tF, gasSg, Number.isFinite(c.diameterFt)])
        .toEqual([pPsia, tF, gasSg, true]);
    })));
    // 1584 combinations, 877 of them on the fitted band and clean.
    expect(clean + flagged).toBe(1584);
    expect(clean).toBe(877);
    expect(flagged).toBe(707);
  });

  it('flags the combinations where the correlation returns a negative z', () => {
    // Measured by sweep: rich gas at low temperature drops the reduced
    // temperature below the bottom of the DAK fit, the Newton solve
    // does not converge, and the root it stops on is not a
    // compressibility. The engine discards `converged` (F-E15), so the
    // diameter comes back NaN with no error at all.
    const bad = { gasMMscfd: 50, pPsia: 800, tF: -30, gasSg: 1.25, ksFtS: 0.3 };
    const c = realEngine.contactorDiameter(bad);
    expect(c.error).toBeUndefined();
    expect(c.z).toBeLessThan(0);
    expect(Number.isNaN(c.diameterFt)).toBe(true);

    const standing = dakStanding(bad);
    expect(standing.warning).toContain('did not converge');
  });

  it('carries that all the way to the screen instead of an empty field', async () => {
    await set('teg', 'pPsia', '800');
    await set('teg', 'tF', '-30');
    await set('teg', 'gasSg', '1.25');
    await set('teg', 'inletMode', 'typed');
    expect(api.dehydration.error).toBeUndefined();
    expect(api.dehydration.zWarning).toContain('did not converge');
    expect(api.dehydration.nonFinite).toContain('diameterFt');
    expect(fmt(api.dehydration.contactor.diameterFt, 1)).toBe(NOT_A_NUMBER);
    expect(nonFiniteNote(api.dehydration.nonFinite)).toContain('the contactor diameter');
  });

  it('says so when the reduced conditions leave the band DAK was fitted over', () => {
    const standing = dakStanding({ pPsia: 14.7, tF: 100, gasSg: 0.65 });
    expect(standing.warning).toContain('off the');
    expect(standing.ppr).toBeCloseTo(0.0219, 4);
  });

  it('is quiet on the shipped defaults', () => {
    expect(dakStanding({ pPsia: 1000, tF: 100, gasSg: 0.65 }).warning).toBeNull();
    expect(dakStanding({ pPsia: 1000, tF: 110, gasSg: 0.7 }).warning).toBeNull();
    expect(api.dehydration.zWarning).toBeNull();
    expect(api.sweetening.zWarning).toBeNull();
    expect(api.dewpoint.zWarning).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Blast radius: the control sweeps, chosen before the flips were known
 * ------------------------------------------------------------------ */

/**
 * What this studio used to refuse, transcribed from `origin/main`.
 *
 * On main there were no bounds at all, so a tab refused exactly when
 * the engine refused. Everything else it answered, whatever the answer
 * was. The blast radius of this repair is therefore the set of
 * combinations that FLIP between answering and refusing, and the six
 * sweeps below were chosen before any flip had been counted.
 */
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

const oldTegRefused = (t) => {
  const saturated = realEngine.saturatedWaterContent({ pPsia: num(t.pPsia), tF: num(t.tF) });
  const inletLbMMscf = t.inletMode === 'saturated' && !saturated.error
    ? saturated.lbPerMMscf : num(t.inletLbMMscf);
  return Boolean(realEngine.tegPackage({
    gasMMscfd: num(t.gasMMscfd),
    inletLbMMscf,
    outletLbMMscf: num(t.outletLbMMscf),
    circulationGalPerLb: num(t.circulationGalPerLb),
    leanTegWtPct: num(t.leanTegWtPct),
    absorberTF: num(t.absorberTF),
    reboilerTF: num(t.reboilerTF),
    refluxRatio: num(t.refluxRatio),
    btexInletPpmv: num(t.btexInletPpmv),
    btexAbsorbedFrac: num(t.btexAbsorbedFrac),
  }).error);
};

const oldAmineRefused = (a) => Boolean(realEngine.aminePackage({
  gasMMscfd: num(a.gasMMscfd),
  co2MolPct: num(a.co2MolPct), h2sMolPct: num(a.h2sMolPct),
  co2SpecMolPct: num(a.co2SpecMolPct), h2sSpecMolPct: num(a.h2sSpecMolPct),
  amineId: a.amineId,
  amineWtPct: num(a.amineWtPct),
  leanLoading: num(a.leanLoading),
  richLoading: num(a.richLoading),
  dutyBtuPerGal: num(a.dutyBtuPerGal),
}).error);

const oldDewpointRefused = (d) => Boolean(realEngine.jouleThomsonFPerPsi({
  pPsia: num(d.p1Psia), tF: num(d.tF), gasSg: num(d.gasSg),
  cpBtuLbmolF: num(d.cpBtuLbmolF),
}).error);

const newRefused = {
  teg: (t) => tegIssue(t) !== null || oldTegRefused(t),
  amine: (a) => amineIssue(a) !== null || oldAmineRefused(a),
  dewpoint: (d) => dewpointIssue(d) !== null || oldDewpointRefused(d),
};
const oldRefused = { teg: oldTegRefused, amine: oldAmineRefused, dewpoint: oldDewpointRefused };

const grid = (base, axes) => {
  const keys = Object.keys(axes);
  const out = [];
  const walk = (i, acc) => {
    if (i === keys.length) { out.push({ ...base, ...acc }); return; }
    axes[keys[i]].forEach((v) => walk(i + 1, { ...acc, [keys[i]]: String(v) }));
  };
  walk(0, {});
  return out;
};

const flips = (section, cases) => cases.filter(
  (c) => oldRefused[section](c) !== newRefused[section](c),
);

const nudged = (base) => Object.keys(base)
  .filter((k) => Number.isFinite(parseFloat(base[k])))
  .flatMap((k) => [0.9, 1.1].map((f) => ({ ...base, [k]: String(parseFloat(base[k]) * f) })));

describe('blast radius: six control sweeps, chosen before the flips were counted', () => {
  it('control sweep 1: the TEG operating envelope, 324 combinations', () => {
    const cases = grid(defaultInputs().teg, {
      gasMMscfd: [10, 50, 200],
      pPsia: [500, 800, 1000, 1200],
      tF: [80, 100, 120],
      outletLbMMscf: [0.1, 4, 7],
      circulationGalPerLb: [2, 3, 4],
    });
    expect(cases).toHaveLength(324);
    expect(flips('teg', cases)).toEqual([]);
  });

  it('control sweep 2: the amine operating envelope, 729 combinations', () => {
    const cases = grid(defaultInputs().amine, {
      gasMMscfd: [20, 100, 300],
      pPsia: [600, 1000, 1400],
      tF: [90, 110, 130],
      co2MolPct: [1, 4, 8],
      h2sMolPct: [0.1, 1, 3],
      amineWtPct: [18, 28, 45],
    });
    expect(cases).toHaveLength(729);
    expect(flips('amine', cases)).toEqual([]);
  });

  it('control sweep 3: the dew point operating envelope, 243 combinations', () => {
    const cases = grid(defaultInputs().dewpoint, {
      p1Psia: [800, 1000, 1400],
      p2Psia: [200, 400, 600],
      tF: [80, 100, 120],
      gasSg: [0.6, 0.65, 0.75],
      cpBtuLbmolF: [9, 9.5, 11],
    });
    expect(cases).toHaveLength(243);
    expect(flips('dewpoint', cases)).toEqual([]);
  });

  it('control sweep 4: every TEG default moved 10 percent either way', () => {
    expect(flips('teg', nudged(defaultInputs().teg))).toEqual([]);
  });

  it('control sweep 5: every amine default moved 10 percent either way', () => {
    expect(flips('amine', nudged(defaultInputs().amine))).toEqual([]);
  });

  it('control sweep 6: every dew point default moved 10 percent either way', () => {
    expect(flips('dewpoint', nudged(defaultInputs().dewpoint))).toEqual([]);
  });

  it('flips only where the old answer was not an answer', () => {
    // The amine strength axis, swept through the bound. Everything the
    // repair newly refuses, the engine used to answer with a negative
    // circulation, an infinite one, or a strength above pure amine.
    const cases = grid(defaultInputs().amine, {
      amineWtPct: [-45, -1, 0, 1, 18, 45, 99, 100, 101, 150],
    });
    const flipped = flips('amine', cases).map((c) => parseFloat(c.amineWtPct));
    expect(flipped).toEqual([-45, -1, 0, 101, 150]);
    flipped.forEach((wt) => {
      const before = realEngine.aminePackage(amineArgs({ amineWtPct: wt }));
      expect(before.error).toBeUndefined();
      const impossible = !(before.circGpm > 0) || !Number.isFinite(before.circGpm) || wt > 100;
      expect([wt, impossible]).toEqual([wt, true]);
    });
  });
});

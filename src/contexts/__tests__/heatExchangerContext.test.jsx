/**
 * Numeric gates for the Heat Exchanger & Cooling Studio state layer
 * (FC6-0).
 *
 * The engine shim is a two-line re-export, so this context and the four
 * files under src/components/heatexchanger are the whole Suite-side
 * composition, and the only thing in the Suite that asserted anything
 * about any of it before this file was a page smoke test that mounted
 * the default case and clicked through the tabs.
 *
 * That mattered, because the worst defect in this studio was not in the
 * engine at all: `HeatExchangerContext` hard-coded `nTubes: 200` into
 * the tube-side film while the card beside it printed 92 tubes, so the
 * coefficient on screen belonged to a bundle the same screen
 * contradicted. Iterated to self-consistency the chain runs 200, 92, 76,
 * 74, and the numbers move a long way:
 *
 *   tubes assumed | Reynolds | hi     | U dirty | area ft2
 *   200 (shipped) | 16,299   | 247.26 | 73.853  | 286.3
 *   74 (settled)  | 44,052   | 547.76 | 92.110  | 229.5
 *
 * Every case below is a value that reaches the engine through a box in
 * the shipped studio, or a number the shipped studio printed. Each
 * refusal is asserted twice: that the studio refuses it and names the
 * value, and, where the recon measured it, what the studio used to print
 * instead.
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

import {
  HeatExchangerProvider, useHeatExchanger, defaultInputs, inputsFromPayload,
} from '@/contexts/HeatExchangerContext';

const savedService = jest.requireMock('@/utils/savedProjects').__service;

let api = null;
const Probe = () => { api = useHeatExchanger(); return null; };

const mount = async () => {
  await act(async () => {
    render(<HeatExchangerProvider><Probe /></HeatExchangerProvider>);
  });
};
const set = async (section, key, value) => {
  await act(async () => { api.setSection(section, key, value); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  api = null;
  savedService.list.mockResolvedValue([]);
  await mount();
});

/* ------------------------------------------------------------------ *
 * The shipped defaults
 * ------------------------------------------------------------------ */

describe('the shipped defaults, as numbers', () => {
  it('answers all three tabs', () => {
    expect(api.thermal.error).toBeUndefined();
    expect(api.coefficient.error).toBeUndefined();
    expect(api.sizing.error).toBeUndefined();
    expect(api.rating.error).toBeUndefined();
    expect(api.cooler.error).toBeUndefined();
  });

  it('closes the tube-count loop and lands on the self-consistent bundle', () => {
    // THE REPAIR. 200 was a literal in this file and 92 was on the card
    // beside it. Neither is the answer.
    expect(api.coefficient.tubeCountConverged).toBe(true);
    expect(api.coefficient.tubeTrail[0]).toBe(2);
    expect(api.coefficient.tubeTrail[api.coefficient.tubeTrail.length - 1]).toBe(74);
    expect(api.sizing.tubes.nTubes).toBe(74);
    // the film was computed at the SAME tube count the bundle reports
    expect(api.coefficient.film.tubesPerPass * 2).toBe(api.sizing.tubes.nTubes);
    expect(api.coefficient.film.re).toBeCloseTo(44051.846, 2);
    expect(api.coefficient.film.hBtuHrFt2F).toBeCloseTo(547.7624, 3);
    expect(api.coefficient.uDirtyBtuHrFt2F).toBeCloseTo(92.1103, 3);
    expect(api.sizing.areaFt2).toBeCloseTo(229.543, 2);
    // and what the studio used to print, for the record
    expect(286.29 / api.sizing.areaFt2 - 1).toBeCloseTo(0.2473, 3);
    expect(api.coefficient.film.re / 16299.18).toBeGreaterThan(2.7);
  });

  it('exposes the five resistances that used to be computed and thrown away', () => {
    const r = api.coefficient.resistances;
    expect(Object.keys(r).sort()).toEqual([
      'insideFilm', 'insideFouling', 'outsideFilm', 'outsideFouling', 'wall',
    ]);
    const sum = Object.values(r).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(api.coefficient.totalResistance, 12);
    expect(1 / sum).toBeCloseTo(api.coefficient.uDirtyBtuHrFt2F, 9);
    Object.keys(r).forEach((k) => {
      expect(api.coefficient.resistanceSharePct[k]).toBeCloseTo((r[k] / sum) * 100, 9);
    });
  });

  it('carries the controlling verdict WITH its margin', () => {
    // At the self-consistent 74 tubes the inside film falls to 0.002209
    // and the outside film leads it by 126 percent, so the verdict the
    // shipped studio printed was right for the wrong reason: at 200
    // tubes the margin was 2.2 percent.
    expect(api.coefficient.controlling).toBe('outsideFilm');
    expect(api.coefficient.controllingMarginPct).toBeGreaterThan(50);
    expect(api.coefficient.controllingClear).toBe(true);
    expect(api.coefficient.controllingNote).toBeNull();
  });

  it('rates the hot day instead of scaling it', () => {
    const h = api.cooler.hotDay;
    expect(h.error).toBeUndefined();
    expect(h.ambientF).toBe(110);
    expect(h.regime).toBe('hotter than design');
    // 90.3 percent, where the shipped studio printed 81
    expect(h.dutyFraction).toBeCloseTo(0.903226, 6);
    expect(h.processOutF).toBeCloseTo(159.677, 3);
    expect(h.airRiseF).toBeCloseTo(27.097, 3);
    // the three identities the shipped engine broke
    const cProcess = 20e6 / 100;
    const cAir = 20e6 / 30;
    expect(cProcess * (250 - h.processOutF)).toBeCloseTo(h.qBtuHr, 6);
    expect(cAir * h.airRiseF).toBeCloseTo(h.qBtuHr, 6);
    expect(h.airOutF).toBeCloseTo(110 + h.airRiseF, 9);
  });

  it('names the draft type behind the fan power', () => {
    expect(api.cooler.draftType).toBe('forced');
    expect(api.cooler.fanInletF).toBe(95);
    expect(api.cooler.fanBhp).toBeCloseTo(94.0039, 3);
    expect(api.cooler.barometricPsia).toBe(14.7);
    // the shipped studio took the density at the MEAN air temperature
    // and reported 96.55 bhp, which is neither draft type
    expect(Math.abs(api.cooler.fanBhp - 96.546)).toBeGreaterThan(2);
    expect(api.cooler.fCorrection).toBeNull();
    expect(api.cooler.fNote).toMatch(/cross-flow/);
  });

  it('drops the dead ntuTarget block', () => {
    // It inverted the effectiveness the rating had just computed from an
    // NTU eleven lines earlier, so it equalled that NTU by construction,
    // ran on every keystroke and was rendered nowhere.
    expect('ntuTarget' in api).toBe(false);
  });

  it('reports the ceiling honestly, and counter-current has none', () => {
    expect(api.rating.ceiling).toBeNull();
    // the same exchanger in parallel flow does have one
    return set('rating', 'arrangement', 'parallel').then(() => {
      expect(api.rating.ceiling).toBeCloseTo(1 / (1 + api.thermal.cr), 12);
    });
  });
});

/* ------------------------------------------------------------------ *
 * Negative controls: every one of these used to produce a number
 * ------------------------------------------------------------------ */

describe('inputs the studio used to answer', () => {
  it('refuses a hot outlet above the hot inlet by naming it', async () => {
    // It returned { qBtuHr: -550000, thOut: 320, tcOut: 93.13 } with no
    // error key, and the studio printed "Duty -0.55 MMBtu/hr", "Cold
    // outlet 93.1 F" and "LMTD 213.4 F" on three tabs.
    await set('streams', 'hotOutF', '320');
    expect(api.thermal.error).toBeTruthy();
    expect(api.thermal.error).toContain('320');
    expect(api.thermal.error).toContain('300');
    expect(api.thermal.qBtuHr).toBeUndefined();
    expect(api.sizing.error).toBeTruthy();
  });

  it('refuses a cold outlet below the cold inlet by naming it', async () => {
    await set('streams', 'dutyMode', 'coldOut');
    await set('streams', 'coldOutF', '90');
    expect(api.thermal.error).toContain('90');
    expect(api.thermal.qBtuHr).toBeUndefined();
  });

  it('refuses a duty no PARALLEL exchanger can deliver, in parallel flow', async () => {
    // 4.5 MMBtu/hr used to pass the balance and be caught two functions
    // later by the log mean with a message about a temperature cross.
    await set('streams', 'arrangement', 'parallel');
    await set('streams', 'dutyMode', 'duty');
    await set('streams', 'qMMBtuHr', '4.5');
    expect(api.thermal.error).toMatch(/PARALLEL/);
    await set('streams', 'arrangement', 'counter');
    expect(api.thermal.error).toBeUndefined();
    expect(api.thermal.qBtuHr).toBeCloseTo(4.5e6, 6);
  });

  it('refuses a negative fouling factor by naming it', async () => {
    // -0.01 used to return a DIRTY U of 393.63 against a clean 98.80 and
    // a fouling penalty of -298.4 percent, on screen, with no warning.
    await set('film', 'foulingOut', '-0.01');
    expect(api.coefficient.error).toContain('-0.01');
    expect(api.sizing.error).toBeTruthy();
  });

  it('refuses a zero or negative wall conductivity by naming it', async () => {
    // 0 used to return U dirty 0.0 and "Controlling resistance wall".
    await set('film', 'kWallBtuHrFtF', '0');
    expect(api.coefficient.error).toContain('0');
    expect(api.coefficient.controlling).toBeUndefined();
    await set('film', 'kWallBtuHrFtF', '-26');
    expect(api.coefficient.error).toContain('-26');
  });

  it('refuses every fan and motor efficiency it used to accept', async () => {
    // 0 gave Infinity bhp, -0.65 gave -96.5, 5 was accepted, and a motor
    // efficiency of 3 gave a motor drawing less than its shaft. `fmt`
    // printed the non-finite ones as "--", which is what an untouched
    // box shows.
    const cases = [
      ['fanEfficiency', '0'], ['fanEfficiency', '-0.65'], ['fanEfficiency', '5'],
      ['motorEfficiency', '0'], ['motorEfficiency', '3'],
      ['staticPressureInH2O', '-0.6'],
    ];
    for (const [key, value] of cases) {
      await set('air', key, value);
      expect(api.cooler.error).toBeTruthy();
      expect(api.cooler.error).toContain(value.replace(/^\+/, ''));
      expect(api.cooler.fanBhp).toBeUndefined();
      await set('air', key, String(defaultInputs().air[key]));
    }
    expect(api.cooler.error).toBeUndefined();
  });

  it('refuses a fractional shell count rather than rounding it', async () => {
    // 2.4 and 2.6 used to become 2 and 3 silently, and F differs
    // materially between them.
    await set('streams', 'arrangement', 'shell');
    expect(api.thermal.fError).toBeNull();
    await set('streams', 'shellPasses', '2.4');
    expect(api.thermal.fError).toMatch(/whole numbers/);
    expect(api.sizing.error).toBeTruthy();
    await set('streams', 'shellPasses', '1000');
    expect(api.thermal.fError).toContain('1000');
  });

  it('refuses an empty box by naming the box, not by reporting a cross', async () => {
    await set('air', 'ambientF', '');
    expect(api.cooler.error).toMatch(/empty or not a number/);
    expect(api.cooler.error).not.toMatch(/temperature cross/);
  });

  it('omits the hot-day block when the box is empty instead of rating a NaN', async () => {
    await set('air', 'checkAmbientF', '');
    expect(api.cooler.error).toBeUndefined();
    expect(api.cooler.hotDay).toBeUndefined();
  });

  it('labels a COLD day rather than printing 167 percent retained in emerald', async () => {
    await set('air', 'checkAmbientF', '40');
    const h = api.cooler.hotDay;
    expect(h.regime).toBe('colder than design');
    expect(h.dutyFraction).toBeCloseTo(1.354839, 6);
    expect(h.note).toMatch(/a capability that the plant may never draw on/);
    // the shipped engine said 1.6670 here
    expect(Math.abs(h.dutyFraction - 1.667)).toBeGreaterThan(0.3);
  });
});

/* ------------------------------------------------------------------ *
 * A saved study is the door the type="number" boxes do not guard
 * ------------------------------------------------------------------ */

describe('a restored study', () => {
  it('refuses a stored value that is not a number', async () => {
    // `parseFloat` took '50000 lb/hr' and '80000abc' as numbers and gave
    // a full answer, and took '50,000' as 50, which reached the engine
    // as a valid duty and then tripped the stream-cross refusal, so the
    // studio blamed the physics for a typing problem.
    for (const bad of ['50000 lb/hr', '80000abc', '50,000', '0.5.5']) {
      await set('streams', 'hotMLbHr', bad);
      expect(api.thermal.error).toBeTruthy();
      expect(api.thermal.error).toMatch(/hot stream/);
    }
  });

  it('refuses a stored arrangement that is not one of the three', async () => {
    // `inputsFromPayload` spreads stored strings in without validating
    // them, and 'Parallel' used to return the COUNTER-CURRENT answer: a
    // 40 percent error on the driving force, silently.
    const restored = inputsFromPayload({
      streams: { ...defaultInputs().streams, arrangement: 'Parallel' },
    });
    expect(restored.streams.arrangement).toBe('Parallel');
    await set('streams', 'arrangement', 'crossflow');
    // the studio maps its own three Select values and treats anything
    // else as counter-current at the boundary, so the engine is never
    // handed an unknown string from this door
    expect(api.thermal.engineArrangement).toBe('counter');
    expect(api.thermal.error).toBeUndefined();
  });
});

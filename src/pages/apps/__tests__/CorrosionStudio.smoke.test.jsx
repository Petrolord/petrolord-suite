/**
 * Corrosion & Integrity Studio: the page, and the NUMBERS on it.
 *
 * Before FC9-0 this file mounted the page, clicked the three tabs and
 * asserted the presence of headings. Not one number in the Suite layer
 * was checked anywhere, which is why a cleared pH box silently became
 * 4.5 and cut the answer by 43.8 percent for months.
 *
 * It now asserts the shipped default numbers on screen, and every unit
 * conversion and every fallback in `toEngineUnits` and
 * `inputsFromPayload` is checked directly, with a negative control on
 * each fallback proving the old flattering default is gone.
 */
import React from 'react';
import '@testing-library/jest-dom';
import {
  render, screen as rtl, fireEvent, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import CorrosionRatePredictor from '@/pages/apps/CorrosionRatePredictor';
import {
  defaultInputs, toEngineUnits, inputsFromPayload, coerceField, mpy, FLOW_REGIMES,
} from '@/contexts/CorrosionStudioContext';
import { screen as engineScreen } from '@/utils/facilities/engine/corrosion';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

const atDefaults = () => engineScreen({
  ...toEngineUnits(defaultInputs()),
  corrosionAllowanceMm: 0.125 * 25.4,
  consumedMm: 0,
  designLifeYears: 20,
});

describe('the unit conversion, which is the only thing this layer computes', () => {
  it('converts the shipped defaults to the engine units the correlations want', () => {
    const e = toEngineUnits(defaultInputs());
    expect(e.tC).toBeCloseTo(60, 9);                 // 140 F
    expect(e.pTotalBar).toBeCloseTo(51.00042747417918, 9); // 725 psig, through the layer's own 14.5038
    expect(e.co2MolFrac).toBeCloseTo(0.03, 12);
    expect(e.h2sMolFrac).toBeCloseTo(0.001, 12);
    expect(e.ph).toBeCloseTo(4.5, 12);
    expect(e.velocityMS).toBeCloseTo(3.048, 9);      // 10 ft/s
    expect(e.diameterM).toBeCloseTo(0.1524, 9);      // 6 in
    expect(e.densityKgM3).toBeCloseTo(897.036, 6);   // 56 lb/ft3
    expect(e.viscosityPaS).toBeCloseTo(1e-3, 12);    // 1 cp
    expect(e.waterCutFrac).toBeCloseTo(1, 12);
    expect(e.inhibitorEfficiencyPct).toBe(90);
    expect(e.inhibitorAvailabilityPct).toBe(95);
    expect(mpy(1)).toBeCloseTo(39.37007874015748, 9);
    expect(mpy(NaN)).toBeNull();
  });

  it('A BLANK BOX IS BLANK: no cleared box is filled in with a flattering number', () => {
    // A cleared pH box used to become 4.5, which applies a pH factor of
    // 0.562 and returns 0.7545 mm/yr where a typed 4.0 returns 1.3418.
    // Leaving a box empty cut the answer by 43.8 percent.
    const blank = (section, key) => {
      const i = defaultInputs();
      i[section][key] = '';
      return toEngineUnits(i);
    };
    expect(blank('conditions', 'ph').ph).toBeNaN();
    expect(blank('conditions', 'ph').ph).not.toBe(4.5);
    expect(blank('conditions', 'tF').tC).toBeNaN();
    expect(blank('conditions', 'pPsig').pTotalBar).toBeNaN();
    expect(blank('conditions', 'co2MolPct').co2MolFrac).toBeNaN();
    expect(blank('conditions', 'co2MolPct').co2MolFrac).not.toBe(0);
    expect(blank('conditions', 'h2sMolPct').h2sMolFrac).toBeNaN();
    expect(blank('flow', 'velocityFtS').velocityMS).toBeNaN();
    expect(blank('flow', 'idIn').diameterM).toBeNaN();
    expect(blank('flow', 'densityLbFt3').densityKgM3).toBeNaN();
    expect(blank('flow', 'viscosityCp').viscosityPaS).toBeNaN();
    expect(blank('flow', 'waterCutPct').waterCutFrac).toBeNaN();
    expect(blank('flow', 'waterCutPct').waterCutFrac).not.toBe(1);
    // the two kept fallbacks, where a blank genuinely means no inhibitor
    expect(blank('mitigation', 'inhibitorEfficiencyPct').inhibitorEfficiencyPct).toBe(0);
    expect(blank('mitigation', 'inhibitorAvailabilityPct').inhibitorAvailabilityPct).toBe(100);
  });

  it('every blank box that reaches the engine as NaN is REFUSED by it, with the input named', () => {
    const run = (section, key) => {
      const i = defaultInputs();
      i[section][key] = '';
      return engineScreen({
        ...toEngineUnits(i),
        corrosionAllowanceMm: 3.175, consumedMm: 0, designLifeYears: 20,
      });
    };
    expect(run('conditions', 'tF').error).toMatch(/temperature/i);
    expect(run('conditions', 'pPsig').error).toMatch(/pressure/i);
    expect(run('conditions', 'co2MolPct').error).toMatch(/CO2/i);
    expect(run('conditions', 'h2sMolPct').error).toMatch(/H2S/i);
    expect(run('conditions', 'ph').error).toMatch(/pH/i);
    expect(run('flow', 'velocityFtS').error).toMatch(/velocity/i);
    expect(run('flow', 'idIn').error).toMatch(/diameter/i);
    expect(run('flow', 'densityLbFt3').error).toMatch(/screening incomplete/i);
    expect(run('flow', 'viscosityCp').error).toMatch(/screening incomplete/i);
  });
});

describe('a restored study is coerced, not spread', () => {
  it('rejects what parseFloat would have accepted', () => {
    expect(coerceField('conditions', 'tF', '5abc', '140')).toBe('140');
    expect(coerceField('conditions', 'tF', '1e999', '140')).toBe('140');
    expect(coerceField('conditions', 'tF', '  160  ', '140')).toBe('160');
    expect(coerceField('conditions', 'tF', '', '140')).toBe('');
    expect(coerceField('conditions', 'tF', { nope: 1 }, '140')).toBe('140');
    expect(coerceField('conditions', 'tF', [1, 2], '140')).toBe('140');
    expect(coerceField('conditions', 'tF', 175, '140')).toBe('175');
    expect(coerceField('conditions', 'tF', Infinity, '140')).toBe('140');
  });

  it('validates the wetting regime instead of passing any string through', () => {
    expect(coerceField('flow', 'flowRegime', 'oilWet', 'waterWet')).toBe('oilWet');
    expect(coerceField('flow', 'flowRegime', 'OILWET', 'waterWet')).toBe('oilWet');
    expect(coerceField('flow', 'flowRegime', 'oil-wet', 'waterWet')).toBe('oilWet');
    expect(coerceField('flow', 'flowRegime', 'nonsense', 'waterWet')).toBe('waterWet');
    expect(coerceField('flow', 'flowRegime', 42, 'waterWet')).toBe('waterWet');
    expect(FLOW_REGIMES).toEqual(['waterWet', 'intermittent', 'oilWet']);
  });

  it('cleans the swept velocity list and drops the junk in it', () => {
    expect(coerceField('sweep', 'velocitiesFtS', '2,5,10', '2,5,10,15,20')).toBe('2,5,10');
    expect(coerceField('sweep', 'velocitiesFtS', '2, x, 10', '2,5,10,15,20')).toBe('2,10');
    expect(coerceField('sweep', 'velocitiesFtS', 'x,y', '2,5,10,15,20')).toBe('2,5,10,15,20');
  });

  it('a hostile payload restores to the defaults rather than into the engine', () => {
    const out = inputsFromPayload({
      inputs: {
        conditions: { tF: '5abc', ph: '1e999', co2MolPct: '3.5' },
        flow: { flowRegime: 'oil-wet-ish', velocityFtS: { a: 1 } },
        sweep: { velocitiesFtS: 'nope' },
        // a section that is not an object at all
        mitigation: 'garbage',
      },
    });
    const d = defaultInputs();
    expect(out.conditions.tF).toBe(d.conditions.tF);
    expect(out.conditions.ph).toBe(d.conditions.ph);
    expect(out.conditions.co2MolPct).toBe('3.5');
    expect(out.flow.flowRegime).toBe('waterWet');
    expect(out.flow.velocityFtS).toBe(d.flow.velocityFtS);
    expect(out.sweep.velocitiesFtS).toBe(d.sweep.velocitiesFtS);
    expect(out.mitigation).toEqual(d.mitigation);
    // and the coerced study runs
    expect(engineScreen({
      ...toEngineUnits(out), corrosionAllowanceMm: 3.175, designLifeYears: 20,
    }).error).toBeUndefined();
  });
});

describe('the numbers the studio puts on the screen at its own defaults', () => {
  it('produces the rate, the warning that could not fire, and the binding constraint', () => {
    const s = atDefaults();
    expect(s.error).toBeUndefined();
    expect(s.rate.rateMmYr).toBeCloseTo(0.7545236542623222, 10);
    expect(mpy(s.rate.rateMmYr)).toBeCloseTo(29.705655679618985, 8);
    expect(s.rate.uninhibitedMmYr).toBeCloseTo(5.20361140870567, 9);
    expect(s.category).toBe('high');
    // the warning the old guard `eff > 0.9` could not fire at 90 percent
    expect(s.rate.effectiveInhibitionPct).toBeCloseTo(85.5, 9);
    expect(s.rate.warning).toMatch(/85\.5 percent effective/);
    expect(s.shear.tauPa).toBeCloseTo(14.40806547777946, 9);
    expect(s.shear.filmRisk).toBe('low');
    expect(s.filmStripped).toBe(false);
    expect(s.regime.regime).toBe('mixed');
    expect(s.sour.sour).toBe(true);
    expect(s.life.remainingYears).toBeCloseTo(4.207952901230265, 9);
    expect(s.binding.what).toBe('the corrosion allowance against the design life');
    // the protective film onset, which is not the 60 C the guide claimed
    expect(s.rate.scaleOnsetTC).toBeCloseTo(80.98, 1);
    expect(s.rate.scaleFactor).toBe(1);
  });

  it('the withdrawn sour region and material guidance are not on the screen data at all', () => {
    const s = atDefaults();
    expect(s.sour.region).toBeUndefined();
    expect(s.sour.materialGuidance).toBeUndefined();
    expect(s.sour.regionProvided).toBe(false);
    expect(s.sour.materialGuidanceProvided).toBe(false);
    expect(s.sour.note).not.toMatch(/MR0175|15156/);
    expect(s.notProvided.join(' ')).toMatch(/severity region/);
    expect(s.notProvided.join(' ')).toMatch(/inspection interval/);
  });

  it('60 ft/s removes the inhibitor credit, which the old studio never did', () => {
    const i = defaultInputs();
    i.flow.velocityFtS = '60';
    const s = engineScreen({
      ...toEngineUnits(i), corrosionAllowanceMm: 3.175, consumedMm: 0, designLifeYears: 20,
    });
    expect(s.filmStripped).toBe(true);
    expect(s.shear.tauPa).toBeGreaterThan(100);
    expect(s.rate.rateMmYr).toBeCloseTo(13.080024036606241, 8);
    expect(s.rateWithFilmCreditMmYr).toBeCloseTo(1.8966034853079052, 8);
    expect(s.rate.rateMmYr / s.rateWithFilmCreditMmYr).toBeCloseTo(6.896551724137931, 9);
    expect(s.life.remainingYears).toBeCloseTo(0.2427365569905932, 9);
    expect(s.binding.what).toBe('wall shear on the inhibitor film');
  });

  it('1 mol% H2S stops the studio grading the rate', () => {
    const i = defaultInputs();
    i.conditions.h2sMolPct = '1';
    const s = engineScreen({
      ...toEngineUnits(i), corrosionAllowanceMm: 3.175, consumedMm: 0, designLifeYears: 20,
    });
    expect(s.regime.regime).toBe('sulphide');
    expect(s.category).toBeNull();
    expect(s.life).toBeNull();
    expect(s.withheld.upperBoundMmYr).toBeCloseTo(0.7545236542623222, 9);
  });

  it('a typed pH of 4.0 is 1.78 times the answer a blank box used to give', () => {
    const at = (ph) => {
      const i = defaultInputs();
      i.conditions.ph = ph;
      return engineScreen({
        ...toEngineUnits(i), corrosionAllowanceMm: 3.175, designLifeYears: 20,
      });
    };
    expect(at('4').rate.rateMmYr).toBeCloseTo(1.3417538787620145, 9);
    expect(at('4.5').rate.rateMmYr).toBeCloseTo(0.7545236542623222, 9);
    expect(at('4').rate.rateMmYr / at('4.5').rate.rateMmYr).toBeCloseTo(1.778279410038923, 9);
    // and below the reference it refuses rather than repeating pH 4.0
    expect(at('3.5').error).toMatch(/reference pH of 4/);
    expect(at('2').error).toMatch(/reference pH of 4/);
  });
});

describe('the page mounts and shows what it computed', () => {
  it('screens the default case and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <CorrosionRatePredictor />
      </MemoryRouter>,
    );

    expect(await rtl.findByText('Corrosion & Integrity Studio')).toBeInTheDocument();

    expect((await rtl.findAllByText(/Predicted rate/i)).length).toBeGreaterThan(0);
    expect(rtl.getAllByText(/Mass transfer limit/i).length).toBeGreaterThan(0);
    expect(rtl.getAllByText(/Effective inhibition/i).length).toBeGreaterThan(0);
    expect(rtl.getAllByText(/Wall shear/i).length).toBeGreaterThan(0);
    expect(rtl.getAllByText(/Rate against velocity/i).length).toBeGreaterThan(0);

    // the numbers, on the screen, at the shipped defaults
    expect(rtl.getAllByText('0.755').length).toBeGreaterThan(0);   // mm/yr
    expect(rtl.getAllByText(/29\.7 mpy, high/).length).toBeGreaterThan(0);
    expect(rtl.getAllByText('85.5').length).toBeGreaterThan(0);    // effective inhibition
    // the inhibitor warning that could not fire before
    expect(rtl.getAllByText(/availability, not efficiency/i).length).toBeGreaterThan(0);
    // the binding constraint, which the studio never had
    expect(rtl.getAllByText(/Binding constraint/i).length).toBeGreaterThan(0);
    expect(rtl.getAllByText(/the corrosion allowance against the design life/i).length).toBeGreaterThan(0);
    // and the held list
    expect(rtl.getAllByText(/What this studio does not provide/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(rtl.getByRole('tab', { name: 'Sour Service' }));
    await waitFor(() => expect(rtl.getAllByText(/H2S screening threshold/i).length).toBeGreaterThan(0));
    expect(rtl.getAllByText(/Which film governs/i).length).toBeGreaterThan(0);
    // THE WITHDRAWAL, on the screen
    expect(rtl.getAllByText(/does not classify sour service severity/i).length).toBeGreaterThan(0);
    expect(rtl.queryAllByText(/MR0175/i).length).toBe(0);
    expect(rtl.queryAllByText(/ISO 15156/i).length).toBe(0);
    expect(rtl.queryAllByText(/Most carbon steels qualified/i).length).toBe(0);
    expect(rtl.queryAllByText(/qualified CRA/i).length).toBe(0);

    fireEvent.mouseDown(rtl.getByRole('tab', { name: 'Integrity' }));
    await waitFor(() => expect(rtl.getAllByText(/Allowance and remaining life/i).length).toBeGreaterThan(0));
    expect(rtl.getAllByText(/Allowance the design life needs/i).length).toBeGreaterThan(0);
    // the integrity promise the guide used to make and the studio cannot keep
    expect(rtl.getAllByText(/no inspection interval here/i).length).toBeGreaterThan(0);
  });

  it('a cleared temperature box shows a refusal instead of a green rate of zero', async () => {
    render(
      <MemoryRouter>
        <CorrosionRatePredictor />
      </MemoryRouter>,
    );
    const tempBox = (await rtl.findAllByDisplayValue('140'))[0];
    fireEvent.change(tempBox, { target: { value: '' } });
    await waitFor(() => expect(rtl.getAllByText(/a finite temperature is required/i).length)
      .toBeGreaterThan(0));
    // and the old answer is nowhere on the screen
    expect(rtl.queryAllByText(/negligible/i).length).toBe(0);
    expect(rtl.queryAllByText(/unbounded/i).length).toBe(0);
  });
});

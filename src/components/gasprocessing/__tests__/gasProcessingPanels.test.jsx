/**
 * What the Gas Processing Studio actually puts on screen (FC4-0 F-U3).
 *
 * The context gates next door prove the studio refuses what the engine
 * cannot answer. These prove the refusal reaches the glass, and that a
 * result which is not a number no longer looks like a box nobody has
 * typed in.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(() => Promise.resolve([])), load: jest.fn(), save: jest.fn(), remove: jest.fn(),
  };
  return { createSavedProjectsService: () => service };
});
// The engine is wrapped so these can drive the two states the screen
// has to tell apart: a result the engine could not produce, and a
// contactor sized against a liquid other than the one asked for.
// Driving them from the engine's own behaviour would tie this file to
// one version of the engine, and the FC4-0 engine repair is landing
// beside this one.
jest.mock('@/utils/facilities/engine/gasProcessing', () => {
  const actual = jest.requireActual('@/utils/facilities/engine/gasProcessing');
  return {
    ...actual,
    contactorDiameter: jest.fn(actual.contactorDiameter),
    jtDrop: jest.fn(actual.jtDrop),
  };
});

jest.mock('@/lib/customSupabaseClient', () => {
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabase: { from: jest.fn(() => builder) } };
});

const engine = jest.requireMock('@/utils/facilities/engine/gasProcessing');
const realEngine = jest.requireActual('@/utils/facilities/engine/gasProcessing');

import { GasProcessingProvider } from '@/contexts/GasProcessingContext';
import { DehydrationInputs, DehydrationResults } from '@/components/gasprocessing/DehydrationPanels';
import {
  SweeteningInputs, SweeteningResults, DewpointResults,
} from '@/components/gasprocessing/SweeteningDewPanels';

/** An engine that reads the liquid density the caller passes. */
const honoursDensity = ({ rhoLLbFt3, ...rest }) => {
  const base = realEngine.contactorDiameter(rest);
  if (base.error || !(rhoLLbFt3 > 0)) return base;
  const vAllow = rest.ksFtS * Math.sqrt((rhoLLbFt3 - base.rhoG) / base.rhoG);
  return {
    ...base,
    vAllowFtS: vAllow,
    diameterFt: base.diameterFt * Math.sqrt(base.vAllowFtS / vAllow),
  };
};

/** An engine that hands back a diameter that is not a number. */
const handsBackNaN = (args) => ({ ...realEngine.contactorDiameter(args), diameterFt: NaN });

beforeEach(() => {
  engine.contactorDiameter.mockImplementation((args) => {
    const { rhoLLbFt3, ...rest } = args;
    return realEngine.contactorDiameter(rest);
  });
  engine.jtDrop.mockImplementation(realEngine.jtDrop);
});

const mount = async (ui) => {
  await act(async () => { render(<GasProcessingProvider>{ui}</GasProcessingProvider>); });
};

const typeInto = async (label, value) => {
  const box = screen.getByLabelText(label);
  await act(async () => { fireEvent.change(box, { target: { value } }); });
  return box;
};

describe('the dehydration tab on screen', () => {
  it('shows the water balance on the shipped defaults', async () => {
    await mount(<DehydrationResults />);
    expect(screen.getByText('Water balance')).toBeTruthy();
    expect(screen.getByText('4.0')).toBeTruthy();
  });

  it('puts the bounds of the quantity on the box itself', async () => {
    await mount(<DehydrationInputs />);
    const box = screen.getByLabelText('the circulation ratio');
    expect(box.getAttribute('min')).toBe('0');
    expect(box.getAttribute('max')).toBe('100');
  });

  it('refuses at the box, under the box, and on the results', async () => {
    await mount(<><DehydrationInputs /><DehydrationResults /></>);
    const box = await typeInto('the circulation ratio', '0');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText('the circulation ratio must be above 0 gal per lb').length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Water balance')).toBeNull();
  });

  it('names the liquid the contactor was really sized against', async () => {
    await mount(<DehydrationResults />);
    // Whichever published glycol density the engine carries.
    expect(screen.getByText(/against a liquid at 69\.\d lb\/ft3/)).toBeTruthy();
  });

  it('shows a result that is not a number as something other than an empty field', async () => {
    // The engine used to hand back a NaN diameter with no `error` key
    // on rich cold gas, where the z correlation does not converge and
    // returns a negative compressibility (F-U2). `fmt` rendered that as
    // `--`, which is what an untouched box looks like.
    engine.contactorDiameter.mockImplementation(handsBackNaN);
    await mount(<DehydrationResults />);
    expect(screen.getAllByText(/not a number/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('--')).toHaveLength(0);
    expect(screen.getByText(/the contactor diameter came back as something other than a number/))
      .toBeTruthy();
  });

  it('shows what the lean glycol strength buys, which used to be nothing', async () => {
    // `leanTegWtPct` was range checked and then never read: 99.0 and
    // 90.001 returned every field bit-identical. The FC4-0 engine
    // repair gives it the loop water balance, and this is where that
    // reaches the glass. A validated box that moves nothing on screen
    // is the same defect one layer up.
    await mount(<><DehydrationInputs /><DehydrationResults /></>);
    expect(screen.getByText('Rich glycol returning')).toBeTruthy();
    const at99 = screen.getByText(/lb of water per gallon/).textContent;
    await typeInto('the lean TEG strength', '95');
    const at95 = screen.getByText(/lb of water per gallon/).textContent;
    expect(at95).not.toBe(at99);
  });

  it('says on screen when the z correlation did not converge', async () => {
    await mount(<><DehydrationInputs /><DehydrationResults /></>);
    await typeInto('the pressure', '800');
    await typeInto('the gas temperature', '-30');
    await typeInto('the gas gravity', '1.25');
    // Cold gas holds almost no water, so the pipeline spec has to come
    // down with it or the tab refuses on the water balance first.
    await typeInto('the outlet spec', '0.1');
    expect(screen.getByText(/did not converge/)).toBeTruthy();
  });
});

describe('the sweetening tab on screen', () => {
  it('says so when the column is sized against a liquid other than the one asked for', async () => {
    // `beforeEach` strips `rhoLLbFt3` before the call reaches the
    // engine, which is what an engine that ignores it does. The note is
    // asserted against THAT, not against a particular engine version,
    // so it stays a gate on this studio's own behaviour.
    await mount(<SweeteningResults />);
    expect(screen.getByText(/the sizing did not use the liquid it was given/)).toBeTruthy();
    expect(screen.getByText(/The MDEA solution in this column is 64\.9 lb\/ft3/)).toBeTruthy();
  });

  it('drops the note when the engine reads the density it is passed', async () => {
    engine.contactorDiameter.mockImplementation(honoursDensity);
    await mount(<SweeteningResults />);
    expect(screen.queryByText(/the sizing did not use the liquid it was given/)).toBeNull();
    expect(screen.getByText(/against a liquid at 64\.9 lb\/ft3/)).toBeTruthy();
  });

  it('is silent on the vendored engine, which reads the density', async () => {
    // The unmocked path: the engine the app actually ships with.
    engine.contactorDiameter.mockImplementation(realEngine.contactorDiameter);
    await mount(<SweeteningResults />);
    expect(screen.queryByText(/the sizing did not use the liquid it was given/)).toBeNull();
    expect(screen.getByText(/against a liquid at 64\.9 lb\/ft3/)).toBeTruthy();
  });

  it('refuses a strength above pure amine by name', async () => {
    await mount(<><SweeteningInputs /><SweeteningResults /></>);
    await typeInto('the amine strength', '150');
    expect(screen.getAllByText('the amine strength must be below 100 wt %').length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Amine unit')).toBeNull();
  });
});

describe('the dew point tab on screen', () => {
  it('labels the inlet coefficient as the inlet coefficient', async () => {
    // It used to read "JT coefficient" beside a temperature that twenty
    // other coefficients produced (F-U4).
    await mount(<DewpointResults />);
    expect(screen.getByText('JT coefficient at the inlet')).toBeTruthy();
    expect(screen.getByText(/re-reads it at twenty pressures/)).toBeTruthy();
  });

  it('shows no mean coefficient when the march does not report one', async () => {
    // The card is conditional, and the condition is the ENGINE'S
    // RETURN, so the engine is wrapped to withhold the key rather than
    // the assertion being written against a particular engine version.
    // Asserting "no mean card" against the shipped engine is exactly
    // the gate that goes red on somebody else's correct fix.
    engine.jtDrop.mockImplementation((args) => {
      const { muMeanFPerPsi, ...rest } = realEngine.jtDrop(args);
      return rest;
    });
    await mount(<DewpointResults />);
    expect(screen.getByText('JT coefficient at the inlet')).toBeTruthy();
    expect(screen.queryByText('JT coefficient, mean over the drop')).toBeNull();
  });

  it('prints the coefficient the march delivered, and it is the cooling over the drop', async () => {
    await mount(<DewpointResults />);
    expect(screen.getByText('JT coefficient, mean over the drop')).toBeTruthy();
    expect(screen.getByText(/the cooling divided by the pressure drop/)).toBeTruthy();
    // On the shipped defaults, 1000 to 600 psia: the mean coefficient
    // is the cooling divided by the 400 psi, and it is NOT the inlet
    // coefficient, which is the whole reason the card exists.
    const drop = realEngine.jtDrop({
      p1Psia: 1000, p2Psia: 600, tF: 100, gasSg: 0.65, cpBtuLbmolF: 9.5,
    });
    expect(drop.muMeanFPerPsi).toBeCloseTo(drop.dropF / 400, 12);
    expect(drop.muMeanFPerPsi).not.toBeCloseTo(drop.muInletFPerPsi, 4);
    expect(screen.getByText((drop.muMeanFPerPsi * 100).toFixed(1))).toBeTruthy();
  });
});

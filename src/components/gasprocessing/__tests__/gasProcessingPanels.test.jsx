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
  it('says the column was sized against glycol when the engine sizes it against glycol', async () => {
    await mount(<SweeteningResults />);
    expect(screen.getByText(/which is the glycol a dehydration contactor holds/)).toBeTruthy();
    expect(screen.getByText(/The MDEA solution in this column is 64\.9 lb\/ft3/)).toBeTruthy();
  });

  it('drops the note the moment the engine reads the density it is passed', async () => {
    engine.contactorDiameter.mockImplementation(honoursDensity);
    await mount(<SweeteningResults />);
    expect(screen.queryByText(/which is the glycol a dehydration contactor holds/)).toBeNull();
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
    expect(screen.queryByText('JT coefficient, mean over the drop')).toBeNull();
  });

  it('prints the coefficient the march delivered as soon as the engine returns it', async () => {
    // `muMeanFPerPsi` arrives with the FC4-0 engine repair, which the
    // vendored copy here predates, so the engine is wrapped to return
    // it. The number beside a marched temperature should be the one the
    // march actually used.
    engine.jtDrop.mockImplementation((args) => {
      const drop = realEngine.jtDrop(args);
      if (drop.error) return drop;
      return { ...drop, muMeanFPerPsi: drop.dropF / (args.p1Psia - args.p2Psia) };
    });
    await mount(<DewpointResults />);
    expect(screen.getByText('JT coefficient, mean over the drop')).toBeTruthy();
    expect(screen.getByText(/the cooling divided by the pressure drop/)).toBeTruthy();
  });
});

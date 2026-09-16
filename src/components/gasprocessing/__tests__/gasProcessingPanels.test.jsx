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
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabase: { from: jest.fn(() => builder) } };
});

import { GasProcessingProvider } from '@/contexts/GasProcessingContext';
import { DehydrationInputs, DehydrationResults } from '@/components/gasprocessing/DehydrationPanels';
import { SweeteningInputs, SweeteningResults } from '@/components/gasprocessing/SweeteningDewPanels';

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
    expect(screen.getByText(/against a liquid at 69\.9 lb\/ft3/)).toBeTruthy();
  });

  it('shows a result that is not a number as something other than an empty field', async () => {
    await mount(<><DehydrationInputs /><DehydrationResults /></>);
    // Rich gas at low temperature drives the z correlation off its band
    // and it returns a negative compressibility, so the diameter comes
    // back NaN with no error at all (F-U2).
    await typeInto('the pressure', '800');
    await typeInto('the gas temperature', '-30');
    await typeInto('the gas gravity', '1.25');
    // Cold gas holds almost no water, so the pipeline spec has to come
    // down with it or the tab refuses on the water balance first.
    await typeInto('the outlet spec', '0.1');
    expect(screen.getAllByText(/not a number/).length).toBeGreaterThan(0);
    expect(screen.getByText(/the contactor diameter came back as something other than a number/))
      .toBeTruthy();
    expect(screen.getByText(/did not converge/)).toBeTruthy();
  });
});

describe('the sweetening tab on screen', () => {
  it('says the column was sized against glycol while the engine still does that', async () => {
    await mount(<SweeteningResults />);
    expect(screen.getByText(/which is the glycol a dehydration contactor holds/)).toBeTruthy();
    expect(screen.getByText(/The MDEA solution in this column is 64\.9 lb\/ft3/)).toBeTruthy();
  });

  it('refuses a strength above pure amine by name', async () => {
    await mount(<><SweeteningInputs /><SweeteningResults /></>);
    await typeInto('the amine strength', '150');
    expect(screen.getAllByText('the amine strength must be below 100 wt %').length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Amine unit')).toBeNull();
  });
});

/**
 * Smoke test: mount the whole Rod Pump Design Studio page (provider,
 * studio shell, every tab) with Supabase mocked. Catches broken imports
 * and wiring across the studio kit and the rodpump component tree that
 * unit tests on the pure analytics cannot see.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn().mockResolvedValue([]),
  listPoWells: jest.fn().mockResolvedValue([]),
  listFieldWellTests: jest.fn().mockResolvedValue([]),
}));

import RodPumpDesignStudio from '@/pages/apps/RodPumpDesignStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('RodPumpDesignStudio page', () => {
  it('designs an installation on the default inputs and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <RodPumpDesignStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rod Pump Design Studio')).toBeInTheDocument();

    // Design tab: the fluid load, what reaches the plunger, and the
    // dimensionless groups an RP 11L reader expects to see.
    expect(await screen.findByText(/What the plunger lifts/i)).toBeInTheDocument();
    expect(screen.getByText(/Loads, torque and the unit/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Plunger stroke/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/The dimensionless groups/i)).toBeInTheDocument();
    expect(screen.getByText(/Sp \/ S/)).toBeInTheDocument();
    // The generic linkage names itself as generic rather than posing as a unit.
    expect(screen.getByText(/not any manufacturer's unit/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Dyno Cards' }));
    await waitFor(() => expect(screen.getByText(/Surface card/i)).toBeInTheDocument());
    expect(screen.getByText(/Downhole card/i)).toBeInTheDocument();
    expect(screen.getByText(/Gearbox torque through a revolution/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Rod String' }));
    await waitFor(() => expect(screen.getByText(/The taper, section by section/i)).toBeInTheDocument());
    expect(screen.getByText(/Tension down the string/i)).toBeInTheDocument();
    expect(screen.getByText(/Rod grade/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Performance' }));
    await waitFor(() => expect(screen.getByText(/Production against pumping speed/i)).toBeInTheDocument());
    // The expensive run stays explicit.
    expect(screen.getByText(/runs when you ask for it/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Diagnostics' }));
    await waitFor(() => expect(screen.getByText(/Read a measured card/i)).toBeInTheDocument());
    // Nothing is diagnosed until a card is pasted in.
    expect(screen.getByText(/at least sixteen evenly spaced samples/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 60000);
});

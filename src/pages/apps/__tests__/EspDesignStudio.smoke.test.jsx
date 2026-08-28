/**
 * Smoke test: mount the whole ESP Design Studio page (provider, studio
 * shell, every tab) with Supabase mocked. Catches broken imports and
 * wiring across the studio kit and the esp component tree that unit
 * tests on the pure analytics cannot see.
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

import EspDesignStudio from '@/pages/apps/EspDesignStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('EspDesignStudio page', () => {
  it('sizes a pump on the default inputs and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <EspDesignStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('ESP Design Studio')).toBeInTheDocument();

    // Design tab: the head, its decomposition and the gas split. The
    // head and the stage count show in both the panel and the summary
    // rail, so these are all-matches assertions.
    expect((await screen.findAllByText(/Total dynamic head/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Where the head goes/i)).toBeInTheDocument();
    // The net lift the predecessor app left out is named on its own row.
    expect(screen.getByText(/Net vertical lift/i)).toBeInTheDocument();
    // The remainder is not called friction alone.
    expect(screen.getByText(/Friction and gas lightening/i)).toBeInTheDocument();
    expect(screen.getByText(/Gas at the intake/i)).toBeInTheDocument();
    // The summary sized a real stack.
    expect(screen.getAllByText(/^Stages$/).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pump Curve' }));
    await waitFor(() => expect(screen.getByText(/The duty on the stage curve/i)).toBeInTheDocument());
    expect(screen.getByText(/Best efficiency point/i)).toBeInTheDocument();
    // A reference stage says so rather than posing as a vendor pump.
    expect(screen.getAllByText(/reference model stage/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Performance' }));
    await waitFor(() => expect(screen.getByText(/Pump against system/i)).toBeInTheDocument());
    // The expensive run stays explicit.
    expect(screen.getByText(/runs when you ask for it/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Electrical' }));
    await waitFor(() => expect(screen.getByText(/Motor and surface power/i)).toBeInTheDocument());
    expect(screen.getByText(/Cable candidates/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AWG/).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Diagnostics' }));
    await waitFor(() => expect(screen.getByText(/What the installation is doing/i)).toBeInTheDocument());
    // Nothing is diagnosed until measurements are entered.
    expect(screen.getByText(/Enter a rate and both pressures/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 30000);
});

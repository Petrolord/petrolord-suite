/**
 * Smoke test: mount the whole Gas Lift Design Studio page (provider,
 * studio shell, every tab) with Supabase mocked. Catches broken imports
 * and wiring across the studio kit and the gaslift component tree that
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

import GasLiftDesignStudio from '@/pages/apps/GasLiftDesignStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('GasLiftDesignStudio page', () => {
  it('designs a valve string on the default inputs and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <GasLiftDesignStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Gas Lift Design Studio')).toBeInTheDocument();
    // Design tab: the plot, the valve sheet and a real test-rack column.
    expect(await screen.findByText(/Pressure against depth/i)).toBeInTheDocument();
    expect(screen.getByText(/Valve sheet/i)).toBeInTheDocument();
    expect(screen.getByText(/Test rack \(psig\)/i)).toBeInTheDocument();
    // At least one charged valve and the bottom orifice.
    expect(screen.getAllByText(/^V1$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Orifice/).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Unloading' }));
    await waitFor(() => expect(screen.getByText(/Unloading sequence/i)).toBeInTheDocument());
    expect(screen.getByText(/Gas through port/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Injection Point' }));
    await waitFor(() => expect(screen.getByText(/Deepest point of injection/i)).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Performance' }));
    await waitFor(() => expect(screen.getByText(/Response to injection gas/i)).toBeInTheDocument());
    // The expensive runs stay explicit.
    expect(screen.getByText(/runs when you ask for it/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/Trajectory/i)).toBeInTheDocument());
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 30000);
});

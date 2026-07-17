/**
 * Smoke test: mount the whole Waterflood Design Studio page (provider, shell,
 * all four tabs) with Supabase mocked. Catches broken imports/wiring across
 * the studio kit and the waterflooddesign component tree that unit tests on
 * the pure glue cannot see.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

import WaterfloodDesignStudio from '@/pages/apps/WaterfloodDesignStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('WaterfloodDesignStudio page', () => {
  it('renders every tab of the studio without crashing', async () => {
    render(
      <MemoryRouter>
        <WaterfloodDesignStudio />
      </MemoryRouter>,
    );

    // Displacement (default tab): the default Corey case computes and shows KPIs.
    expect(await screen.findByText('Waterflood Design Studio')).toBeInTheDocument();
    expect(screen.getAllByText(/Mobility ratio M/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: 'Layered Sweep' }));
    expect(screen.getAllByText(/Dykstra-Parsons/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: 'Pattern Forecast' }));
    expect(screen.getByText(/Annual CSV/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: 'Scenarios' }));
    expect(screen.getByText(/compares them/i)).toBeInTheDocument();
  });
});

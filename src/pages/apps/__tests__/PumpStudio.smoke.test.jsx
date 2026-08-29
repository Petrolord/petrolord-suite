/**
 * Smoke test: mount the whole Pump Station Designer page (provider,
 * studio shell, both tabs) with Supabase mocked.
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

import PumpStationDesigner from '@/pages/apps/PumpStationDesigner';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('PumpStationDesigner page', () => {
  it('solves the default duty point and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <PumpStationDesigner />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Pump Station Designer')).toBeInTheDocument();

    // The duty point is a solved intersection, and the app says so.
    expect((await screen.findAllByText(/Where the pump and the system meet/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Duty flow/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/solved intersection, not an assumed duty/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Operating region/i).length).toBeGreaterThan(0);
    // The curve chart with its marked crossing.
    expect(screen.getAllByText(/Pump against system/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/the only flow at which the pump makes exactly the head/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Suction & Changes' }));
    await waitFor(() => expect(screen.getAllByText(/Suction margin/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/NPSH available/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Customary margin/i).length).toBeGreaterThan(0);
    // Viscosity: a catalogue curve is a water curve.
    expect(screen.getAllByText(/catalogue curve is a water curve/i).length).toBeGreaterThan(0);
    // And the trim shortfall against the affinity ideal.
    expect(screen.getAllByText(/What a change would buy/i).length).toBeGreaterThan(0);
  });
});

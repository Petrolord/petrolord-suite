/**
 * Smoke test: mount the whole Pipeline & Line Sizing Studio page
 * (provider, studio shell, every tab) with Supabase mocked.
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

import PipelineLineSizingStudio from '@/pages/apps/PipelineLineSizingStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('PipelineLineSizingStudio page', () => {
  it('sizes the default liquid line and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <PipelineLineSizingStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Pipeline & Line Sizing Studio')).toBeInTheDocument();

    // Sizing tab: the selected bore's answer plus the sweep table with a
    // recommendation (the default 8000 bpd liquid case passes on some size).
    expect(await screen.findByText(/Selected line/i)).toBeInTheDocument();
    expect(screen.getByText(/Every schedule bore, same line/i)).toBeInTheDocument();
    expect(await screen.findByText('RECOMMENDED')).toBeInTheDocument();
    expect(screen.getByText(/RP 14E status/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Profile' }));
    await waitFor(() => expect(screen.getByText(/Hydraulic gradient/i)).toBeInTheDocument());
    expect(screen.getByText(/Arrival pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Add segment/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Wall Thickness' }));
    await waitFor(() => expect(screen.getByText(/Wall thickness and MAOP/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Required wall/i).length).toBeGreaterThan(0);
    // Default: 0.28 in wall vs required for 1440 psig X52 at F=0.72 + CA.
    expect(screen.getByText(/ADEQUATE|TOO THIN/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pigging' }));
    await waitFor(() => expect(screen.getByText(/Pigging estimates/i)).toBeInTheDocument());
    // Holdup defaults to the Multiphase tab's Beggs & Brill answer.
    expect(screen.getByText(/Beggs & Brill holdup/i)).toBeInTheDocument();
    // Either an interval, or the honest refusal that the sweep alone
    // overfills the stated catcher (the default case sits near that edge).
    expect(screen.getByText(/Pigging interval|pig more often/i)).toBeInTheDocument();
  });

  it('prefills from a Fluid Studio backbone hand-off', async () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/dashboard/apps/facilities/facility-network-hydraulics',
          state: { fluidStudioData: { oil_gravity: 41.2, gas_gravity: 0.72, inlet_temperature: 145 } },
        }]}
      >
        <PipelineLineSizingStudio />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Fluid Studio backbone applied/i)).toBeInTheDocument();
    // The hand-off lands the studio in multiphase mode with the values set.
    expect(await screen.findByDisplayValue('41.2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.72')).toBeInTheDocument();
    expect(screen.getByDisplayValue('145')).toBeInTheDocument();
  });
});

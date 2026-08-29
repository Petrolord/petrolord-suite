/**
 * Smoke test: mount the whole Produced Water Treatment Studio page
 * (provider, studio shell, both tabs) with Supabase mocked.
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

import ProducedWaterTreatment from '@/pages/apps/ProducedWaterTreatment';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('ProducedWaterStudio page', () => {
  it('runs the default train on real droplet physics', async () => {
    render(
      <MemoryRouter>
        <ProducedWaterTreatment />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Produced Water Treatment Studio')).toBeInTheDocument();

    // The fluid card proves temperature and salinity now do something:
    // the predecessor collected both and used neither.
    expect((await screen.findAllByText(/The water itself/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water viscosity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Density difference/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/driving force for gravity separation/i).length).toBeGreaterThan(0);

    // Stage table with cut sizes, not fixed efficiencies.
    expect(screen.getAllByText(/Stage by stage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cut size d50c/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Droplet median out/i).length).toBeGreaterThan(0);
    // The coupling statement that is the whole point.
    expect(screen.getAllByText(/do not together\s+remove 99.9 percent|do not together remove 99.9 percent/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Droplets' }));
    await waitFor(() => expect(screen.getAllByText(/Inlet droplets against the cut sizes/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/what that device mostly misses/i).length).toBeGreaterThan(0);
  });
});

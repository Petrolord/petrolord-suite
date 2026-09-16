/**
 * Smoke test: mount the whole Gas Processing Studio page (provider,
 * studio shell, every tab) with Supabase mocked.
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

import GasTreatingDehydration from '@/pages/apps/GasTreatingDehydration';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('GasProcessingStudio page', () => {
  it('runs the default TEG case and moves through the three units', async () => {
    render(
      <MemoryRouter>
        <GasTreatingDehydration />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Gas Processing Studio')).toBeInTheDocument();

    // Dehydration: the water balance with the duty split into its parts,
    // plus the Kremser stage answer and a contactor diameter.
    expect(await screen.findByText(/Water balance/i)).toBeInTheDocument();
    // also mirrored in the summary rail
    expect(screen.getAllByText(/TEG circulation/i).length).toBeGreaterThan(0);
    // The reboiler duty split into its named parts, which is the hint
    // under the duty card. Matched on the split itself rather than on
    // the bare word, which the loop water balance card also uses.
    expect(screen.getByText(/sensible \+ .* overhead Btu\/gal/i)).toBeInTheDocument();
    expect(screen.getByText(/Stages the spec demands/i)).toBeInTheDocument();
    expect(screen.getByText(/Contactor diameter/i)).toBeInTheDocument();
    // What the lean glycol strength buys, live with the FC4-0 engine pin.
    expect(screen.getByText(/Rich glycol returning/i)).toBeInTheDocument();
    // The inlet is water-saturated at line conditions by default.
    expect(screen.getAllByText(/saturated at line conditions/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sweetening' }));
    await waitFor(() => expect(screen.getAllByText(/Amine unit/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Acid gas picked up/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Rich loading/i).length).toBeGreaterThan(0);
    // The honest limit of a mole balance is stated, not hidden.
    expect(screen.getByText(/rate-based simulation/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Dew Point' }));
    await waitFor(() => expect(screen.getByText(/Joule-Thomson screening/i)).toBeInTheDocument());
    // Both coefficient cards by their own names. A bare /JT coefficient/
    // was a gate that went red the day the engine started returning the
    // one the march actually delivered, which is a correct fix.
    expect(screen.getByText('JT coefficient at the inlet')).toBeInTheDocument();
    expect(screen.getByText('JT coefficient, mean over the drop')).toBeInTheDocument();
    expect(screen.getByText(/Cooling across the drop/i)).toBeInTheDocument();
    expect(screen.getByText(/Water the cold gas can hold/i)).toBeInTheDocument();
  });
});

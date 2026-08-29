/**
 * Smoke test: mount the whole Relief & Flare Studio page (provider,
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

import ReliefBlowdownSizer from '@/pages/apps/ReliefBlowdownSizer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('ReliefFlareStudio page', () => {
  it('sizes the default gas case and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <ReliefBlowdownSizer />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Relief & Flare Studio')).toBeInTheDocument();

    // PSV tab: default 50,000 lb/hr gas case lands on a real orifice.
    expect(await screen.findByText(/Required orifice/i)).toBeInTheDocument();
    expect(screen.getByText(/API 526 orifice/i)).toBeInTheDocument();
    expect(screen.getByText(/Critical flow/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'KO Drum' }));
    await waitFor(() => expect(screen.getByText(/Knockout drum/i)).toBeInTheDocument());
    expect(screen.getByText(/Dropout velocity/i)).toBeInTheDocument();
    expect(screen.getAllByText(/L\/D/).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Radiation' }));
    await waitFor(() => expect(screen.getByText(/point source/i)).toBeInTheDocument());
    expect(screen.getByText(/Distance the allowable demands/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Blowdown' }));
    await waitFor(() => expect(screen.getByText(/Adiabatic depressuring/i)).toBeInTheDocument());
    expect(screen.getByText(/Time to end pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Final temperature/i)).toBeInTheDocument();
  });
});

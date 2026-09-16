/**
 * Smoke test: mount the whole Heat Exchanger & Cooling Studio page
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

import HeatExchangerSizer from '@/pages/apps/HeatExchangerSizer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('HeatExchangerStudio page', () => {
  it('sizes the default case and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <HeatExchangerSizer />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Heat Exchanger & Cooling Studio')).toBeInTheDocument();

    // Sizing: the chain from balance to bundle.
    expect((await screen.findAllByText(/Driving force/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/LMTD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Overall coefficient/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Controlling resistance/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Surface and bundle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bundle diameter/i).length).toBeGreaterThan(0);
    // FC6-0: the five resistances are on screen, not just the winning
    // word, and the tube-count loop shows its trail.
    expect(screen.getAllByText(/The five resistances/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Outside film/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tube wall/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/iterated to one tube/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Surface over the requirement/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Rating' }));
    await waitFor(() => expect(screen.getAllByText(/What this exchanger delivers/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/NTU/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effectiveness/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Maximum possible duty/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Air Cooler' }));
    await waitFor(() => expect(screen.getAllByText(/design ambient/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Fan power/i).length).toBeGreaterThan(0);
    // The hot-day derate is the point of the tab.
    expect(screen.getAllByText(/On a hot day/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Capacity retained/i).length).toBeGreaterThan(0);
    // FC6-0: the hot day is RATED, so the new outlet and the new air
    // rise are on the tab beside the duty, and the draft type is named.
    expect(screen.getAllByText(/Process leaves at/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Air rise then/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effectiveness held/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fan inlet air/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Draft type/i).length).toBeGreaterThan(0);
  });
});

/**
 * Smoke test: mount the whole Compressor Station Designer page
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

import CompressorStationDesigner from '@/pages/apps/CompressorStationDesigner';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('CompressorStationDesigner page', () => {
  it('stages the default duty and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <CompressorStationDesigner />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Compressor Station Designer')).toBeInTheDocument();

    // Staging tab: the stage count names what governed it, which is the
    // whole point of doing both limits.
    expect((await screen.findAllByText(/The machine/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ratio per stage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/set by/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stage by stage/i).length).toBeGreaterThan(0);
    // Both idealisations shown together.
    expect(screen.getAllByText(/Head, both ways/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Isentropic efficiency/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Machine & Fuel' }));
    await waitFor(() => expect(screen.getAllByText(/Reciprocating or centrifugal/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Inlet volume/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Driver fuel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/comes out of the stream being compressed/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pressure Sweep' }));
    await waitFor(() => expect(screen.getAllByText(/Power against discharge pressure/i).length).toBeGreaterThan(0));
    // The staging-step insight the sweep exists to show.
    expect(screen.getAllByText(/just below a step/i).length).toBeGreaterThan(0);
  });
});

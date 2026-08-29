/**
 * Smoke test: mount the whole Control Valve & Choke Sizing page
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

import ControlValveSizing from '@/pages/apps/ControlValveSizing';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('ControlValveSizing page', () => {
  it('sizes the default liquid service at three flows and checks control', async () => {
    render(
      <MemoryRouter>
        <ControlValveSizing />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Control Valve & Choke Sizing')).toBeInTheDocument();

    // Three flow cases, not one: that is the point of the sizing tab.
    expect((await screen.findAllByText(/Cv at each flow/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Minimum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Normal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maximum').length).toBeGreaterThan(0);
    // The liquid columns carry the choking boundary and the regime.
    expect(screen.getAllByText(/Allowable dP/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sigma/i).length).toBeGreaterThan(0);
    // The RP 14E outlet limit, reused from the validated production engine.
    expect(screen.getAllByText(/Body velocity limit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/erode its own body/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Control & Noise' }));
    await waitFor(() => expect(screen.getAllByText(/Authority and characteristic/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Valve authority/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Travel at each flow/i).length).toBeGreaterThan(0);
    // The failure a single-point Cv never shows.
    expect(screen.getAllByText(/never shows in a\s+single-point Cv|single-point Cv calculation/i).length).toBeGreaterThan(0);
  });
});

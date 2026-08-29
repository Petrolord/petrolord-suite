/**
 * Smoke test: mount the whole Flow Metering Designer page (provider,
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

import FlowMeteringDesigner from '@/pages/apps/FlowMeteringDesigner';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('FlowMeteringDesigner page', () => {
  it('computes the coefficient rather than assuming it, then budgets the uncertainty', async () => {
    render(
      <MemoryRouter>
        <FlowMeteringDesigner />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Flow Metering Designer')).toBeInTheDocument();

    expect((await screen.findAllByText(/Flow through the plate you have/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Discharge coefficient/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not a constant 0\.61/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/The plate a target flow needs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Upstream straight run/i).length).toBeGreaterThan(0);

    // The uncertainty tab is the thesis of the app.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Uncertainty' }));
    await waitFor(() => expect(screen.getAllByText(/Where the uncertainty comes from/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Dominant term/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Turndown and the transmitter/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/most misunderstood thing in gas/i).length).toBeGreaterThan(0);
  });
});

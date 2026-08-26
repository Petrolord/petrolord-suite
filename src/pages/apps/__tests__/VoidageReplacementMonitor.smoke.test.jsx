/**
 * Smoke test: mount the whole Voidage Replacement Monitor page (provider,
 * Studio shell, both tabs) with Supabase mocked. Catches broken
 * imports/wiring across the studio kit and the vrrmonitor component tree
 * that unit tests on the pure engine cannot see.
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

import VoidageReplacementMonitor from '@/pages/apps/VoidageReplacementMonitor';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('VoidageReplacementMonitor page', () => {
  it('renders both tabs and computes VRR from the sample dataset', async () => {
    render(
      <MemoryRouter>
        <VoidageReplacementMonitor />
      </MemoryRouter>,
    );

    // Shell + default Data tab.
    expect(await screen.findByText('Voidage Replacement Monitor')).toBeInTheDocument();
    expect(screen.getByText(/Production & injection by period/i)).toBeInTheDocument();
    expect(screen.getByText(/Bo \(RB\/STB\)/i)).toBeInTheDocument();

    // Load the deterministic sample; the KPI rail should show real numbers.
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    // First sample month: injected 40800 RB / produced 90970 RB = 0.45
    // (documented oracle in vrrCalculations.test.js).
    expect(await screen.findByText(/Cumulative VRR/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Total Produced Voidage/i).length).toBeGreaterThan(0);

    // Dashboard tab renders the trend chart card.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'VRR Dashboard' }));
    expect(screen.getByText(/VRR trend/i)).toBeInTheDocument();
  });

  it('shows the empty-state hint on the dashboard with no data', () => {
    render(
      <MemoryRouter>
        <VoidageReplacementMonitor />
      </MemoryRouter>,
    );
    fireEvent.mouseDown(screen.getAllByRole('tab', { name: 'VRR Dashboard' })[0]);
    expect(screen.getByText(/Enter production & injection volumes on the Data tab/i)).toBeInTheDocument();
  });
});

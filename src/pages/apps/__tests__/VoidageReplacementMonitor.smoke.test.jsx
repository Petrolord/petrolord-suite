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

    // Load the deterministic sample (exact name: "Sample wells" is the V2
    // importer's separate button); the KPI rail should show real numbers.
    fireEvent.click(screen.getByRole('button', { name: 'Sample' }));
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

  it('imports the sample well ledger through the real parser and shows the monthly ledger (V2)', async () => {
    render(
      <MemoryRouter>
        <VoidageReplacementMonitor />
      </MemoryRouter>,
    );

    // "Sample wells" runs vrrTemplateCSV() through parseVrrWellCSV — the
    // template IS the engine fixture, so the ledger shows oracle months.
    fireEvent.click(await screen.findByRole('button', { name: /Sample wells/i }));
    expect(await screen.findByText(/Monthly field ledger/i)).toBeInTheDocument();
    expect(screen.getByText('2025-01')).toBeInTheDocument();
    expect(screen.getByText('2025-03')).toBeInTheDocument();
    // 2 producers / 2 injectors from the fixture classification.
    expect(screen.getByText(/2 producers, 2 injectors/i)).toBeInTheDocument();
    // Manual grid is replaced while an import is active.
    expect(screen.queryByText(/Production & injection by period/i)).not.toBeInTheDocument();

    // Dashboard shows the trend with the imported series.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'VRR Dashboard' }));
    expect(screen.getByText(/VRR trend/i)).toBeInTheDocument();

    // Clear import returns to manual entry.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data & PVT' }));
    fireEvent.click(screen.getByRole('button', { name: /Clear import/i }));
    expect(await screen.findByText(/Production & injection by period/i)).toBeInTheDocument();
  });

  it('pressure tab gates without surveys, then charts once a survey attaches (V3)', async () => {
    render(
      <MemoryRouter>
        <VoidageReplacementMonitor />
      </MemoryRouter>,
    );

    // Imported ledger gives YYYY-MM period labels for pressure attachment.
    fireEvent.click(await screen.findByRole('button', { name: /Sample wells/i }));
    await screen.findByText(/Monthly field ledger/i);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pressure' }));
    // Withheld with a reason until pressure attaches.
    expect(screen.getByText(/withheld/i)).toBeInTheDocument();

    // Add one survey via the left rail; a single point clamps flat across
    // all periods, so the chart appears.
    fireEvent.click(screen.getByTitle('Add survey'));
    const dateInput = screen.getByPlaceholderText('YYYY-MM-DD');
    const pInput = screen.getByPlaceholderText('psia');
    fireEvent.change(dateInput, { target: { value: '2025-01-01' } });
    fireEvent.change(pInput, { target: { value: '3000' } });
    expect(await screen.findByText(/VRR vs reservoir pressure/i)).toBeInTheDocument();

    // Pressure-track mode reveals fluid inputs and flags the chart title.
    fireEvent.click(screen.getByRole('button', { name: /Pressure track/i }));
    expect(screen.getByText(/Oil API/i)).toBeInTheDocument();
    expect(await screen.findByText(/pressure-dependent FVFs active/i)).toBeInTheDocument();
  });
});

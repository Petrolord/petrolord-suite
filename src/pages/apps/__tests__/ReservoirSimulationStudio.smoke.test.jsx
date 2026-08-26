/**
 * Smoke test: mount the whole Reservoir Simulation Studio page (provider,
 * Studio shell, all three tabs) with Supabase mocked. Catches broken
 * imports/wiring across the studio kit and the simstudio component tree.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const CASE_ROW = {
  id: 'case-1', user_id: 'u1', name: 'SPE1 demo', description: '',
  deck_source: 'template', template_slug: 'SPE1CASE1',
  deck_path: 'u1/case-1/deck/SPE1CASE1.DATA', deck_bytes: 12000,
  created_at: '2026-08-26T00:00:00Z', updated_at: '2026-08-26T00:00:00Z',
};
const RUN_ROW = {
  id: 'run-11111111', case_id: 'case-1', user_id: 'u1', status: 'failed',
  cancel_requested: false, attempt: 1, queued_at: '2026-08-26T01:00:00Z',
  failure_stage: 'sim_failed', error_message: 'The simulator reported an error:\nError: unknown keyword FOO',
  elapsed_seconds: 12, report_steps: null, result_path: null,
  log_path: 'u1/case-1/runs/run-1/prt_excerpt.txt', opm_version: 'flow 2026.04',
};

const queryResult = (table) => (table === 'sim_cases' ? [CASE_ROW] : [RUN_ROW]);

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: jest.fn().mockResolvedValue({ data: 'run-2', error: null }),
    from: jest.fn((table) => {
      const chain = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: queryResult(table), error: null }),
        single: () => Promise.resolve({ data: CASE_ROW, error: null }),
        then: (resolve) => resolve({ data: queryResult(table), error: null }),
      };
      return chain;
    }),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        download: jest.fn().mockResolvedValue({
          // jsdom Blob lacks .text(); a thenable text() double is enough.
          data: { text: () => Promise.resolve('RUNSPEC\nDIMENS\n 10 10 3 /\nEND\n') },
          error: null,
        }),
      })),
    },
  },
}));

import ReservoirSimulationStudio from '@/pages/apps/ReservoirSimulationStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

const mount = () => render(
  <MemoryRouter>
    <ReservoirSimulationStudio />
  </MemoryRouter>,
);

describe('ReservoirSimulationStudio page', () => {
  it('renders the shell, auto-opens the latest case, shows templates', async () => {
    mount();
    expect(await screen.findByText('Reservoir Simulation Studio')).toBeInTheDocument();
    // Most recent case auto-opens: its name shows in the select trigger.
    expect(await screen.findByText('SPE1 demo')).toBeInTheDocument();
    // Deck tab is default: template cards present.
    expect(screen.getByText(/SPE1 — Odeh/i)).toBeInTheDocument();
    expect(screen.getByText(/SPE9 — Killough/i)).toBeInTheDocument();
  });

  it('shows the open case deck text and honest run history', async () => {
    mount();
    await screen.findByText('SPE1 demo');
    // Deck text downloads into the editor.
    await waitFor(() => {
      expect(screen.getByTestId('deck-editor').value).toContain('RUNSPEC');
    });

    // Runs tab shows the failed run with its real failure stage + error.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Runs' }));
    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText('sim_failed')).toBeInTheDocument();
    expect(screen.getByText(/unknown keyword FOO/i)).toBeInTheDocument();
    // Queue button present for a case with a deck.
    expect(screen.getByTestId('queue-run')).toBeEnabled();
  });

  it('results tab is honest when no completed runs exist', async () => {
    mount();
    await screen.findByText('SPE1 demo');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Results' }));
    expect(await screen.findByText(/Run a simulation first/i)).toBeInTheDocument();
  });

  it('builder tab generates a deck through the real engines and attaches it (S3)', async () => {
    mount();
    await screen.findByText('SPE1 demo');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Builder' }));
    // Guided form renders with engine-backed defaults.
    expect(await screen.findByText(/Grid — 300 cells/i)).toBeInTheDocument();
    expect(screen.getByText(/correlations from Fluid Studio/i)).toBeInTheDocument();
    // Generate runs correlation PVT + Corey SCAL + composeDeck for real
    // (only the upload is mocked) and reports the solved bubble point.
    fireEvent.click(screen.getByTestId('generate-deck'));
    expect(await screen.findByText(/Model generated \(Pb \d+ psia/i)).toBeInTheDocument();
  });
});

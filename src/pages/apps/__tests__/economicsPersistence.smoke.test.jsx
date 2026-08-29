/**
 * Smoke tests for the three economics apps that gained persistence in
 * Economics E2: NPV Scenario Builder, Value of Information Analyzer and
 * Probabilistic Breakeven Analyzer.
 *
 * These mount the whole page with Supabase mocked, which is the only thing
 * that catches a broken import or a mis-wired prop across the studio kit and
 * the app's own component tree. The E1 engine tests cannot see any of it.
 *
 * They also exercise the payload round trip directly, because a saved study
 * that cannot be read back is worse than no persistence at all: the user
 * believes their work is safe.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import NpvScenarioBuilder, { defaultState, stateFromPayload } from '@/pages/apps/NpvScenarioBuilder';
import ValueOfInformationAnalyzer, {
  defaultInputs as voiDefaults, inputsFromPayload as voiFromPayload,
} from '@/pages/apps/ValueOfInformationAnalyzer';
import ProbabilisticBreakevenAnalyzer, {
  defaultInputs as beDefaults, inputsFromPayload as beFromPayload,
} from '@/pages/apps/ProbabilisticBreakevenAnalyzer';
import { missingTableMessage } from '@/hooks/useSavedProjects';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

describe('Probabilistic Breakeven Analyzer page', () => {
  it('mounts with the saved-study rail, the seed field and the help guide', async () => {
    render(<MemoryRouter><ProbabilisticBreakevenAnalyzer /></MemoryRouter>);

    expect(await screen.findByText('Saved study')).toBeInTheDocument();
    expect(screen.getByText('Breakeven Analysis Setup')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();

    // E1's seed field lives in Simulation Settings, which starts collapsed.
    // Reproducibility is a user-visible property now, so it has to be there.
    fireEvent.click(screen.getByText('Simulation Settings'));
    expect(await screen.findByText('Run Seed')).toBeInTheDocument();
    expect(screen.getByText(/reproduce the same answer/i)).toBeInTheDocument();
  });

  it('refuses to run without a production profile', async () => {
    render(<MemoryRouter><ProbabilisticBreakevenAnalyzer /></MemoryRouter>);
    // The run button is disabled until real production data is uploaded; the
    // app has always refused to invent a profile and that must stay true.
    const run = await screen.findByRole('button', { name: /Run Simulation/i });
    expect(run).toBeDisabled();
  });

  it('round-trips its inputs through a stored payload', () => {
    const inputs = { ...beDefaults(), seed: 7, taxRate: 42 };
    const restored = beFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.seed).toBe(7);
    expect(restored.taxRate).toBe(42);
    expect(restored.variables).toHaveLength(3);
  });

  it('falls back to the default variables when a payload carries none', () => {
    const restored = beFromPayload({ inputs: { seed: 1, variables: [] } });
    expect(restored.variables).toHaveLength(3);
    expect(beFromPayload(null)).toBeNull();
  });
});

describe('Value of Information Analyzer page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    render(<MemoryRouter><ValueOfInformationAnalyzer /></MemoryRouter>);
    expect(await screen.findByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('computes a VOI when run from the empty state', async () => {
    render(<MemoryRouter><ValueOfInformationAnalyzer /></MemoryRouter>);
    const runners = await screen.findAllByRole('button', { name: /Analy[sz]e|Run/i });
    fireEvent.click(runners[0]);
    // The shipped default case has a positive net VOI, so the results panel
    // must appear with real KPI labels rather than a spinner that never ends.
    await waitFor(() => {
      expect(screen.getAllByText(/EMV/i).length).toBeGreaterThan(0);
    });
  });

  it('round-trips its inputs and rejects a payload missing the decision', () => {
    const inputs = { ...voiDefaults(), decisionCost: 55 };
    expect(voiFromPayload({ inputs }).decisionCost).toBe(55);
    expect(voiFromPayload({ inputs: { decisionCost: 5 } })).toBeNull();
    expect(voiFromPayload(null)).toBeNull();
  });
});

describe('NPV Scenario Builder page', () => {
  it('mounts with the saved-scenario rail, both modes and the help button', async () => {
    render(<MemoryRouter><NpvScenarioBuilder /></MemoryRouter>);
    expect(await screen.findByText('Saved scenario')).toBeInTheDocument();
    expect(screen.getByText(/Quick Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Expert Mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Help & Training/i })).toBeInTheDocument();
  });

  it('keeps both input sets so switching mode does not discard the other', () => {
    const restored = stateFromPayload({
      state: { mode: 'Expert', quickData: { oilPrice: 80 }, expertData: { projectLife: 15 } },
    });
    expect(restored.mode).toBe('Expert');
    expect(restored.quickData.oilPrice).toBe(80);
    expect(restored.expertData.projectLife).toBe(15);
  });

  it('defaults to Quick mode and rejects an unreadable payload', () => {
    expect(defaultState().mode).toBe('Quick');
    expect(stateFromPayload({ state: { mode: 'Nonsense' } })).toBeNull();
    expect(stateFromPayload(null)).toBeNull();
  });
});

describe('missing-table message', () => {
  it('tells the user which migration to run rather than showing raw SQL error text', () => {
    const err = { code: '42P01', message: 'relation "public.saved_npv_projects" does not exist' };
    expect(missingTableMessage(err, 'saved_npv_projects', 'e2_economics_persistence'))
      .toBe("Saving isn't set up yet. Run the e2_economics_persistence migration.");
  });

  it('passes any other error through unchanged', () => {
    const err = { code: '23505', message: 'duplicate key value' };
    expect(missingTableMessage(err, 'saved_npv_projects', 'e2_economics_persistence'))
      .toBe('duplicate key value');
  });
});

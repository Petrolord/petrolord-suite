/**
 * Design system rollout batch 1D: Fluid Systems Studio wraps itself in
 * <ThemedApp>. The shared helpers check the standard four; the extra cases
 * walk the input and result tabs (blending and the batch sweep switched
 * on), the help drawer, and the compositional cards (flash, separator, EOS
 * table, envelope, composition input, lab tuning) rendered inside a scope.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describeAppTheme, expectNoLegacyChrome, installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';

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

import { ThemedApp } from '@/design/ThemeProvider';
import FluidSystemsStudio from '@/pages/apps/FluidSystemsStudio';
import FluidStudioEmptyState from '@/components/fluidstudio/FluidStudioEmptyState';
import CompositionalResultsCard from '@/components/fluidstudio/CompositionalResultsCard';
import CompositionalSeparatorCard from '@/components/fluidstudio/CompositionalSeparatorCard';
import EosPvtTableCard from '@/components/fluidstudio/EosPvtTableCard';
import PhaseEnvelopeCard from '@/components/fluidstudio/PhaseEnvelopeCard';
import CompositionInput from '@/components/fluidstudio/CompositionInput';
import LabTuningCard from '@/components/fluidstudio/LabTuningCard';
import {
  runEosFlash, runEosSeparator, runEosPvtTable, emptyComposition,
} from '@/utils/fluidstudio/eosAnalysis';

const TITLE = 'Fluid Systems & Flow Behavior Studio';
// Input tabs sit in the left rail, result tabs in the main area; some share a
// name (Blending, Flow Assurance), so pick by position.
const inputTab = (name) => screen.getAllByRole('tab', { name })[0];
const resultTab = (name) => { const all = screen.getAllByRole('tab', { name }); return all[all.length - 1]; };
const renderApp = () => render(<MemoryRouter><FluidSystemsStudio /></MemoryRouter>);

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Fluid Systems Studio',
  route: '/dashboard/apps/reservoir/fluid-systems-studio',
  renderApp,
  ready: () => screen.findAllByText(TITLE),
  scopeTestId: 'fluid-theme-scope',
});

const sampleComposition = () => ({
  ...emptyComposition(),
  zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
  plus: { mw: 190, sg: 0.84, tbF: null },
  pressure: 2500,
  temp: 200,
});
const stages = [
  { pressure: 450, temperature: 120, enabled: true },
  { pressure: 200, temperature: 100, enabled: true },
];

describe('Fluid Systems Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('input tabs and result tabs (blending and batch on) leave no legacy colour', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    expectNoLegacyChrome();

    for (const tab of ['Correlations', 'Separators', 'Flow Assurance']) {
      fireEvent.mouseDown(inputTab(tab));
      expectNoLegacyChrome();
    }
    fireEvent.mouseDown(inputTab('Blending'));
    fireEvent.click(screen.getByRole('switch', { name: /Blend Stream B into A/i }));
    expectNoLegacyChrome();
    fireEvent.mouseDown(inputTab('Batch'));
    fireEvent.click(screen.getByRole('switch', { name: /Batch sensitivity sweep/i }));
    expectNoLegacyChrome();

    for (const tab of ['Separator Train', 'Blending', 'Batch Sweep', 'Flow Assurance']) {
      fireEvent.mouseDown(resultTab(tab));
      expectNoLegacyChrome();
    }
  }, 30000);

  it('the help drawer carries the scope and stays clean', async () => {
    renderApp();
    await screen.findAllByText(TITLE);
    fireEvent.click(screen.getByTitle('Fluid Studio documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the empty state and the compositional cards are clean inside a scope', () => {
    const comp = sampleComposition();
    render(
      <ThemedApp userId="fluid-theme-test">
        <FluidStudioEmptyState onRunSample={() => {}} />
        <CompositionInput composition={comp} onChange={() => {}} />
        <CompositionalResultsCard eos={runEosFlash(comp)} />
        <CompositionalSeparatorCard separator={runEosSeparator(comp, stages).separator} />
        <EosPvtTableCard result={runEosPvtTable(comp, stages)} />
        <PhaseEnvelopeCard composition={comp} />
        <LabTuningCard composition={comp} stages={stages} onUpdateTuning={() => {}} />
      </ThemedApp>,
    );
    expect(screen.getByText('EOS black-oil table')).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});

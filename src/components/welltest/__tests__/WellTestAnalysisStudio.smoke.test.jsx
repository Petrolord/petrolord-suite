/**
 * Smoke test: mount the whole Well Test Analysis Studio page (provider,
 * shell, all five tabs) with Supabase mocked, load the sample buildup and
 * walk the workflow. Catches broken imports/wiring across the studio kit
 * and the welltest component tree that unit tests on the pure glue cannot
 * see.
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

import WellTestAnalysisStudio from '@/pages/apps/WellTestAnalysisStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.setPointerCapture = window.HTMLElement.prototype.setPointerCapture || (() => {});
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

describe('WellTestAnalysisStudio page', () => {
  it('renders every tab and runs the sample buildup through the workflow', async () => {
    render(
      <MemoryRouter>
        <WellTestAnalysisStudio />
      </MemoryRouter>,
    );

    // Data tab (default): empty state, then the sample loads and QC KPIs appear.
    expect(await screen.findByText('Well Test Analysis Studio')).toBeInTheDocument();
    expect(screen.getByText(/No test data loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    expect(await screen.findByText(/Points used/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pressure history/i).length).toBeGreaterThan(0);

    // Diagnostics: log-log plot and regime detection on the sample.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Diagnostics' }));
    expect(await screen.findByText(/Log-log diagnostic plot/i)).toBeInTheDocument();
    // a real detected-regime chip (not the static help text): "X to Y hr (N decades)"
    expect((await screen.findAllByText(/decades\)/)).length).toBeGreaterThan(0);

    // Match: model catalog, sliders and the regression trigger.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Match' }));
    expect(await screen.findByRole('button', { name: /Auto-fit model/i })).toBeEnabled();
    expect(screen.getAllByText(/Log-log match/i).length).toBeGreaterThan(0);

    // Specialized: Horner plot for the buildup sample.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Specialized' }));
    expect(await screen.findByText(/Horner plot/i)).toBeInTheDocument();
    expect(screen.getAllByText(/psi\/cycle/i).length).toBeGreaterThan(0);

    // RTA (WT9): empty state prompting for production data.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'RTA' }));
    expect((await screen.findAllByText(/No production data loaded/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Transient linear window/i).length).toBeGreaterThan(0);

    // Report: consolidated summary with the derived KPIs.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Report' }));
    expect(await screen.findByText(/Straight-line analyses/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Radius of investigation/i).length).toBeGreaterThan(0);
  });
});

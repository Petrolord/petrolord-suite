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

  it('REFUSES a liquid sizing when the vapour pressure box is cleared', async () => {
    render(
      <MemoryRouter>
        <ControlValveSizing />
      </MemoryRouter>,
    );
    await screen.findByText(/Control Valve/i);
    // The cleared Pv box used to supply the engine's own default of zero,
    // which made sigma infinite, took the last branch of the regime ladder
    // and printed Regime "stable" in GREEN for every liquid service at
    // every pressure drop, with Sigma "n/a" beside it.
    // The Field primitive does not associate its label with its input, so
    // the box is found through the label's own container.
    const boxFor = (re) => screen.getAllByText(re)[0].parentElement.querySelector('input');
    fireEvent.change(boxFor(/^Pv \(psia\)$/i), { target: { value: '' } });
    await waitFor(() => expect(
      screen.getAllByText(/a true vapour pressure is needed/i).length,
    ).toBeGreaterThan(0));
    expect(screen.getAllByText(/every service reads as stable/i).length).toBe(3);
    expect(screen.queryByText(/^stable$/)).not.toBeInTheDocument();
  });

  it('withholds the travel verdict when a flow is missing, and says how many checks ran', async () => {
    render(
      <MemoryRouter>
        <ControlValveSizing />
      </MemoryRouter>,
    );
    await screen.findByText(/Control Valve/i);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Control/i }));
    await waitFor(() => expect(screen.getAllByText(/Travel at each flow/i).length).toBeGreaterThan(0));
    // all three flows given: a verdict is offered, with the count beside it
    expect(screen.getAllByText(/checks ran/i).length).toBeGreaterThan(0);
    // clear the minimum flow: the near-seat check cannot run, so the
    // verdict is withheld. This used to print "WORKABLE" in green.
    const boxFor = (re) => screen.getAllByText(re)[0].parentElement.querySelector('input');
    fireEvent.change(boxFor(/^Min \(gpm\)$/i), { target: { value: '' } });
    await waitFor(() => expect(screen.getAllByText(/NO VERDICT/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/near-seat rangeability check/i)).toBeInTheDocument();
    expect(screen.queryByText(/WORKABLE/)).not.toBeInTheDocument();
    // and "not given" is distinguished from "beyond the valve"
    expect(screen.getAllByText(/not given/i).length).toBeGreaterThan(0);
  });

  it('exposes the piping geometry factor that used to be a hidden persisted input', async () => {
    render(
      <MemoryRouter>
        <ControlValveSizing />
      </MemoryRouter>,
    );
    await screen.findByText(/Control Valve/i);
    expect(screen.getAllByText(/Piping geometry factor Fp/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/divides into every Cv/i)).toBeInTheDocument();
    // and the erosional card has two velocities to compare rather than one
    expect(screen.getAllByText(/Outlet bore \(in\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Actual velocity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Of the limit/i).length).toBeGreaterThan(0);
  });
});

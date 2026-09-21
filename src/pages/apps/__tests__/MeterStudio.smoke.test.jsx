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

  it('THE TWO ROUTES MEET: the budget takes its differential term from the transmitter', async () => {
    render(
      <MemoryRouter>
        <FlowMeteringDesigner />
      </MemoryRouter>,
    );
    await screen.findByText(/Flow Metering/i);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Uncertainty/i }));
    await waitFor(() => expect(
      screen.getAllByText(/Where the uncertainty comes from/i).length,
    ).toBeGreaterThan(0));
    // The budget used to take a TYPED 0.5 percent while the transmitter
    // card beside it computed 0.15 percent from the same reading and span.
    expect(screen.getAllByText(/Differential term/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/from the transmitter, not typed/i)).toBeInTheDocument();
    expect(screen.getByText(/percent of a 200 in H2O span read at 100 in H2O/i)).toBeInTheDocument();
    // and the runner-up is shown, so a photo finish is visible
    expect(screen.getAllByText(/Runner up/i).length).toBeGreaterThan(0);
    // the claim the arithmetic denied is gone
    expect(screen.queryByText(/A more precisely bored plate buys nothing/i)).not.toBeInTheDocument();
    expect(screen.getByText(/depends on where the run sits in its span/i)).toBeInTheDocument();
    // and there is no longer a typed differential box to disagree with it
    expect(screen.queryByText(/^Differential \(%\)$/)).not.toBeInTheDocument();
  });

  it('reports a DIFFERENTIAL turndown and a FLOW turndown, by name', async () => {
    render(
      <MemoryRouter>
        <FlowMeteringDesigner />
      </MemoryRouter>,
    );
    await screen.findByText(/Flow Metering/i);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Uncertainty/i }));
    await waitFor(() => expect(
      screen.getAllByText(/Turndown and the transmitter/i).length,
    ).toBeGreaterThan(0));
    // The tile used to say "Turndown ... to 1" with no qualifier, above a
    // paragraph repeating the three-to-one FLOW rule, and the engine warned
    // on the differential one, about five times too early.
    expect(screen.getAllByText(/Differential turndown/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Flow turndown/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/nine to one differential turndown/i)).toBeInTheDocument();
  });

  it('renders the sizing warning on the number the engine attached it to', async () => {
    render(
      <MemoryRouter>
        <FlowMeteringDesigner />
      </MemoryRouter>,
    );
    await screen.findByText(/Flow Metering/i);
    // At the app's own defaults sizeOrifice returns beta 0.6074 with the
    // "beta above 0.6" warning attached to the SIZING result, and only the
    // flow card's warning used to be rendered, so it was dropped.
    await waitFor(() => expect(
      screen.getAllByText(/The plate a target flow needs/i).length,
    ).toBeGreaterThan(0));
    expect(screen.getByText(/uncertainty and the straight-run requirement both rise/i))
      .toBeInTheDocument();
    expect(screen.getByText(/a plate is bored to a stock size/i)).toBeInTheDocument();
  });

  it('WITHHOLDS the out-of-plane straight run rather than answering from a broken column', async () => {
    render(
      <MemoryRouter>
        <FlowMeteringDesigner />
      </MemoryRouter>,
    );
    await screen.findByText(/Flow Metering/i);
    // The default fitting answers.
    await waitFor(() => expect(screen.getAllByText(/Upstream straight run/i).length).toBeGreaterThan(0));
    // Switching to two elbows out of plane used to print 75 diameters from
    // a column that fell by 15 as beta rose and then rose by 20.
    const trigger = screen.getAllByText(/Single elbow/i)[0];
    fireEvent.click(trigger);
    const option = await screen.findByText(/Two elbows, different planes/i);
    fireEvent.click(option);
    await waitFor(() => expect(
      screen.getAllByText(/fell by 15 diameters/i).length,
    ).toBeGreaterThan(0));
    expect(screen.queryByText(/Upstream straight run/i)).not.toBeInTheDocument();
  });
});

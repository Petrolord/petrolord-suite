/**
 * Terminal & Depot Studio page (DS5).
 *
 * The engine is validated in downstream.terminalDepot.test.js. This mounts the
 * app and checks the claims it makes on screen, above all the two refusals:
 * that it does not ship the published VCF table, and that it names the
 * unaccounted gap rather than balancing itself.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

import TerminalDepotStudio from '@/pages/apps/TerminalDepotStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/TerminalDepotContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><TerminalDepotStudio /></MemoryRouter>);

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Terminal & Depot Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('says it does not ship the published correction table', async () => {
    mount();
    expect(await screen.findByText(/published table this app does not ship/i)).toBeInTheDocument();
    expect(screen.getByText(/only gross observed volumes are reported/i)).toBeInTheDocument();
  });

  it('reports gross volumes with no VCF, rather than nothing', async () => {
    mount();
    // One line per tank, and there are two.
    expect((await screen.findAllByText(/no standard volume without a VCF/i)).length).toBeGreaterThan(0);
  });

  it('names the unaccounted gap and its tolerance basis', async () => {
    mount();
    expect(await screen.findByText(/Unaccounted:/i)).toBeInTheDocument();
    expect(screen.getByText(/measurement error scales with throughput/i)).toBeInTheDocument();
  });

  // MD3-0. The page used to derive the opening stock from today's dip, so the
  // day ALWAYS balanced (unaccounted 0 for every input). With the sample
  // opening stock the sample day closes 3 m3 short (dips 2,975 + 1,248 =
  // 4,223 against an expected 4,068 + 800 - 640 - 2 = 4,226).
  it('closes the day from the opening stock and shows the gap', async () => {
    mount();
    expect(await screen.findByText('Unaccounted: -3.0 m3 (loss)')).toBeInTheDocument();
  });

  // MD3-1: cover counts days of LIFTINGS. Pumpable stock tank by tank is
  // (2,975 - 120) + (1,248 - 80) = 4,023 m3 against 640 m3 lifted a day, 6.3
  // days; dividing by receipts plus deliveries (1,440) gave 2.8.
  it('counts days of cover on what is lifted', async () => {
    mount();
    await screen.findByText('Days of cover');
    const row = screen.getByText('Days of cover').closest('tr');
    expect(row.textContent).toContain('6.3');
  });

  it('refuses to close the day with no opening stock', async () => {
    mount();
    await screen.findByText('Unaccounted: -3.0 m3 (loss)');
    const opening = screen.getAllByRole('spinbutton').find((el) => el.value === '4068');
    fireEvent.change(opening, { target: { value: '' } });
    expect(await screen.findByText('The day cannot be closed')).toBeInTheDocument();
    expect(screen.getByText(/No opening stock/)).toBeInTheDocument();
  });

  it('separates a run from noise on the trend', async () => {
    mount();
    expect(await screen.findByText(/One day's gain is noise/i)).toBeInTheDocument();
  });

  it('models the rack as a queue and says why', async () => {
    mount();
    expect(await screen.findByText(/does not have 15 percent spare, it has a queue/i)).toBeInTheDocument();
  });

  it('counts working capacity net of the heel', async () => {
    mount();
    // Appears as the table row label and again in the note beneath it.
    expect((await screen.findAllByText(/Working capacity/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/planning on volume that cannot come out/i)).toBeInTheDocument();
  });

  it('gives the money answer and states the carbon absence', async () => {
    mount();
    expect(await screen.findByText(/Throughput, in money and in carbon/i)).toBeInTheDocument();
    // No emission factor is supplied by default, so carbon must be absent and
    // said to be, not reported as zero.
    expect(screen.getByText(/invented one would be worse than none/i)).toBeInTheDocument();
  });

  it('says plainly when the rack cannot keep up', async () => {
    mount();
    // The heading appears on both the input panel and the results panel.
    await screen.findAllByText(/Loading rack/i);
    // Find the arrivals field by its own label rather than by value, which
    // several fields share.
    const arrivals = screen.getByLabelText(/Arrivals \(\/hr\)/i);
    fireEvent.change(arrivals, { target: { value: '20' } });
    expect(await screen.findByText(/grows without limit/i)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.day.receiptsM3 = 1234;
    expect(inputsFromPayload({ inputs }).day.receiptsM3).toBe(1234);
  });

  it('refuses a payload with no tanks', () => {
    expect(inputsFromPayload({ inputs: { tanks: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });
});

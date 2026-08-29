/**
 * Fuel Pricing & Supply Chain Studio page (DS6).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.fuelPricing.test.js. This mounts the
 * app and checks the things a user could be misled by if the wiring slipped:
 * that no rate is shipped as if it were authority, that an incomplete
 * build-up is labelled a floor rather than a cost, and that a cap below the
 * chain is named as a shortfall instead of quietly capping the number.
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

import FuelPricingStudio from '@/pages/apps/FuelPricingStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/FuelPricingContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><FuelPricingStudio /></MemoryRouter>);

/** Every rate input is labelled "<line> rate", which is how they are found. */
const rateInput = (label) => screen.getByLabelText(`${label} rate`);

/** The tab trigger activates on mousedown, not on click. */
const openChainTab = async () => {
  fireEvent.mouseDown(
    await screen.findByRole('tab', { name: /Lane, fleet & station/i }),
    { button: 0 },
  );
};

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Fuel Pricing & Supply Chain Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('ships the line items with no rate filled in', async () => {
    mount();
    await screen.findByText('Import charges');
    // A shipped rate would be read as authority and would go stale silently.
    ['Import duty', 'Marketer margin', 'Dealer margin'].forEach((label) => {
      expect(rateInput(label)).toHaveValue(null);
      expect(rateInput(label)).toHaveAttribute('placeholder', 'required');
    });
  });

  it('says the rates are the user\'s and must be confirmed', async () => {
    mount();
    expect(await screen.findByText(/regulation in force/i)).toBeInTheDocument();
    expect(screen.getByText(/required input/i)).toBeInTheDocument();
  });

  it('calls an incomplete build-up a floor rather than a cost', async () => {
    mount();
    expect(await screen.findByText(/still required/i)).toBeInTheDocument();
    expect(screen.getAllByText(/floor/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Landed (floor)')).toBeInTheDocument();
  });

  it('stops calling it a floor once every rate is supplied', async () => {
    mount();
    await screen.findByText('Import charges');
    screen.getAllByLabelText(/ rate$/).forEach((el) => fireEvent.change(el, { target: { value: '1' } }));
    expect(await screen.findByText('Every rate supplied.')).toBeInTheDocument();
    expect(screen.getByText('Landed')).toBeInTheDocument();
  });

  it('names the shortfall when a cap sits below the chain', async () => {
    mount();
    await screen.findByText('Import charges');
    const cap = screen.getByLabelText(/Regulated cap/i);
    fireEvent.change(cap, { target: { value: '100' } });
    // A cap below the chain does not make the cost go away.
    expect(await screen.findByText(/below what the chain costs/i)).toBeInTheDocument();
    expect(screen.getByText(/absorbing it/i)).toBeInTheDocument();
  });

  it('reports a cap that does cover the chain', async () => {
    mount();
    await screen.findByText('Import charges');
    fireEvent.change(screen.getByLabelText(/Regulated cap/i), { target: { value: '99999' } });
    expect(await screen.findByText(/covers the chain/i)).toBeInTheDocument();
  });

  it('explains that ocean loss divides rather than adds', async () => {
    mount();
    expect(await screen.findByText(/pay for the loaded quantity/i)).toBeInTheDocument();
  });

  it('shows the lane, the fleet and the station on the supply-chain tab', async () => {
    mount();
    await openChainTab();
    expect(await screen.findByText('The fleet')).toBeInTheDocument();
    // "The lane" and "The station" also head input groups in the rail, so
    // they are expected twice rather than once.
    expect(screen.getAllByText('The lane')).toHaveLength(2);
    expect(screen.getAllByText('The station')).toHaveLength(2);
    expect(screen.getByText('Trucks required')).toBeInTheDocument();
  });

  it('leaves trucking carbon absent until a factor is supplied', async () => {
    mount();
    await openChainTab();
    expect(await screen.findByText(/absent rather than zero/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Diesel factor/i), { target: { value: '2.68' } });
    expect(await screen.findByText(/kgCO2e per trip/i)).toBeInTheDocument();
  });

  it('offers the lane cost for the transport line instead of writing it in', async () => {
    mount();
    await openChainTab();
    const btn = await screen.findByRole('button', { name: /Use this as the transport line/i });
    // Silently overwriting a rate the user typed is how a build-up stops
    // meaning what its author thinks it means, so it takes a click.
    expect(rateInput('Transport to station')).toHaveValue(null);
    fireEvent.click(btn);
    expect(Number(rateInput('Transport to station').value)).toBeGreaterThan(0);
  });

  it('says an oversubscribed forecourt has an unbounded queue', async () => {
    mount();
    await openChainTab();
    fireEvent.change(screen.getByLabelText(/^Nozzles/), { target: { value: '1' } });
    expect(await screen.findByText('unbounded')).toBeInTheDocument();
    expect(screen.getByText(/arrivals exceed capacity/i)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.cargo.quantity = 12345;
    inputs.fxRate = 1700;
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.cargo.quantity).toBe(12345);
    expect(restored.fxRate).toBe(1700);
    expect(restored.charges.length).toBeGreaterThan(0);
  });

  it('refuses a payload with no cargo', () => {
    expect(inputsFromPayload({ inputs: {} })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('ships every rate absent, so a restored study cannot inherit a guess', () => {
    defaultInputs().charges.concat(defaultInputs().elements).forEach((row) => {
      expect(row.amount).toBeNull();
    });
  });
});

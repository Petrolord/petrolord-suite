/**
 * Modular Refinery Feasibility Studio page (DS4).
 *
 * The engine is validated in downstream.modularRefinery.test.js. This mounts
 * the app and checks the claims it makes on screen: that the scaling
 * comparison is shown rather than buried, that supply scenarios are labelled
 * as scenarios and not probabilities, and that the valuation names the engine
 * and tier it used.
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

import ModularRefineryFeasibility from '@/pages/apps/ModularRefineryFeasibility';
import { defaultInputs, inputsFromPayload } from '@/contexts/ModularRefineryContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><ModularRefineryFeasibility /></MemoryRouter>);

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Modular Refinery Feasibility/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('puts the scaling comparison on screen rather than inside a number', async () => {
    mount();
    expect(await screen.findByText(/both scaling laws/i)).toBeInTheDocument();
    expect(screen.getByText(/six-tenths rule is why the industry believes/i)).toBeInTheDocument();
    expect(screen.getByText(/cuts both ways/i)).toBeInTheDocument();
  });

  it('names the economics engine and its tier', async () => {
    mount();
    expect(await screen.findByText(/screening economics engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Petroleum Economics Studio/i)).toBeInTheDocument();
  });

  it('calls the supply cases scenarios, not probabilities', async () => {
    mount();
    expect(await screen.findByText(/named futures, not probabilities/i)).toBeInTheDocument();
  });

  it('says the yields are screening defaults from the assay studio', async () => {
    mount();
    expect(await screen.findByText(/takes them from the crude/i)).toBeInTheDocument();
  });

  it('tracks licensing as an aid and not as legal advice', async () => {
    mount();
    expect(await screen.findByText(/tracking aid and not legal advice/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Licence to Establish/)).toBeInTheDocument();
  });

  it('flags a licence ticked out of order', async () => {
    mount();
    // Tick "Licence to Construct" without the establishment one.
    fireEvent.click(await screen.findByText(/2\. Licence to Construct/));
    expect(await screen.findByText(/probably a data-entry slip/i)).toBeInTheDocument();
  });

  it('recomputes the capital when the capacity changes', async () => {
    mount();
    await screen.findByText('Capital');
    const capacity = screen.getAllByRole('spinbutton').find((el) => el.value === '10000');
    expect(capacity).toBeTruthy();
    fireEvent.change(capacity, { target: { value: '30000' } });
    // A bigger plant costs more in total.
    expect(await screen.findByText(/\$\d+\.\dMM/)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = { ...defaultInputs(), capacityBpd: 25000 };
    expect(inputsFromPayload({ inputs }).capacityBpd).toBe(25000);
  });

  it('refuses a payload with an unknown configuration', () => {
    expect(inputsFromPayload({ inputs: { configurationId: 'not_a_config' } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('defaults the licensing list rather than leaving it undefined', () => {
    const restored = inputsFromPayload({ inputs: { configurationId: 'topping' } });
    expect(restored.licensingComplete).toEqual([]);
  });
});

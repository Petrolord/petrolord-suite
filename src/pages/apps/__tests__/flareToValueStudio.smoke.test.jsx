/**
 * Flare Gas to Value Studio page (DS10).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.flareToValue.test.js. This mounts
 * the app and checks the claim the studio exists to stop: that no abatement
 * appears until the counterfactual is declared, and that a route which
 * failed screening stays in the bid table.
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

import FlareToValueStudio from '@/pages/apps/FlareToValueStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/FlareToValueContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><FlareToValueStudio /></MemoryRouter>);

const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

const declareFlare = () => {
  fireEvent.change(screen.getByLabelText(/Flare destruction efficiency/i), { target: { value: '0.92' } });
  fireEvent.change(screen.getByLabelText(/Methane GWP/i), { target: { value: '28' } });
};

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Flare Gas to Value Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('characterises the gas and derives the liquids content', async () => {
    mount();
    expect(await screen.findByText('The gas that is actually there')).toBeInTheDocument();
    expect(screen.getByText('Liquids')).toBeInTheDocument();
    expect(screen.getByText(/Derived from the composition/i)).toBeInTheDocument();
  });

  it('reports every route as not fully screened until limits are set', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Screening' });
    // An unset limit is not a satisfied one.
    expect(screen.getAllByText('not fully screened').length).toBeGreaterThan(3);
    expect(screen.getByText(/unset limit is not a satisfied one/i)).toBeInTheDocument();
  });

  it('names which requirement a route failed and by how much', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Screening' });
    fireEvent.change(screen.getByLabelText(/Mini LNG Minimum volume/i), { target: { value: '40' } });
    // "Not feasible" is not an answer anybody can act on.
    expect(await screen.findByText(/Minimum volume: 10.000 against a limit of 40.000/i)).toBeInTheDocument();
  });

  it('refuses to report an abatement until the counterfactual is declared', async () => {
    mount();
    await openTab(/Abatement & credits/i);
    declareFlare();
    expect(await screen.findByText('No abatement reported')).toBeInTheDocument();
    // Said in the rail beside the counterfactual fields and again on the
    // result that refused.
    expect(screen.getAllByText(/gross emission is not the abatement/i)).toHaveLength(2);
  });

  it('still shows the flare its own footprint, which is a different question', async () => {
    mount();
    await openTab(/Abatement & credits/i);
    declareFlare();
    expect(await screen.findByText('CO2 burned')).toBeInTheDocument();
    expect(screen.getByText('Methane slipped')).toBeInTheDocument();
    expect(screen.getByText(/methane it fails to burn/i)).toBeInTheDocument();
  });

  it('reports the abatement once the counterfactual is stated', async () => {
    mount();
    await openTab(/Abatement & credits/i);
    declareFlare();
    await screen.findByText('No abatement reported');
    fireEvent.change(screen.getByLabelText(/What the product displaces/i), { target: { value: 'CNG displacing diesel' } });
    fireEvent.change(screen.getByLabelText(/Product burned/i), { target: { value: '190000' } });
    fireEvent.change(screen.getByLabelText(/Fuel displaced/i), { target: { value: '240000' } });
    expect(await screen.findByText(/abated against "CNG displacing diesel"/i)).toBeInTheDocument();
    expect(screen.getByText(/neither reliably above nor below/i)).toBeInTheDocument();
  });

  it('will not price credits off a gross flare figure', async () => {
    mount();
    await openTab(/Abatement & credits/i);
    declareFlare();
    expect(await screen.findByText(/credit that cannot be issued/i)).toBeInTheDocument();
  });

  it('separates a project that stands alone from one that is a bet', async () => {
    mount();
    await openTab(/Abatement & credits/i);
    declareFlare();
    fireEvent.change(screen.getByLabelText(/What the product displaces/i), { target: { value: 'diesel' } });
    fireEvent.change(screen.getByLabelText(/Product burned/i), { target: { value: '190000' } });
    fireEvent.change(screen.getByLabelText(/Fuel displaced/i), { target: { value: '240000' } });
    expect(await screen.findByText(/Clears the hurdle on its own|bet on the credit price|does not clear the hurdle/i)).toBeInTheDocument();
  });

  it('keeps a failed route in the bid table rather than dropping it', async () => {
    mount();
    await screen.findByText('The bid comparison');
    fireEvent.change(screen.getByLabelText(/Mini LNG Minimum volume/i), { target: { value: '40' } });
    // A route missing from a comparison reads as one nobody considered.
    expect(await screen.findByText(/difference between thorough and careless/i)).toBeInTheDocument();
    expect(screen.getAllByText('Mini LNG').length).toBeGreaterThan(1);
    expect(screen.getAllByText('fails').length).toBeGreaterThan(0);
  });

  it('warns that the ranking ignores the capital', async () => {
    mount();
    expect(await screen.findByText(/ignores the capital/i)).toBeInTheDocument();
  });

  it('says the valuation belongs to the sanctioned engine', async () => {
    mount();
    expect(await screen.findByText(/sanctioned economics engine/i)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.parcel.volumeMMscfd = 25;
    inputs.counterfactual.label = 'displacing diesel';
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.parcel.volumeMMscfd).toBe(25);
    expect(restored.counterfactual.label).toBe('displacing diesel');
    expect(restored.routes.length).toBe(4);
  });

  it('refuses a payload with no gas', () => {
    expect(inputsFromPayload({ inputs: { gas: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('ships every requirement limit and the counterfactual blank', () => {
    const d = defaultInputs();
    expect(d.parcel.flareDestructionEfficiency).toBe('');
    expect(d.parcel.gwpMethane).toBe('');
    expect(d.counterfactual.label).toBe('');
    d.routes.forEach((r) => r.requirements.forEach((q) => expect(q.limit).toBe('')));
  });
});

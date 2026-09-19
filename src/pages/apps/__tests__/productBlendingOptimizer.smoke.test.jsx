/**
 * Product Blending Optimizer page (DS2).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.productBlending.test.js. This mounts
 * the app and checks the things a user could be misled by if the wiring
 * slipped: that the specification templates are not presented as compliance,
 * that a spec's blending basis is shown beside it, and that an infeasible
 * blend is reported as one rather than shown as a recipe.
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

import ProductBlendingOptimizer from '@/pages/apps/ProductBlendingOptimizer';
import {
  defaultInputs, inputsFromPayload, templateSpecs,
} from '@/contexts/BlendOptimizerContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><ProductBlendingOptimizer /></MemoryRouter>);

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Product Blending Optimizer/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('solves the shipped pool and shows a cost per barrel', async () => {
    mount();
    await screen.findByText('The recipe');
    expect(screen.getByText('Blend cost')).toBeInTheDocument();
    expect(screen.getByText(/\$\d+\.\d\d\/bbl/)).toBeInTheDocument();
  });

  it('says the templates are not a compliance oracle', async () => {
    mount();
    // Fuel specifications are set by regulation and they change. The app must
    // never be read as the requirement.
    expect(await screen.findByText(/not a compliance oracle/i)).toBeInTheDocument();
    expect(screen.getByText(/regulation in force/i)).toBeInTheDocument();
  });

  it('shows each specification with the basis it blends on', async () => {
    mount();
    await screen.findByText('Specifications');
    // Sulfur must be visibly on a mass basis: using volume for it reports a
    // blend as on-spec when it is not.
    expect(screen.getAllByText(/mass basis/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/index basis/i).length).toBeGreaterThan(0);
  });

  it('labels which specifications bind and which have slack', async () => {
    mount();
    await screen.findByText('What the blend achieves');
    expect(screen.getByText('Binding specs')).toBeInTheDocument();
    expect(screen.getAllByText(/binding|slack/i).length).toBeGreaterThan(0);
  });

  it('reports an impossible specification as no recipe, not a recipe that misses', async () => {
    mount();
    await screen.findByText('The recipe');
    // Push RON far past anything the pool can reach.
    const ronMin = screen.getAllByRole('spinbutton').find(
      (el) => el.value === '91',
    );
    expect(ronMin).toBeTruthy();
    fireEvent.change(ronMin, { target: { value: '120' } });
    expect(await screen.findByText(/No recipe meets these specifications/i)).toBeInTheDocument();
    expect(screen.getByText(/real answer about the problem/i)).toBeInTheDocument();
  });

  it('shows what each constraint is costing', async () => {
    mount();
    expect(await screen.findByText(/What each constraint is costing/i)).toBeInTheDocument();
    expect(screen.getByText(/marginal cost of one more barrel/i)).toBeInTheDocument();
  });
  // MD1-0. The engine gate (packages/engines/__tests__/
  // downstream.productBlending.golden.test.js) holds these numbers to an exact
  // oracle; these hold the page to showing them. Until MD1-0 the panel showed
  // $0.072 for sulfur and $0.267 for RVP: row duals, not prices.
  it('prices relief per unit of the property at the default pool', async () => {
    mount();
    await screen.findByText(/What each constraint is costing/i);
    expect(screen.getByText('$55.01')).toBeInTheDocument();
    expect(screen.getByText('$578.91')).toBeInTheDocument();
    expect(screen.getAllByText(/per ppm/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/per psi/).length).toBeGreaterThan(0);
  });

  it('refuses a blank cost rather than treating the stream as free', async () => {
    mount();
    await screen.findByText('The recipe');
    const fccCost = screen.getAllByRole('spinbutton').find((el) => el.value === '84');
    fireEvent.change(fccCost, { target: { value: '' } });
    expect(await screen.findByText(/No cost for FCC gasoline/)).toBeInTheDocument();
  });

  it('reads a typed maximum of zero as none available', async () => {
    mount();
    await screen.findByText('The recipe');
    // Butane's Max is the last field holding 80 (FCC's MON comes first).
    const butaneMax = screen.getAllByRole('spinbutton').filter((el) => el.value === '80').pop();
    fireEvent.change(butaneMax, { target: { value: '0' } });
    // The oracle's optimum without butane: $87,880.46 for 1,000 bbl.
    expect(await screen.findByText('$87.88/bbl')).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.targetVolume = 2500;
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.targetVolume).toBe(2500);
    expect(restored.components.length).toBeGreaterThan(0);
  });

  it('refuses a payload with no components', () => {
    expect(inputsFromPayload({ inputs: { components: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('stores specs as plain data, since functions do not survive JSON', () => {
    // The index conversions are re-attached on use; a stored spec must not
    // depend on carrying them.
    const specs = templateSpecs('gasoline_50ppm');
    expect(specs.length).toBeGreaterThan(0);
    specs.forEach((s) => {
      expect(typeof s.toIndex).toBe('undefined');
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    });
  });
});

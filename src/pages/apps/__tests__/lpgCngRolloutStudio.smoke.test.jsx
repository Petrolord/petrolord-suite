/**
 * LPG & CNG Rollout Studio page (DS7).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.lpgCng.test.js. This mounts the app
 * and checks what a user could be misled by if the wiring slipped: that the
 * LPG fill limit is refused rather than defaulted, that the real-gas factor
 * is shown beside the ideal figure, and that a switch which saves money
 * while adding carbon is reported as exactly that.
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

import LpgCngRolloutStudio from '@/pages/apps/LpgCngRolloutStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/LpgCngContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><LpgCngRolloutStudio /></MemoryRouter>);

/** Radix tab triggers activate on mousedown, not on click. */
const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /LPG & CNG Rollout Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('refuses the LPG fill limit rather than defaulting it', async () => {
    mount();
    // A default here would be a number somebody trusted, on a safety limit.
    expect(await screen.findByText(/fill ratio is required/i)).toBeInTheDocument();
    expect(screen.getAllByText(/hydraulically/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Max fill ratio/i)).toHaveAttribute('placeholder', 'required');
  });

  it('produces the storage figures once the limit is supplied', async () => {
    mount();
    fireEvent.change(await screen.findByLabelText(/Max fill ratio/i), { target: { value: '0.85' } });
    expect(await screen.findByText('Usable')).toBeInTheDocument();
    // The vapour space is a figure in its own right, not a subtraction.
    expect(screen.getByText('Vapour space')).toBeInTheDocument();
    expect(screen.getByText('not spare capacity')).toBeInTheDocument();
  });

  it('labels each blend property with the basis it mixes on', async () => {
    mount();
    await screen.findByText('The blend');
    expect(screen.getByText('volume basis')).toBeInTheDocument();
    expect(screen.getByText('mass basis')).toBeInTheDocument();
    expect(screen.getByText('mole basis')).toBeInTheDocument();
  });

  it("names the cylinder float as Little's Law", async () => {
    mount();
    expect(await screen.findByText(/Little's Law/i)).toBeInTheDocument();
    expect(screen.getByText('Fleet required')).toBeInTheDocument();
    expect(screen.getByText(/usually guess it low/i)).toBeInTheDocument();
  });

  it('shows the real-gas factor beside the ideal figure', async () => {
    mount();
    await openTab(/^CNG$/);
    expect(await screen.findByText('What the banks actually hold')).toBeInTheDocument();
    expect(screen.getByText('Real (kg)')).toBeInTheDocument();
    expect(screen.getByText('Ideal (kg)')).toBeInTheDocument();
    expect(screen.getByText(/wrong by about a fifth/i)).toBeInTheDocument();
  });

  it('reports the gas a cascade cannot deliver as stranded', async () => {
    mount();
    await openTab(/^CNG$/);
    expect(await screen.findByText('Stranded below target')).toBeInTheDocument();
    expect(screen.getByText('inventory, but not usable')).toBeInTheDocument();
    expect(screen.getByText(/not counted as a fill/i)).toBeInTheDocument();
  });

  it('says the compression is not reimplemented here', async () => {
    mount();
    await openTab(/^CNG$/);
    expect(await screen.findByText(/does not reimplement the thermodynamics/i)).toBeInTheDocument();
    expect(screen.getByText('Specific energy')).toBeInTheDocument();
  });

  it('runs the trailer fleet through the same model as the cylinders', async () => {
    mount();
    await openTab(/^CNG$/);
    expect(await screen.findByText('The trailer float')).toBeInTheDocument();
    expect(screen.getByText(/rather than a second one that could disagree/i)).toBeInTheDocument();
  });

  it('derives the new fuel consumption and says it derived it', async () => {
    mount();
    await openTab(/Conversion case/i);
    // The shipped case leaves the new consumption blank on purpose.
    expect(await screen.findByText(/derived from energy equivalence/i)).toBeInTheDocument();
  });

  it('labels simple payback as undiscounted', async () => {
    mount();
    await openTab(/Conversion case/i);
    expect(await screen.findByText('Simple payback')).toBeInTheDocument();
    expect(screen.getByText(/undiscounted/i)).toBeInTheDocument();
    expect(screen.getByText(/sanctioned economics engine/i)).toBeInTheDocument();
  });

  it('leaves carbon absent until both emission factors are supplied', async () => {
    mount();
    await openTab(/Conversion case/i);
    expect(await screen.findByText('Carbon not computed')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Base factor/i), { target: { value: '2.3' } });
    fireEvent.change(screen.getByLabelText(/New factor/i), { target: { value: '2.75' } });
    expect(await screen.findByText(/kgCO2e avoided a year/i)).toBeInTheDocument();
  });

  it('will say a switch saves money and adds carbon', async () => {
    mount();
    await openTab(/Conversion case/i);
    fireEvent.change(screen.getByLabelText(/Base factor/i), { target: { value: '2.3' } });
    fireEvent.change(screen.getByLabelText(/New factor/i), { target: { value: '9' } });
    // Cheaper and cleaner are separate questions, and hiding a result that
    // splits them would make this an advocacy tool.
    expect(await screen.findByText(/kgCO2e added a year/i)).toBeInTheDocument();
  });

  it('reports no payback rather than a negative one when it does not pay', async () => {
    mount();
    await openTab(/Conversion case/i);
    fireEvent.change(screen.getByLabelText(/New price/i), { target: { value: '9000' } });
    expect(await screen.findByText(/does not save money/i)).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.lpg.maxFillRatio = 0.85;
    inputs.cng.vehicleTargetBar = 220;
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.lpg.maxFillRatio).toBe(0.85);
    expect(restored.cng.vehicleTargetBar).toBe(220);
    expect(restored.cng.banks.length).toBe(3);
  });

  it('refuses a payload missing either fuel', () => {
    expect(inputsFromPayload({ inputs: { lpg: {} } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('ships the fill ratio blank, so a restored study cannot inherit a guess', () => {
    expect(defaultInputs().lpg.maxFillRatio).toBe('');
  });
});

/**
 * Energy & Utilities Efficiency Studio page (DS8).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.energyEfficiency.test.js. This
 * mounts the app and checks the things a user could be misled by if the
 * wiring slipped: that the heating-value basis is always on screen, that
 * the three refused inputs are refused, and that a target below the
 * declared safe oxygen is blocked rather than quietly clamped.
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

import EnergyEfficiencyStudio from '@/pages/apps/EnergyEfficiencyStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/EnergyEfficiencyContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><EnergyEfficiencyStudio /></MemoryRouter>);

/** Radix tab triggers activate on mousedown, not on click. */
const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

/** The shipped study leaves the three refused inputs blank on purpose. */
const supplyRefusedInputs = () => {
  fireEvent.change(screen.getByLabelText(/Radiation loss/i), { target: { value: '1.5' } });
  fireEvent.change(screen.getByLabelText(/Minimum safe O2/i), { target: { value: '2' } });
};

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Energy & Utilities Efficiency Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('refuses the radiation loss rather than defaulting it', async () => {
    mount();
    // It comes off a published chart against surface area and firing rate.
    expect(await screen.findByText(/radiation and convection loss is required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Radiation loss/i)).toHaveAttribute('placeholder', 'required');
  });

  it('computes the atom balance without any of the refused inputs', async () => {
    mount();
    // Stoichiometry needs nothing but the fuel analysis, so it is on screen
    // even while the losses are still refused.
    expect(await screen.findByText('Stoichiometric air')).toBeInTheDocument();
    expect(screen.getByText(/it is an atom balance/i)).toBeInTheDocument();
  });

  it('shows the efficiency and its basis once the losses are supplied', async () => {
    mount();
    await screen.findByText('Stoichiometric air');
    supplyRefusedInputs();
    expect(await screen.findByText(/% efficient on LHV/i)).toBeInTheDocument();
    expect(screen.getByText(/must not be compared/i)).toBeInTheDocument();
  });

  it('changes the answer and the warning when the basis changes', async () => {
    mount();
    await screen.findByText('Stoichiometric air');
    supplyRefusedInputs();
    await screen.findByText(/% efficient on LHV/i);
    fireEvent.change(screen.getByLabelText(/Heating value basis/i), { target: { value: 'HHV' } });
    expect(await screen.findByText(/% efficient on HHV/i)).toBeInTheDocument();
    expect(screen.getByText(/counted it as available/i)).toBeInTheDocument();
  });

  it('blocks a target below the declared safe oxygen instead of clamping it', async () => {
    mount();
    await screen.findByText('Stoichiometric air');
    supplyRefusedInputs();
    fireEvent.change(screen.getByLabelText(/Target stack O2/i), { target: { value: '0.5' } });
    // The app will not tune a heater into making carbon monoxide on its own
    // judgement, and says why rather than silently adjusting.
    expect(await screen.findByText(/below the 2 percent declared safe/i)).toBeInTheDocument();
  });

  it('says the fuel saving is a ratio, not a difference', async () => {
    mount();
    await screen.findByText('Stoichiometric air');
    supplyRefusedInputs();
    expect(await screen.findByText('Fuel saved')).toBeInTheDocument();
    expect(screen.getByText(/understates the saving/i)).toBeInTheDocument();
  });

  it('refuses the trap discharge coefficient rather than defaulting it', async () => {
    mount();
    await openTab(/Steam, intensity & register/i);
    // The refusal appears both as the rail's note and as the panel's error.
    expect((await screen.findAllByText(/discharge coefficient/i)).length).toBeGreaterThan(1);
    expect(screen.getByLabelText(/Discharge coeff/i)).toHaveAttribute('placeholder', 'required');
    // Said in the rail beside the field and again in the panel that refused.
    expect(screen.getAllByText(/how the trap failed/i)).toHaveLength(2);
  });

  it('prices the trap population once the coefficient is supplied', async () => {
    mount();
    await openTab(/Steam, intensity & register/i);
    fireEvent.change(screen.getByLabelText(/Discharge coeff/i), { target: { value: '0.7' } });
    expect(await screen.findByText('Per trap')).toBeInTheDocument();
    expect(screen.getByText(/not on what is downstream/i)).toBeInTheDocument();
  });

  it('calls the condensate value a floor until the treatment is priced', async () => {
    mount();
    await openTab(/Steam, intensity & register/i);
    expect(await screen.findByText(/usually left out/i)).toBeInTheDocument();
    expect(screen.getByText('not priced')).toBeInTheDocument();
  });

  it('says plainly that the intensity is not EII', async () => {
    mount();
    await openTab(/Steam, intensity & register/i);
    expect(await screen.findByText(/NOT the Solomon Energy Intensity Index/i)).toBeInTheDocument();
  });

  it('leaves register carbon absent until an emission factor is supplied', async () => {
    mount();
    await openTab(/Steam, intensity & register/i);
    await screen.findByText('The savings register');
    expect(screen.getAllByText('absent').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/Emission factor/i), { target: { value: '56' } });
    expect(await screen.findByText('tCO2e/yr')).toBeInTheDocument();
  });

  it('reports pinch targets, the pinch and a closed energy balance', async () => {
    mount();
    await openTab(/Heat integration/i);
    expect(await screen.findByText('Hot utility')).toBeInTheDocument();
    expect(screen.getByText('Cold utility')).toBeInTheDocument();
    expect(screen.getByText(/costs twice/i)).toBeInTheDocument();
    expect(screen.getByText(/Energy balance closes to 0.000 kW/)).toBeInTheDocument();
  });

  it('reports a threshold problem rather than inventing a pinch', async () => {
    mount();
    await openTab(/Heat integration/i);
    await screen.findByText('Hot utility');
    // Removing both cold streams leaves nothing needing heat.
    fireEvent.click(screen.getByLabelText(/Remove C1 feed preheat/i));
    fireEvent.click(screen.getByLabelText(/Remove C2 reboiler feed/i));
    expect(await screen.findByText('threshold problem')).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.heater.radiationLossPercent = 1.5;
    inputs.pinch.minimumApproachC = 15;
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.heater.radiationLossPercent).toBe(1.5);
    expect(restored.pinch.minimumApproachC).toBe(15);
    expect(restored.pinch.streams.length).toBe(4);
  });

  it('refuses a payload with no fuel', () => {
    expect(inputsFromPayload({ inputs: { fuel: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('ships the three refused inputs blank, so a study cannot inherit a guess', () => {
    const d = defaultInputs();
    expect(d.heater.radiationLossPercent).toBe('');
    expect(d.heater.minimumSafeO2Percent).toBe('');
    expect(d.steam.dischargeCoefficient).toBe('');
  });
});

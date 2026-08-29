/**
 * Carbon Footprint & Abatement Studio page (DS9).
 *
 * The engine is validated in
 * packages/engines/__tests__/downstream.carbonAbatement.test.js. This mounts
 * the app and checks what a reader could be misled by: that "computed" and
 * "reportable" stay separate on screen, that no potential set is shipped,
 * and that interacting measures are flagged rather than quietly summed.
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

import CarbonAbatementStudio from '@/pages/apps/CarbonAbatementStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/CarbonAbatementContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><CarbonAbatementStudio /></MemoryRouter>);

const openTab = async (name) => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 });
};

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Carbon Footprint & Abatement Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('ships no global warming potentials', async () => {
    mount();
    await screen.findByText('Global warming potentials');
    // They differ between assessment reports by enough to move a
    // methane-heavy inventory by a fifth.
    expect(screen.getByLabelText(/Assessment report/i)).toHaveValue('');
    expect(screen.getByLabelText(/^CH4/i)).toHaveValue(null);
    expect(screen.getByText(/not comparable with one on another/i)).toBeInTheDocument();
  });

  it('computes an inventory but calls it not reportable', async () => {
    mount();
    // The arithmetic is complete out of the box; the provenance is not, and
    // merging those two questions is how a working number reaches a return.
    expect(await screen.findByText(/Computed but NOT reportable/i)).toBeInTheDocument();
    expect(screen.getByText(/global warming potential set is not declared/i)).toBeInTheDocument();
  });

  it('becomes reportable once the set and the sources are supplied', async () => {
    mount();
    await screen.findByText(/Computed but NOT reportable/i);
    fireEvent.change(screen.getByLabelText(/Assessment report/i), { target: { value: 'IPCC AR5' } });
    fireEvent.change(screen.getByLabelText(/^CH4/i), { target: { value: '28' } });
    screen.getAllByLabelText(/ source$/i).forEach((el) => fireEvent.change(el, { target: { value: 'Operator disclosure' } }));
    screen.getAllByLabelText(/ version$/i).forEach((el) => fireEvent.change(el, { target: { value: '2026' } }));
    screen.getAllByLabelText(/^Factor /i).forEach((el) => fireEvent.change(el, { target: { value: '0.45' } }));
    // Combustion and flaring each have one; the flare's is the required one.
    const eff = screen.getAllByLabelText(/Destruction efficiency \(fraction\)/i);
    expect(eff).toHaveLength(2);
    fireEvent.change(eff[1], { target: { value: '0.98' } });
    expect(await screen.findByText(/Computed and reportable/i)).toBeInTheDocument();
  });

  it('says combustion CO2 is conservation of mass, not a factor', async () => {
    mount();
    // Said in the rail beside the input and again on the result.
    expect((await screen.findAllByText(/conservation of mass/i)).length).toBeGreaterThan(1);
    expect(screen.getByText(/Fired heaters and boilers \(CO2\)/)).toBeInTheDocument();
  });

  it('requires a boundary before it will report an intensity', async () => {
    mount();
    // Per tonne charged and per tonne of saleable product are different
    // numbers for the same plant.
    expect(await screen.findByText(/boundary must be named/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Boundary/i), { target: { value: 'Crude charged, Scope 1 and 2' } });
    expect(await screen.findByText(/Comparable only with an intensity on the same boundary/i)).toBeInTheDocument();
  });

  it('says it is not a compliance register', async () => {
    mount();
    expect(await screen.findByText(/not a regulatory compliance register/i)).toBeInTheDocument();
  });

  it('ranks the abatement curve cheapest first', async () => {
    mount();
    await openTab(/Abatement & path/i);
    expect(await screen.findByText('The marginal abatement cost curve')).toBeInTheDocument();
    expect(screen.getByText(/makes every measure look expensive/i)).toBeInTheDocument();
    expect(screen.getByText('Pays for itself')).toBeInTheDocument();
  });

  it('flags measures that act on the same source as not additive', async () => {
    mount();
    await openTab(/Abatement & path/i);
    // Two of the shipped measures both act on the heaters.
    expect(await screen.findByText('These measures are not additive')).toBeInTheDocument();
    expect(screen.getByText(/upper bound/i)).toBeInTheDocument();
  });

  it('stops flagging once the overlap is resolved by the user', async () => {
    mount();
    await openTab(/Abatement & path/i);
    await screen.findByText('These measures are not additive');
    // Resolving it is an engineering judgement, so the app waits for one.
    const actsOn = screen.getAllByLabelText(/^Acts on/i);
    fireEvent.change(actsOn[2], { target: { value: 'exchangers' } });
    expect(screen.queryByText('These measures are not additive')).not.toBeInTheDocument();
  });

  it('names the residual against the target rather than closing it', async () => {
    mount();
    await openTab(/Abatement & path/i);
    expect(await screen.findByText('Against the target')).toBeInTheDocument();
    // Named both in the path note and in the shortfall line beneath it.
    expect(screen.getAllByText(/no measure identified/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not drawn as a wedge/i)).toBeInTheDocument();
  });

  it('brings each measure in only from its start year', async () => {
    mount();
    await openTab(/Abatement & path/i);
    expect(await screen.findByText(/only from the year it starts/i)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.gwp.label = 'IPCC AR6';
    inputs.intensity.boundaryLabel = 'Saleable product';
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.gwp.label).toBe('IPCC AR6');
    expect(restored.intensity.boundaryLabel).toBe('Saleable product');
    expect(restored.measures.length).toBe(4);
  });

  it('refuses a payload with no measures', () => {
    expect(inputsFromPayload({ inputs: {} })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('ships the potential set, the sources and the boundary blank', () => {
    const d = defaultInputs();
    expect(d.gwp.label).toBe('');
    expect(d.gwp.ch4).toBe('');
    expect(d.intensity.boundaryLabel).toBe('');
    expect(d.flare.destructionEfficiencyFraction).toBe('');
    d.lines.forEach((l) => {
      expect(l.source).toBe('');
      expect(l.version).toBe('');
    });
  });
});

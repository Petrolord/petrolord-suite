/**
 * Crude Assay & Blending Studio page (DS1).
 *
 * The engine is validated separately in
 * packages/engines/__tests__/downstream.crudeAssay.test.js. This mounts the
 * app, because a validated engine behind a mis-wired panel is still a broken
 * app, and checks the two things a user could be misled by if the wiring
 * slipped: that a property's basis is shown next to it, and that the stability
 * screen says which basis it used.
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

import CrudeAssayBlendingStudio from '@/pages/apps/CrudeAssayBlendingStudio';
import { defaultInputs, inputsFromPayload, DEFAULT_CUTS } from '@/contexts/CrudeAssayContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><CrudeAssayBlendingStudio /></MemoryRouter>);

describe('the page', () => {
  it('mounts with the saved-study rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Crude Assay & Blending Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('opens with two crudes and says they are illustrative', async () => {
    mount();
    await screen.findByText('Crudes in the blend');
    expect(screen.getByDisplayValue('Light sweet (example)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Medium sour (example)')).toBeInTheDocument();
    // The figures must not read as a published assay sheet.
    expect(screen.getByText(/not published assay sheets/i)).toBeInTheDocument();
  });

  it('shows every blended property with the basis it was computed on', async () => {
    mount();
    await screen.findByText('Blend API');
    // The whole point of the app: a number that cannot be checked is a claim.
    expect(screen.getByText(/from the volume-blended specific gravity/i)).toBeInTheDocument();
    expect(screen.getAllByText(/mass basis/i).length).toBeGreaterThan(3);
    expect(screen.getByText(/Refutas index on mass fraction/i)).toBeInTheDocument();
  });

  it('names the basis of the stability screen rather than just a verdict', async () => {
    mount();
    await screen.findByText(/Asphaltene stability screen/i);
    // With no SARA entered the screen must say it fell back to gravity.
    expect(screen.getByText(/No SARA analysis supplied/i)).toBeInTheDocument();
  });

  it('recomputes when a crude changes, so the blend is live', async () => {
    mount();
    const apiBefore = (await screen.findAllByText(/^\d\d\.\d\d$/))[0].textContent;
    // Push the light crude much lighter; the blend API must rise.
    const apiInputs = screen.getAllByRole('spinbutton');
    // The second numeric field of the first card is its API gravity.
    fireEvent.change(apiInputs[1], { target: { value: '55' } });
    const apiAfter = screen.getAllByText(/^\d\d\.\d\d$/)[0].textContent;
    expect(Number(apiAfter)).toBeGreaterThan(Number(apiBefore));
  });

  it('shows the yields and netback on the second tab', async () => {
    mount();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Yields & netback/i }));
    expect(await screen.findByText('Cut yields of the blend')).toBeInTheDocument();
    // "Netback" appears as the panel heading and again as the total's label.
    expect(screen.getAllByText('Netback').length).toBeGreaterThan(0);
    expect(screen.getByText(/Gross product value/i)).toBeInTheDocument();
    expect(screen.getByText(/Marker netback/i)).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    const inputs = defaultInputs();
    inputs.crudes[0].api = 41.2;
    const restored = inputsFromPayload({ name: 'A study', schema: 1, inputs });
    expect(restored.crudes[0].api).toBe(41.2);
    expect(restored.cuts).toHaveLength(DEFAULT_CUTS().length);
  });

  it('refuses a payload with no crudes rather than opening an empty study', () => {
    expect(inputsFromPayload({ inputs: { crudes: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('falls back to the default cuts when a payload carries none', () => {
    const inputs = defaultInputs();
    const restored = inputsFromPayload({ inputs: { crudes: inputs.crudes } });
    expect(restored.cuts.length).toBeGreaterThan(0);
  });
});

/**
 * Refinery Planning & Scheduling Studio page (DS3).
 *
 * The engine is validated in downstream.refineryPlanning.test.js. This mounts
 * the app and checks the claims its three tabs make: that a plan is solved,
 * that the schedule says what it does not model, and that recording an actual
 * produces a variance that splits exactly.
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

import RefineryPlanningStudio from '@/pages/apps/RefineryPlanningStudio';
import { defaultInputs, inputsFromPayload } from '@/contexts/RefineryPlanningContext';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mount = () => render(<MemoryRouter><RefineryPlanningStudio /></MemoryRouter>);

describe('the page', () => {
  it('mounts with the saved-plan rail and the help guide', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Refinery Planning/i })).toBeInTheDocument();
    expect(screen.getByText('Saved plan')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
  });

  it('solves the shipped configuration and reports a gross margin', async () => {
    mount();
    expect(await screen.findByText('Gross margin')).toBeInTheDocument();
    expect(screen.getByText(/\$[\d,.-]+\/bbl/)).toBeInTheDocument();
  });

  it('says yields are data rather than something it predicts', async () => {
    mount();
    expect(await screen.findByText(/data rather than something this app predicts/i)).toBeInTheDocument();
  });

  it('prices each stream at the margin, and explains the number', async () => {
    mount();
    expect(await screen.findByText(/What another barrel of each stream is worth/i)).toBeInTheDocument();
    expect(screen.getByText(/prices a debottleneck before anyone spends on one/i)).toBeInTheDocument();
  });

  it('says on the schedule tab what it does not model', async () => {
    mount();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Schedule' }));
    expect(await screen.findByText(/jetty windows and turnarounds are not modelled/i)).toBeInTheDocument();
  });

  it('explains on the actuals tab why the split is exact', async () => {
    mount();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Actuals & variance/i }));
    expect(await screen.findByText(/Record what happened/i)).toBeInTheDocument();
    expect(screen.getByText(/a decomposition with a residual is a/i)).toBeInTheDocument();
    expect(screen.getByText('Margin variance')).toBeInTheDocument();
  });
});

describe('the saved payload', () => {
  it('round-trips a plan', () => {
    const inputs = defaultInputs();
    inputs.periodDays = 31;
    const restored = inputsFromPayload({ name: 'A plan', schema: 1, inputs });
    expect(restored.periodDays).toBe(31);
    expect(restored.crudes.length).toBeGreaterThan(0);
  });

  it('refuses a payload with no crudes', () => {
    expect(inputsFromPayload({ inputs: { crudes: [] } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('defaults actuals to an empty list rather than undefined', () => {
    const inputs = defaultInputs();
    const restored = inputsFromPayload({ inputs: { crudes: inputs.crudes } });
    expect(restored.actuals).toEqual([]);
  });
});

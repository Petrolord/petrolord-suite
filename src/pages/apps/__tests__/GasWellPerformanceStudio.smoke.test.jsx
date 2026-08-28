/**
 * Smoke test: mount the whole Gas Well Performance Studio page
 * (provider, studio shell, every tab) with Supabase mocked.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));
jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn().mockResolvedValue([]),
  listPoWells: jest.fn().mockResolvedValue([]),
  listFieldWellTests: jest.fn().mockResolvedValue([]),
  getWellModel: jest.fn().mockResolvedValue(null),
  upsertWellModel: jest.fn().mockResolvedValue({}),
}));

import GasWellPerformanceStudio from '@/pages/apps/GasWellPerformanceStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('GasWellPerformanceStudio page', () => {
  it('analyses the default gas well and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <GasWellPerformanceStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Gas Well Performance Studio')).toBeInTheDocument();

    // Deliverability: the node solved on the validated gas layer.
    expect(await screen.findByText(/What this well delivers/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Absolute open flow/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Liquid Loading' }));
    await waitFor(() => expect(screen.getAllByText(/Liquid loading/i).length).toBeGreaterThan(0));
    // The controlling station is named, and it is not the wellhead.
    expect(screen.getByText(/controlling station is/i)).toBeInTheDocument();
    expect(screen.getByText(/What tubing would carry this rate/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Forecast' }));
    await waitFor(() => expect(screen.getByText(/When this well will load/i)).toBeInTheDocument());
    // The expensive run stays explicit.
    expect(screen.getByText(/runs when you ask for it/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Plunger Lift' }));
    await waitFor(() => expect(screen.getByText(/Would a plunger lift this well/i)).toBeInTheDocument());
    // Feasibility is the computed ratio; the heuristic is shown beside it.
    expect(screen.getByText(/The gas-liquid ratio test/i)).toBeInTheDocument();
    expect(screen.getByText(/Screening rule of thumb/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/Well phase/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Gas inflow/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Deliverability model/i)).toBeInTheDocument();
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 60000);
});

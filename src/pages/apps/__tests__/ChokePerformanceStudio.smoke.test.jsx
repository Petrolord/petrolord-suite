/**
 * Smoke test: mount the whole Choke & Wellhead Performance Studio page
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

import ChokePerformanceStudio from '@/pages/apps/ChokePerformanceStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('ChokePerformanceStudio page', () => {
  it('solves the default bean and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <ChokePerformanceStudio />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Choke & Wellhead Performance Studio')).toBeInTheDocument();

    // Operating Point: the bean solved as a constraint on the real well.
    expect(await screen.findByText(/bean on this well/i)).toBeInTheDocument();
    expect(screen.getByText(/Critical flow: the bean is setting the rate/i)).toBeInTheDocument();
    // The flowline check is there and names its C factor.
    expect(screen.getAllByText(/The flowline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Erosional limit/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Performance' }));
    await waitFor(() => expect(screen.getByText(/What every bean size makes/i)).toBeInTheDocument());
    // The expensive run stays explicit.
    expect(screen.getByText(/runs when you ask for it/i)).toBeInTheDocument();
    expect(screen.getByText(/Size the bean/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Coefficients' }));
    await waitFor(() => expect(screen.getByText(/Fit the correlation to this well/i)).toBeInTheDocument());
    // With no spine tests it says so rather than offering a fit.
    expect(screen.getByText(/No usable well tests on the spine/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/Well phase/i)).toBeInTheDocument());
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 60000);
});

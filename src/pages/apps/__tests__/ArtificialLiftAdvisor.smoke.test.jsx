/**
 * Smoke test: mount the whole Artificial Lift Advisor page (provider,
 * studio shell, both tabs) with Supabase mocked.
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

import ArtificialLiftAdvisor from '@/pages/apps/ArtificialLiftAdvisor';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('ArtificialLiftAdvisor page', () => {
  it('screens every method and offers the design pass', async () => {
    render(
      <MemoryRouter>
        <ArtificialLiftAdvisor />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Artificial Lift Advisor')).toBeInTheDocument();
    expect(await screen.findByText(/Every method, on this one well/i)).toBeInTheDocument();

    // All six methods are screened, including the two with no engine.
    ['Gas lift', 'ESP', 'Rod pump', 'Plunger lift', 'Progressing cavity pump', 'Jet pump']
      .forEach((label) => {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      });
    // The two without an engine say so rather than posing as designs.
    expect(screen.getAllByText(/Screened only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no validated engine/i).length).toBeGreaterThan(0);

    // Until the designs run, the ordering is the matrix alone and says so.
    expect(screen.getByText(/rules of thumb, not a solved well/i)).toBeInTheDocument();
    expect(screen.getByText(/Design them all/i)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Well Model' }));
    await waitFor(() => expect(screen.getByText(/^Trajectory$/i)).toBeInTheDocument());
    expect(screen.getByText(/Production Spine/i)).toBeInTheDocument();
  }, 60000);
});

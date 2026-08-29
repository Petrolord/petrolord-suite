/**
 * Smoke test: mount the whole Corrosion & Integrity Studio page
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

import CorrosionRatePredictor from '@/pages/apps/CorrosionRatePredictor';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('CorrosionStudio page', () => {
  it('screens the default case and moves through the tabs', async () => {
    render(
      <MemoryRouter>
        <CorrosionRatePredictor />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Corrosion & Integrity Studio')).toBeInTheDocument();

    // Rate tab: the factor chain is visible, including the mass-transfer
    // term the predecessor did not have.
    expect((await screen.findAllByText(/Predicted rate/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mass transfer limit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/carries velocity and line size/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effective inhibition/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wall shear/i).length).toBeGreaterThan(0);
    // The velocity sweep chart the flat-multiplier model could not draw.
    expect(screen.getAllByText(/Rate against velocity/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sour Service' }));
    await waitFor(() => expect(screen.getAllByText(/MR0175/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/H2S partial pressure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Which film governs/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Integrity' }));
    await waitFor(() => expect(screen.getAllByText(/Allowance and remaining life/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Remaining life/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Allowance the design life needs/i).length).toBeGreaterThan(0);
  });
});

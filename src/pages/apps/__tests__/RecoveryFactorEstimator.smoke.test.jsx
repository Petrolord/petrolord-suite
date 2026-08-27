/**
 * Smoke test: mount the whole Recovery Factor Estimator page (provider,
 * Studio shell, panels) with Supabase mocked. Catches broken
 * imports/wiring across the studio kit and the rfestimator component
 * tree that unit tests on the pure engine cannot see.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

import RecoveryFactorEstimator from '@/pages/apps/RecoveryFactorEstimator';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('RecoveryFactorEstimator page', () => {
  it('renders the shell and computes reserves from the seeded sample inputs', async () => {
    render(
      <MemoryRouter>
        <RecoveryFactorEstimator />
      </MemoryRouter>,
    );

    // Shell + rails.
    expect(await screen.findByText('Recovery Factor Estimator')).toBeInTheDocument();
    expect(screen.getByText(/In-place Volume/i)).toBeInTheDocument();
    expect(screen.getByText('Recovery Factor')).toBeInTheDocument();

    // Defaults seed the water-drive oil sample, so the KPI rail shows a
    // real RF (analog typical, a percentage) and the chart card renders.
    expect(screen.getByText('Recoverable Reserves')).toBeInTheDocument();
    expect(screen.getByText('Recoverable reserves range')).toBeInTheDocument();
    expect(screen.getByText(/Oil drive-mechanism reference/i)).toBeInTheDocument();
  });

  it('switches phase to gas: method menu, reference table and KPIs follow', async () => {
    render(
      <MemoryRouter>
        <RecoveryFactorEstimator />
      </MemoryRouter>,
    );
    await screen.findByText('Recovery Factor Estimator');

    fireEvent.click(screen.getByRole('button', { name: 'gas' }));
    expect(screen.getByText(/Gas drive-mechanism reference/i)).toBeInTheDocument();
    expect(screen.getByText('OGIP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /p\/z depletion/i })).toBeInTheDocument();

    // The exact p/z method reveals its correlation inputs.
    fireEvent.click(screen.getByRole('button', { name: /p\/z depletion/i }));
    expect(screen.getByText(/Initial pi \(psia\)/i)).toBeInTheDocument();
  });

  it('direct in-place entry drives the reserves estimate', async () => {
    render(
      <MemoryRouter>
        <RecoveryFactorEstimator />
      </MemoryRouter>,
    );
    await screen.findByText('Recovery Factor Estimator');

    fireEvent.click(screen.getByRole('button', { name: /Enter directly/i }));
    const field = screen.getByPlaceholderText('STB');
    fireEvent.change(field, { target: { value: '100000000' } });
    // 100 MMSTB in place at the water-drive analog typical RF -> the KPI
    // rail shows OOIP as 100 MMSTB.
    expect(screen.getByText('100 MMSTB')).toBeInTheDocument();
  });

  it('Sample button reloads the water-drive oil case with a notification', async () => {
    render(
      <MemoryRouter>
        <RecoveryFactorEstimator />
      </MemoryRouter>,
    );
    await screen.findByText('Recovery Factor Estimator');

    fireEvent.click(screen.getByRole('button', { name: 'gas' }));
    fireEvent.click(screen.getByRole('button', { name: /Sample/i }));
    expect(await screen.findByText(/water-drive oil case is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Oil drive-mechanism reference/i)).toBeInTheDocument();
  });
});

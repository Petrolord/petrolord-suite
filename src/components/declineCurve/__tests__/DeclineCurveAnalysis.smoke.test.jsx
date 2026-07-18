/**
 * Smoke test: mount the whole Decline Curve Analysis page (provider, the
 * shared Studio shell it adopted in W5, both tabs) with Supabase mocked.
 * Catches broken imports/wiring across the studio kit and the declineCurve
 * component tree that engine unit tests cannot see.
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

import DeclineCurveAnalysis from '@/pages/apps/DeclineCurveAnalysis';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('DeclineCurveAnalysis page on the Studio shell', () => {
  it('renders both tabs without crashing', async () => {
    render(
      <MemoryRouter>
        <DeclineCurveAnalysis />
      </MemoryRouter>,
    );

    // Analysis (default tab): shell header + left-rail sections + fit button.
    expect(await screen.findByText('Decline Curve Analysis')).toBeInTheDocument();
    expect(screen.getByText(/Project & Data/i)).toBeInTheDocument();
    expect(screen.getByText('Fit Model')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Type Curve' }));
    expect(screen.getByText(/Type Curve Analysis/i)).toBeInTheDocument();
  });
});

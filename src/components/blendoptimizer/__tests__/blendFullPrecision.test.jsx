// W3 (D3): the Product Blending Optimizer under the shared Full precision
// switch. Off, the cost, recipe volumes and shadow prices print as before;
// on, at 6 decimals of the solved LP the context holds.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

import { BlendOptimizerProvider, useBlendOptimizer } from '@/contexts/BlendOptimizerContext';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import RecipeResults from '../RecipeResults';
import PoolPanel from '../PoolPanel';
import ProductBlendingOptimizer from '@/pages/apps/ProductBlendingOptimizer';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

let result;
const Probe = () => { result = useBlendOptimizer().result; return null; };
const mount = (full) => render(
  <MemoryRouter>
    <BlendOptimizerProvider>
      <FullPrecisionProvider initial={full}><Probe /><PoolPanel /><RecipeResults /></FullPrecisionProvider>
    </BlendOptimizerProvider>
  </MemoryRouter>,
);
const lines = () => result.recipe.filter((r) => r.volume > 1e-6);
const priced = () => result.shadowPrices.filter((r) => Number.isFinite(r.price));

test('off: total, recipe volumes and shadow prices print as before', async () => {
  await act(async () => { mount(false); });
  expect(result.status).toBe('optimal');
  expect(screen.getByText(`$${result.totalCost.toFixed(0)}`)).toBeInTheDocument();
  lines().forEach((l) => expect(screen.getAllByText(`${l.volume.toFixed(1)} bbl`).length).toBeGreaterThan(0));
  expect(priced().length).toBeGreaterThan(0);
  priced().forEach((r) => expect(screen.getAllByText(`$${r.price.toFixed(2)}`).length).toBeGreaterThan(0));
});

test('on: the same quantities at 6 decimals', async () => {
  await act(async () => { mount(true); });
  expect(screen.getByText(`$${formatFull(result.totalCost)}`)).toBeInTheDocument();
  lines().forEach((l) => expect(screen.getAllByText(`${formatFull(l.volume)} bbl`).length).toBeGreaterThan(0));
  priced().forEach((r) => expect(screen.getAllByText(`$${formatFull(r.price)}`).length).toBeGreaterThan(0));
});

test('the page carries the switch, off by default', async () => {
  await act(async () => { render(<MemoryRouter><ProductBlendingOptimizer /></MemoryRouter>); });
  const sw = screen.getByRole('switch', { name: 'Full precision' });
  expect(sw.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(sw);
  expect(sw.getAttribute('aria-checked')).toBe('true');
});

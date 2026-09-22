// W3 (D3): unit utilisation under the shared Full precision switch. Off, a
// whole percent as before; on, 6 decimals of the solved plan's utilisation.
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

import { RefineryPlanningProvider, useRefineryPlanning } from '@/contexts/RefineryPlanningContext';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import PlanResults from '../PlanResults';
import RefineryPlanningStudio from '@/pages/apps/RefineryPlanningStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
});

let plan;
const Probe = () => { plan = useRefineryPlanning().plan; return null; };
const mount = (full) => render(
  <MemoryRouter>
    <RefineryPlanningProvider>
      <FullPrecisionProvider initial={full}><Probe /><PlanResults /></FullPrecisionProvider>
    </RefineryPlanningProvider>
  </MemoryRouter>,
);
const withUtil = () => plan.unitRuns.filter((u) => u.utilisation !== null);

test('off: utilisation prints a whole percent', async () => {
  await act(async () => { mount(false); });
  expect(plan.status).toBe('optimal');
  expect(withUtil().length).toBeGreaterThan(0);
  withUtil().forEach((u) => {
    expect(screen.getAllByText(`(${(u.utilisation * 100).toFixed(0)}%)`).length).toBeGreaterThan(0);
  });
});

test('on: utilisation at 6 decimals', async () => {
  await act(async () => { mount(true); });
  withUtil().forEach((u) => {
    expect(screen.getAllByText(`(${formatFull(u.utilisation * 100)}%)`).length).toBeGreaterThan(0);
  });
});

test('the page carries the switch, off by default', async () => {
  await act(async () => { render(<MemoryRouter><RefineryPlanningStudio /></MemoryRouter>); });
  const sw = screen.getByRole('switch', { name: 'Full precision' });
  expect(sw.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(sw);
  expect(sw.getAttribute('aria-checked')).toBe('true');
});

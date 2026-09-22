// W3 (D3): heater efficiency under the shared Full precision switch. Off,
// two decimals as before; on, 6 decimals of the context's engine result.
import React, { useEffect } from 'react';
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

import { EnergyEfficiencyProvider, useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import CombustionResults from '../CombustionResults';
import EnergyEfficiencyStudio from '@/pages/apps/EnergyEfficiencyStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
});

let ctx;
// The shipped study leaves the radiation loss and the safe O2 blank on
// purpose (they are refused, never defaulted); supply them as the smoke test does.
const Probe = () => {
  ctx = useEnergyEfficiency();
  const { setSection } = ctx;
  useEffect(() => { setSection('heater', { radiationLossPercent: '1.5', minimumSafeO2Percent: '2' }); }, [setSection]);
  return null;
};
const mount = (full) => render(
  <MemoryRouter>
    <EnergyEfficiencyProvider>
      <FullPrecisionProvider initial={full}><Probe /><CombustionResults /></FullPrecisionProvider>
    </EnergyEfficiencyProvider>
  </MemoryRouter>,
);
const two = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test('off: efficiency prints at two decimals', async () => {
  await act(async () => { mount(false); });
  const e = ctx.currentEfficiency.efficiencyPercent;
  expect(Number.isFinite(e)).toBe(true);
  expect(screen.getByText(new RegExp(`^${two(e).replace('.', '\\.')}% efficient on`))).toBeInTheDocument();
});

test('on: efficiency now and tuned at 6 decimals', async () => {
  await act(async () => { mount(true); });
  const e = ctx.currentEfficiency.efficiencyPercent;
  expect(screen.getByText(new RegExp(`^${formatFull(e).replace('.', '\\.')}% efficient on`))).toBeInTheDocument();
  if (!ctx.tuningSaving.error) {
    expect(screen.getByText('Now').nextSibling.textContent).toBe(`${formatFull(e)}%`);
    expect(screen.getByText('Tuned').nextSibling.textContent)
      .toBe(`${formatFull(ctx.targetEfficiency.efficiencyPercent)}%`);
  }
});

test('the page carries the switch, off by default, and it turns the card to full precision', async () => {
  await act(async () => { render(<MemoryRouter><EnergyEfficiencyStudio /></MemoryRouter>); });
  fireEvent.change(screen.getByLabelText(/Radiation loss/i), { target: { value: '1.5' } });
  fireEvent.change(screen.getByLabelText(/Minimum safe O2/i), { target: { value: '2' } });
  const sw = screen.getByRole('switch', { name: 'Full precision' });
  expect(sw.getAttribute('aria-checked')).toBe('false');
  expect(screen.getAllByText(/^\d+\.\d\d% efficient on/).length).toBe(1);
  fireEvent.click(sw);
  expect(screen.getAllByText(/^\d+\.\d{6}% efficient on/).length).toBe(1);
});

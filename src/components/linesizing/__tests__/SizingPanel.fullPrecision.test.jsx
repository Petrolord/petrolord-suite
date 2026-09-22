// W3 (D3): the Line Sizing card under the shared Full precision switch.
// Off, the card prints what it always printed. On, the friction factor
// prints at 10 decimals and the drops and outlet pressure at 6, from the
// same engine result the card is built on.
import React, { useEffect } from 'react';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
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

import { LineSizingProvider, useLineSizing } from '@/contexts/LineSizingContext';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import SizingPanel from '../SizingPanel';
import { fmt } from '../fields';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

let seen;
const Probe = ({ mode }) => {
  const ctx = useLineSizing();
  seen = ctx.sizing;
  useEffect(() => { if (mode) ctx.setMode(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

const mount = (full, mode) => render(
  <MemoryRouter>
    <LineSizingProvider>
      <FullPrecisionProvider initial={full}>
        <Probe mode={mode} />
        <SizingPanel />
      </FullPrecisionProvider>
    </LineSizingProvider>
  </MemoryRouter>,
);

const statValue = (label) => screen.getAllByText(label)[0].nextSibling.textContent;

describe('Line Sizing card, Full precision', () => {
  test('off: the liquid card prints as before and shows no friction-drop stat', async () => {
    await act(async () => { mount(false); });
    expect(seen.mode).toBe('liquid');
    expect(statValue('Pressure drop')).toContain(fmt(seen.dpTotalPsi, 1));
    expect(statValue('Friction factor')).toContain(fmt(seen.f, 4));
    expect(screen.queryByText('Friction drop')).toBeNull();
  });

  test('on: friction factor at 10 dp, total and friction drop at 6 dp', async () => {
    await act(async () => { mount(true); });
    expect(Number.isFinite(seen.dpFrictionPsi)).toBe(true);
    expect(statValue('Pressure drop')).toContain(formatFull(seen.dpTotalPsi, 6));
    expect(statValue('Friction drop')).toContain(formatFull(seen.dpFrictionPsi, 6));
    expect(statValue('Friction factor')).toContain(formatFull(seen.f, 10));
  });

  test('gas card: outlet pressure and drop at 6 dp only when on', async () => {
    let r;
    await act(async () => { r = mount(false, 'gas'); });
    expect(seen.mode).toBe('gas');
    expect(statValue('Outlet pressure')).toContain(fmt(seen.p2Psia, 1));
    r.unmount();
    await act(async () => { mount(true, 'gas'); });
    expect(statValue('Outlet pressure')).toContain(formatFull(seen.p2Psia, 6));
    expect(statValue('Pressure drop')).toContain(formatFull(seen.dpPsi, 6));
  });
});

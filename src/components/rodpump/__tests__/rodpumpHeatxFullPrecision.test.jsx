/**
 * W3 (D3): the Full precision switch on the Rod Pump Design Studio and the
 * Heat Exchanger Sizer. Off, the text is what it was. On, the linkage stroke,
 * the rated displacement, and P, R, F (and the equivalent single-shell P)
 * print at 6 decimals, from the engine results in each studio's context.
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
}));

import { RodPumpDesignProvider, useRodPump } from '@/contexts/RodPumpDesignContext';
import UnitPanel from '@/components/rodpump/UnitPanel';
import LoadsPanel from '@/components/rodpump/LoadsPanel';
import { fmt as rpFmt } from '@/components/rodpump/fields';
import { HeatExchangerProvider, useHeatExchanger } from '@/contexts/HeatExchangerContext';
import { SizingResults } from '@/components/heatexchanger/SizingPanels';
import { fmt as hxFmt } from '@/components/heatexchanger/fields';
import RodPumpDesignStudio from '@/pages/apps/RodPumpDesignStudio';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

let rp;
const RpProbe = () => { rp = useRodPump(); return null; };
const renderRp = (on) => render(
  <RodPumpDesignProvider>
    <FullPrecisionProvider initial={on}>
      <RpProbe />
      <UnitPanel />
      <LoadsPanel />
    </FullPrecisionProvider>
  </RodPumpDesignProvider>,
);

describe('Rod Pump Design Studio', () => {
  // the wave-equation design is slow in jsdom (the page smoke test runs long too)
  jest.setTimeout(60000);
  it('off: the linkage stroke and rated displacement print as before', () => {
    renderRp(false);
    expect(rp.unit.ok).toBe(true);
    expect(screen.getByText(new RegExp(`This linkage gives a ${rp.unit.kin.strokeIn.toFixed(1).replace('.', '\\.')} in stroke`))).toBeInTheDocument();
    expect(screen.getByText(`Swept ${rpFmt(rp.design.sweptBpd, 1)}, rated ${rpFmt(rp.design.ratedBpd, 1)}`)).toBeInTheDocument();
  });

  it('on: both at 6 decimals', () => {
    renderRp(true);
    expect(screen.getByText(new RegExp(`This linkage gives a ${formatFull(rp.unit.kin.strokeIn).replace('.', '\\.')} in stroke`))).toBeInTheDocument();
    expect(screen.getByText(`Swept ${formatFull(rp.design.sweptBpd)}, rated ${formatFull(rp.design.ratedBpd)}`)).toBeInTheDocument();
  });

  it('the page carries the switch, off until clicked', async () => {
    render(<MemoryRouter><RodPumpDesignStudio /></MemoryRouter>);
    const sw = await screen.findByRole('switch', { name: 'Full precision' }, { timeout: 30000 });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
  });
});

let hx;
const HxProbe = ({ edits = [] }) => {
  const ctx = useHeatExchanger();
  hx = ctx;
  React.useEffect(() => {
    edits.forEach(([s, k, v]) => ctx.setSection(s, k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};
const statValue = (label) => screen.getByText(label).nextSibling.firstChild.textContent.trim();
const renderHx = (on, edits) => render(
  <HeatExchangerProvider>
    <FullPrecisionProvider initial={on}>
      <HxProbe edits={edits} />
      <SizingResults />
    </FullPrecisionProvider>
  </HeatExchangerProvider>,
);

describe('Heat Exchanger Sizer', () => {
  it('off: P, R and F print at 3 decimals and no single-shell P', () => {
    renderHx(false, [['streams', 'arrangement', 'shell'], ['streams', 'shellPasses', '2']]);
    expect(hx.thermal.f).toBeGreaterThan(0);
    expect(statValue('P')).toBe(hxFmt(hx.thermal.p, 3));
    expect(statValue('F correction')).toBe(hxFmt(hx.thermal.f, 3));
    expect(screen.queryByText('Equivalent single-shell P')).toBeNull();
  });

  it('on, two shells: P, R, F and the equivalent single-shell P at 6 decimals', async () => {
    renderHx(true, [['streams', 'arrangement', 'shell'], ['streams', 'shellPasses', '2']]);
    await waitFor(() => expect(hx.thermal.shellPassesUsed).toBe(2));
    expect(statValue('P')).toBe(formatFull(hx.thermal.p));
    expect(statValue('R')).toBe(formatFull(hx.thermal.r));
    expect(statValue('F correction')).toBe(formatFull(hx.thermal.f));
    expect(statValue('Equivalent single-shell P')).toBe(formatFull(hx.thermal.fResult.p1));
    expect(hx.thermal.fResult.p1).not.toBe(hx.thermal.p);
  });
});

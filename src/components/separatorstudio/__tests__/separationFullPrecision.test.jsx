/**
 * W3 (D3): the Full precision switch on the Separator and Slug Catcher
 * Designer and on the Facility Layout Mapper spacing check. Off, the cards
 * print as before. On, the graded quantities print at 6 decimals, read from
 * the studio context or the layout check, which is what the engine returned.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

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

import { SeparatorStudioProvider, useSeparator } from '@/contexts/SeparatorStudioContext';
import { VesselResults } from '@/components/separatorstudio/SeparatorPanels';
import { fmt } from '@/components/separatorstudio/fields';
import SpacingPanel from '@/components/facilitylayoutmapper/SpacingPanel';
import { runLayoutCheck, DEFAULT_SPACING_INPUTS, spacingInputsToRadiation } from '@/utils/facilities/layoutSpacing';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

let sep;
const Probe = ({ edits = [] }) => {
  const ctx = useSeparator();
  sep = ctx;
  React.useEffect(() => {
    edits.forEach(([s, k, v]) => ctx.setSection(s, k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const statValue = (label) => screen.getByText(label).nextSibling.firstChild.textContent.trim();

const renderSep = (on, edits) => render(
  <SeparatorStudioProvider>
    <FullPrecisionProvider initial={on}>
      <Probe edits={edits} />
      <VesselResults />
    </FullPrecisionProvider>
  </SeparatorStudioProvider>,
);

describe('Separator and Slug Catcher Designer', () => {
  it('off: conditions and the selected vessel print as before', () => {
    renderSep(false);
    const c = sep.conditions;
    expect(statValue('Gas density')).toBe(fmt(c.rhoGas, 3));
    expect(statValue('Actual gas rate')).toBe(fmt(c.qGasActFt3S, 2));
    expect(statValue('Settling velocity')).toBe(fmt(c.vTerminalFtS, 3));
    expect(statValue('Gas velocity')).toBe(fmt(sep.detail.gasVelocityFtS, 3));
  });

  it('on: density, actual rate, settling and gas velocity and length at 6 decimals', () => {
    renderSep(true);
    const c = sep.conditions;
    expect(statValue('Gas density')).toBe(formatFull(c.rhoGas));
    expect(statValue('Actual gas rate')).toBe(formatFull(c.qGasActFt3S));
    expect(statValue('Settling velocity')).toBe(formatFull(c.vTerminalFtS));
    expect(statValue('Gas velocity')).toBe(formatFull(sep.detail.gasVelocityFtS));
    expect(statValue('Length')).toBe(formatFull(sep.selected.lengthFt));
  });

  it('on, vertical vessel: height, gas diameter and velocity margin at 6 decimals', async () => {
    renderSep(true, [['vessel', 'type', 'vertical2']]);
    await waitFor(() => expect(screen.getByText('Diameter the gas needs')).toBeInTheDocument());
    expect(statValue('Diameter the gas needs')).toBe(formatFull(sep.detail.diameterGasFt));
    expect(statValue('Velocity margin')).toBe(formatFull(sep.detail.velocityMargin));
    expect(statValue('Height')).toBe(formatFull(sep.selected.lengthFt));
  });

  it('on, three-phase vessel: interface height at 6 decimals', async () => {
    renderSep(true, [['vessel', 'type', 'horizontal3'], ['vessel', 'ldMax', '6']]);
    await waitFor(() => expect(screen.getByText('Interface height')).toBeInTheDocument());
    expect(statValue('Interface height')).toBe(formatFull(sep.detail.interfaceHeightFt));
  });
});

describe('Facility Layout Mapper spacing check', () => {
  const layer = (id, iconName, dLatM) => ({
    id, type: 'icon', iconName, tag: `${iconName}-001`,
    latlng: { lat: 4.8156 + dLatM / 111320, lng: 7.0498 },
  });
  const layers = [layer('t', 'Tank', 0), layer('s', 'Separator', 20), layer('f', 'Flare', 60)];
  const result = runLayoutCheck({ layers, radiation: spacingInputsToRadiation(DEFAULT_SPACING_INPUTS) });

  it('the case has a shortfall to read', () => {
    expect(result.worstAbsolute).toBeTruthy();
    expect(result.worstRelative).toBeTruthy();
  });

  it('off: the worst shortfalls print as before', () => {
    render(<SpacingPanel layers={layers} />);
    const txt = screen.getByTestId('worst-rankings').textContent;
    expect(txt).toContain(`short ${fmt(result.worstAbsolute.shortfallM, 1)} m`);
    expect(txt).toContain(`${fmt(result.worstRelative.shortfallFraction * 100, 0)} percent short`);
  });

  it('on: the shortfall in m and as a fraction at 6 decimals', () => {
    render(<FullPrecisionProvider initial><SpacingPanel layers={layers} /></FullPrecisionProvider>);
    const txt = screen.getByTestId('worst-rankings').textContent;
    expect(txt).toContain(`short ${formatFull(result.worstAbsolute.shortfallM)} m`);
    expect(txt).toContain(`short by a fraction ${formatFull(result.worstRelative.shortfallFraction)} of its requirement`);
  });
});

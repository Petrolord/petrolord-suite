/**
 * W3 (D3): the Full precision switch on the Relief and Flare Studio. Off,
 * the PSV and blowdown cards print as before. On, the required area, the
 * critical pressure ratio, the gas coefficient C, the blowdown time in
 * seconds and the choked floor print at 6 decimals, from the engine.
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

import { ReliefStudioProvider, useRelief, defaultInputs } from '@/contexts/ReliefStudioContext';
import PsvResultsPanel from '@/components/reliefstudio/PsvResultsPanel';
import BlowdownPanel from '@/components/reliefstudio/BlowdownPanel';
import { fmt } from '@/components/reliefstudio/fields';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { formatFull } from '@/lib/fullPrecision';
import { gasConstantC, criticalPressureRatio, blowdown } from '@/utils/facilities/engine/relief';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

let rel;
const Probe = ({ scenario, edits = [] }) => {
  const ctx = useRelief();
  rel = ctx;
  React.useEffect(() => {
    if (scenario) ctx.setScenario(scenario);
    edits.forEach(([s, k, v]) => ctx.setSection(s, k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};
const statValue = (label) => screen.getByText(label).nextSibling.firstChild.textContent.trim();
const renderRelief = (on, props = {}) => render(
  <ReliefStudioProvider>
    <FullPrecisionProvider initial={on}>
      <Probe {...props} />
      <PsvResultsPanel />
      <BlowdownPanel />
    </FullPrecisionProvider>
  </ReliefStudioProvider>,
);

describe('Relief and Flare Studio', () => {
  it('off: area and blowdown print as before; no ratio, C or floor stats', async () => {
    renderRelief(false, { scenario: 'gas' });
    await waitFor(() => expect(rel.psv.scenario).toBe('gas'));
    expect(statValue('Required area')).toBe(fmt(rel.psv.areaIn2, 3));
    expect(statValue('Time to end pressure')).toBe(fmt(rel.blowdownResult.timeS / 60, 1));
    ['Critical pressure ratio', 'Gas coefficient C', 'Choked floor', 'Time to end pressure, seconds']
      .forEach((l) => expect(screen.queryByText(l)).toBeNull());
  });

  it('on, gas route: area, critical ratio and C at 6 decimals', async () => {
    renderRelief(true, { scenario: 'gas', edits: [['gas', 'k', '1.27']] });
    await waitFor(() => expect(rel.psv.scenario).toBe('gas'));
    expect(statValue('Required area')).toBe(formatFull(rel.psv.areaIn2));
    expect(statValue('Critical pressure ratio')).toBe(formatFull(criticalPressureRatio(1.27)));
    expect(statValue('Gas coefficient C')).toBe(formatFull(gasConstantC(1.27)));
  });

  it('on, liquid route: the area at 6 decimals and no gas-only stats', async () => {
    renderRelief(true, { scenario: 'liquid' });
    await waitFor(() => expect(rel.psv.scenario).toBe('liquid'));
    expect(statValue('Required area')).toBe(formatFull(rel.psv.areaIn2));
    expect(screen.queryByText('Gas coefficient C')).toBeNull();
  });

  it('on: blowdown seconds and the choked floor at the typed back pressure', async () => {
    renderRelief(true, { edits: [['blowdownIn', 'pBackPsia', '16.5']] });
    await waitFor(() => expect(rel.inputs.blowdownIn.pBackPsia).toBe('16.5'));
    const b = defaultInputs().blowdownIn;
    const direct = blowdown({
      volumeFt3: +b.volumeFt3, p0Psia: +b.p0Psig + 14.7, t0R: +b.tF + 459.67, pEndPsia: +b.pEndPsig + 14.7,
      mw: +b.mw, k: +b.k, z: +b.z, orificeDIn: +b.orificeDIn, cd: +b.cd, pBackPsia: 16.5,
    });
    expect(rel.blowdownResult.chokedToPsia).toBe(direct.chokedToPsia);
    expect(statValue('Choked floor')).toBe(formatFull(direct.chokedToPsia));
    expect(statValue('Time to end pressure, seconds')).toBe(formatFull(direct.timeS));
  });

  it('a study saved without a back pressure computes what it did before (engine default 14.7)', () => {
    renderRelief(false);
    const b = defaultInputs().blowdownIn;
    const legacy = blowdown({
      volumeFt3: +b.volumeFt3, p0Psia: +b.p0Psig + 14.7, t0R: +b.tF + 459.67, pEndPsia: +b.pEndPsig + 14.7,
      mw: +b.mw, k: +b.k, z: +b.z, orificeDIn: +b.orificeDIn, cd: +b.cd,
    });
    expect(rel.blowdownResult.timeS).toBe(legacy.timeS);
    expect(rel.blowdownResult.chokedToPsia).toBe(legacy.chokedToPsia);
  });
});

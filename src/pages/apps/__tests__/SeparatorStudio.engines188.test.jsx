/**
 * FC1-0 (engines #188) render gates for the Separator & Slug Catcher Studio.
 *
 * The vessel tab asks for both droplet sizes on a three-phase vessel, the
 * three-phase results show the one retention length, the interface and the
 * layers the engine now places, and a candidate that cannot carry the gas is
 * shown as unfeasible rather than as a slenderness problem.
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
import { VesselInputs, VesselResults } from '@/components/separatorstudio/SeparatorPanels';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

/** Drive the studio's own setters, the way the UI controls do. */
const Apply = ({ edits }) => {
  const { setSection } = useSeparator();
  React.useEffect(() => {
    edits.forEach(([section, key, value]) => setSection(section, key, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const renderVessel = (edits = []) => render(
  <SeparatorStudioProvider>
    <Apply edits={edits} />
    <VesselInputs />
    <VesselResults />
  </SeparatorStudioProvider>,
);

describe('the three-phase vessel tab', () => {
  it('asks for both droplet sizes and shows the interface the engine places', async () => {
    // The example three-phase case is slender at the smallest candidate
    // (L/D 5.9), so the band is opened to 6 for a vessel to be selected.
    renderVessel([['vessel', 'type', 'horizontal3'], ['vessel', 'ldMax', '6']]);
    await waitFor(() => expect(screen.getAllByText('Water droplet in oil (um)').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Oil droplet in water (um)').length).toBeGreaterThan(0);
    expect(screen.queryByText('Droplet (um)')).not.toBeInTheDocument();

    expect(screen.getAllByText('Liquid retention needs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Interface height').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Water layer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oil layer').length).toBeGreaterThan(0);
    // The retired oil and water retention lengths are gone.
    expect(screen.queryByText('Oil retention needs')).not.toBeInTheDocument();
    expect(screen.queryByText('Water retention needs')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it('negative control: a two-phase vessel keeps its two length requirements', async () => {
    renderVessel();
    await waitFor(() => expect(screen.getAllByText(/Length the gas needs/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Length the liquid needs/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Water droplet in oil (um)')).not.toBeInTheDocument();
  });
});

describe('the conditions card', () => {
  it('shows the reduced conditions the z-factor came from', async () => {
    renderVessel();
    await waitFor(() => expect(screen.getAllByText('Ppr').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Tpr').length).toBeGreaterThan(0);
  });
});

describe('a vessel that cannot carry the gas', () => {
  it('is shown as unfeasible, and nothing is selected', async () => {
    renderVessel([['process', 'qGasMMscfd', '4000']]);
    await waitFor(() => expect(screen.getAllByText('cannot carry the gas').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/No candidate diameter is feasible/).length).toBeGreaterThan(0);
    expect(screen.queryByText('PREFERRED')).not.toBeInTheDocument();
    expect(screen.queryByText(/Selected vessel/i)).not.toBeInTheDocument();
  });

  it('negative control: the example case selects a preferred vessel', async () => {
    renderVessel();
    await waitFor(() => expect(screen.getAllByText('PREFERRED').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Selected vessel/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('cannot carry the gas')).not.toBeInTheDocument();
  });
});

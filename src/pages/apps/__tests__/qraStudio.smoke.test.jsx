/**
 * QRA Studio page (Process Safety PS3).
 *
 * The engine is gated in packages/engines/__tests__/hse.qra.test.js and the
 * data layer in src/utils/processSafety/__tests__/qraStudy.test.js. This
 * mounts the app, because a validated engine behind a mis-wired panel is
 * still a broken app, and checks what a user could be misled by if the wiring
 * slipped: the bands and states printed as the engine names them, a refusal
 * shown with the field it names and no number beside it, the event tree
 * reaching the register, the published checklist example on the opening
 * screen, and the scope limits on screen.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockFrom = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
}));

import QraStudio from '@/pages/apps/QraStudio';
import QraStudioHelpGuide, { QRA_GUIDE_SECTIONS } from '@/pages/apps/QraStudioHelpGuide';

const chain = () => {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => q),
  };
  return q;
};

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => chain());
});

const mount = () => render(<MemoryRouter><QraStudio /></MemoryRouter>);
const openTab = async (name) => fireEvent.mouseDown(await screen.findByRole('tab', { name }));
const type = (el, value) => fireEvent.change(el, { target: { value } });

describe('the page', () => {
  it('mounts with the saved-study selector, a help link and the scope limits', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /QRA Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toHaveAttribute('href', '/dashboard/apps/process-safety/qra-studio/help');
    const scope = screen.getByTestId('scope-notice');
    ['aversion-weighted', 'R2P2 societal point', 'wind-rose', 'Monte Carlo', 'repealed']
      .forEach((w) => expect(scope).toHaveTextContent(new RegExp(w, 'i')));
    expect(screen.getByTestId('consequence-note')).toHaveTextContent(/recomputes no source term/);
    ['Register', 'Event tree', 'Individual risk', 'Societal risk', 'ALARP and cost-benefit']
      .forEach((t) => expect(screen.getByRole('tab', { name: t })).toBeInTheDocument());
  });

  it('lists studies for the organization only, from its own table', async () => {
    mount();
    await screen.findByRole('heading', { level: 1 });
    expect(mockFrom).toHaveBeenCalledWith('ps_qra_studies');
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });
});

describe('register', () => {
  it('carries the event tree outcome into the scenario and gives each Pd by the Purple Book rules', async () => {
    mount();
    expect(await screen.findByTestId('scenario-1-freq')).toHaveTextContent(/^1\.728e-5$/);
    expect(screen.getByTestId('cell-0-0-pd')).toHaveTextContent(/^0\.537$/);
    expect(screen.getByTestId('cell-1-0-pd')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('cell-2-1-pd')).toHaveTextContent(/^0$/);
  });

  it('refuses a blank heat flux with the field named, and shows no Pd for it', async () => {
    mount();
    type(await screen.findByTestId('cell-0-0-dose-input'), '');
    const cell = screen.getByTestId('cell-0-0');
    expect(within(cell).getByRole('alert')).toHaveTextContent(/^heatFluxWM2:/);
    expect(within(cell).queryByTestId('cell-0-0-pd')).not.toBeInTheDocument();
  });

  it('adds a blank scenario, names what it is missing, and invents no LSIR', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('add-scenario'));
    await openTab(/Individual risk/);
    const table = await screen.findByTestId('lsir-table');
    expect(within(table).getAllByRole('alert')[0]).toHaveTextContent(/^Scenario 5 at Process area: heatFluxWM2:/);
    expect(within(table).queryByTestId('lsir-0')).not.toBeInTheDocument();
    await openTab(/Register/);
    type(await screen.findByTestId('cell-4-0-mode'), 'typed');
    type(screen.getByTestId('cell-4-0-pd-input'), '0.1');
    type(screen.getByTestId('cell-4-1-mode'), 'typed');
    type(screen.getByTestId('cell-4-1-pd-input'), '0.1');
    type(screen.getByTestId('cell-4-2-mode'), 'typed');
    type(screen.getByTestId('cell-4-2-pd-input'), '0.1');
    await openTab(/Individual risk/);
    expect(within(await screen.findByTestId('lsir-table')).getAllByRole('alert')[0]).toHaveTextContent(/scenarios\[4\]\.frequencyPerYr/);
  });
});

describe('event tree', () => {
  it('reads Table 4.5 and moves the register with the tree', async () => {
    mount();
    await openTab(/Event tree/);
    expect(await screen.findByTestId('ignition-probability')).toHaveTextContent(/^0\.04$/);
    expect(screen.getByTestId('ignition-band')).toHaveTextContent('medium');
    type(screen.getByTestId('rate-input'), '150');
    expect(screen.getByTestId('ignition-probability')).toHaveTextContent(/^0\.09$/);
    await openTab(/Register/);
    expect(await screen.findByTestId('scenario-0-freq')).toHaveTextContent(/^9\.000e-6$/);
  });

  it('refuses a split that does not sum to 1', async () => {
    mount();
    await openTab(/Event tree/);
    type(await screen.findByTestId('split-mode'), 'given');
    type(screen.getByTestId('explosion-share-input'), '0.5');
    expect(within(screen.getByTestId('event-tree-outcomes')).getByRole('alert')).toHaveTextContent(/^vapourCloudSplit:/);
  });
});

describe('individual risk', () => {
  it('bands each location and the IRPA as the engine names them, with the chart and contours', async () => {
    mount();
    await openTab(/Individual risk/);
    expect(await screen.findByTestId('band-0')).toHaveTextContent(/^TOLERABLE$/);
    expect(screen.getByTestId('band-1')).toHaveTextContent(/^BROADLY_ACCEPTABLE$/);
    expect(screen.getByTestId('band-2')).toHaveTextContent(/^BROADLY_ACCEPTABLE$/);
    expect(screen.getByTestId('lsir-0')).toHaveTextContent('3.270e-5');
    expect(screen.getByTestId('contour-0')).toHaveTextContent('inside 1e-5');
    expect(screen.getByTestId('irpa-band')).toHaveTextContent(/^TOLERABLE$/);
    expect(screen.getByTestId('irpa-value')).toHaveTextContent('7.508e-6');
    expect(screen.getByTestId('ir-band-chart')).toBeInTheDocument();
    expect(screen.getByTestId('transect-chart')).toBeInTheDocument();
    expect(screen.getByTestId('contour-table')).toHaveTextContent(/not crossed in the transect/);
  });

  it('puts a worker exactly at 1e-3 in the lower band, and says it is at the limit', async () => {
    mount();
    type(await screen.findByTestId('scenario-3-freq-input'), '1e-3');
    const pd = screen.getByLabelText('H2S release at Process area, probability from');
    type(pd, 'typed');
    type(screen.getByTestId('cell-3-0-pd-input'), '1');
    ['cell-0-0-mode', 'cell-1-0-mode', 'cell-2-0-mode'].forEach((id) => type(screen.getByTestId(id), 'typed'));
    ['cell-0-0-pd-input', 'cell-1-0-pd-input', 'cell-2-0-pd-input'].forEach((id) => type(screen.getByTestId(id), '0'));
    await openTab(/Individual risk/);
    expect(await screen.findByTestId('band-0')).toHaveTextContent(/^TOLERABLE$/);
    expect(screen.getByTestId('lsir-row-0')).toHaveTextContent(/at the unacceptable limit/);
  });

  it('refuses an occupancy of more than a year', async () => {
    mount();
    type(await screen.findByTestId('location-0-hours-input'), '9000');
    await openTab(/Individual risk/);
    expect(within(await screen.findByTestId('irpa')).getByRole('alert')).toHaveTextContent(/^locations\[0\]\.hoursPerYr:/);
    expect(screen.queryByTestId('irpa-value')).not.toBeInTheDocument();
  });
});

describe('societal risk', () => {
  it('gives PLL, FAR and the F-N curve below the Purple Book line', async () => {
    mount();
    await openTab(/Societal risk/);
    expect(await screen.findByTestId('pll-value')).toHaveTextContent(/^1\.352e-4$/);
    expect(screen.getByTestId('far-value')).toHaveTextContent(/^0\.169$/);
    expect(screen.getByTestId('fn-state')).toHaveTextContent(/^BELOW$/);
    expect(screen.getByTestId('fn-chart')).toBeInTheDocument();
    expect(screen.getByTestId('fn-checks')).toHaveTextContent('0.72');
  });

  it('turns EXCEEDS when a custom line is tighter, with the range of N above it', async () => {
    mount();
    await openTab(/Societal risk/);
    type(await screen.findByTestId('fn-criterion'), 'custom');
    type(screen.getByTestId('fn-c-input'), '1e-4');
    expect(screen.getByTestId('fn-state')).toHaveTextContent(/^EXCEEDS$/);
  });

  it('refuses FAR without exposed hours and keeps the PLL', async () => {
    mount();
    await openTab(/Societal risk/);
    type(await screen.findByTestId('exposed-hours-input'), '');
    expect(within(screen.getByTestId('pll')).getByRole('alert')).toHaveTextContent(/^exposedHoursPerYr:/);
    expect(screen.queryByTestId('far-value')).not.toBeInTheDocument();
    expect(screen.getByTestId('pll-value')).toBeInTheDocument();
  });
});

describe('ALARP and cost-benefit', () => {
  it('opens on the HSE checklist example: 9,283 against 93,000 at DF 10', async () => {
    mount();
    await openTab(/ALARP and cost-benefit/);
    expect(await screen.findByTestId('pv-benefit')).toHaveTextContent(/^9,284$/);
    expect(screen.getByTestId('max-cost')).toHaveTextContent(/^92,835$/);
    expect(screen.getByTestId('pv-cost')).toHaveTextContent(/^93,000$/);
    expect(screen.getByTestId('icaf')).toHaveTextContent(/^18,600,000$/);
    expect(screen.getByTestId('cba-state')).toHaveTextContent(/^GROSSLY_DISPROPORTIONATE$/);
    expect(screen.getByTestId('verdict-irpa')).toHaveTextContent(/^TOLERABLE$/);
    expect(screen.getByTestId('verdict-fn')).toHaveTextContent(/^BELOW$/);
    expect(screen.getByTestId('alarp-reading')).toHaveTextContent(/At least one risk is TOLERABLE/);
    expect(screen.getByTestId('band-legend')).toHaveTextContent(/UNACCEPTABLE[\s\S]*TOLERABLE[\s\S]*BROADLY_ACCEPTABLE/);
  });

  it('turns reasonably practicable when the measure costs less', async () => {
    mount();
    await openTab(/ALARP and cost-benefit/);
    type(await screen.findByTestId('capital-input'), '50000');
    expect(screen.getByTestId('cba-state')).toHaveTextContent(/^NOT_GROSSLY_DISPROPORTIONATE$/);
  });

  it('refuses a DF below 1 by name and shows no verdict', async () => {
    mount();
    await openTab(/ALARP and cost-benefit/);
    type(await screen.findByTestId('df-input'), '0.5');
    expect(within(screen.getByTestId('cba')).getByRole('alert')).toHaveTextContent(/^disproportionFactor:/);
    expect(screen.queryByTestId('cba-state')).not.toBeInTheDocument();
  });

  it('takes the PLL reduction from the register less the PLL after the measure', async () => {
    mount();
    await openTab(/ALARP and cost-benefit/);
    type(await screen.findByTestId('delta-source'), 'register');
    expect(within(screen.getByTestId('cba')).getByRole('alert')).toHaveTextContent(/^pllAfterPerYr:/);
    type(screen.getByTestId('pll-after-input'), '1e-4');
    expect(screen.getByTestId('delta-value')).toHaveTextContent('3.520e-5');
  });
});

describe('the help guide', () => {
  it('renders every section it lists and states the boundary rule and the checklist example', () => {
    const { container } = render(<MemoryRouter><QraStudioHelpGuide /></MemoryRouter>);
    QRA_GUIDE_SECTIONS.forEach((s) => expect(container.querySelector(`#section-${s.id}`)).not.toBeNull());
    expect(container).toHaveTextContent(/A risk exactly at a limit belongs to the lower band/);
    expect(container).toHaveTextContent(/6,684 \+ 2,072 \+ 512 \+ 15/);
    expect(container).toHaveTextContent(/canonical economics npv/);
    expect(container).toHaveTextContent(/repealed on 1\s+January 2024/);
  });
});

/**
 * Consequence Modelling Studio page (Process Safety PS2).
 *
 * The engine is gated in packages/engines/__tests__/hse.consequence.test.js
 * and the data layer in src/utils/processSafety/__tests__/consequenceStudy.test.js.
 * This mounts the app, because a validated engine behind a mis-wired panel is
 * still a broken app, and checks what a user could be misled by if the wiring
 * slipped: the published pool fire on the opening screen, the flow regime and
 * the search states printed as the engine names them, a refusal shown with the
 * field it names, the carried over values, and the scope limits on screen.
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

import ConsequenceModellingStudio from '@/pages/apps/ConsequenceModellingStudio';
import ConsequenceModellingStudioHelpGuide, { CONSEQUENCE_GUIDE_SECTIONS } from '@/pages/apps/ConsequenceModellingStudioHelpGuide';

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

const mount = () => render(<MemoryRouter><ConsequenceModellingStudio /></MemoryRouter>);
const openTab = async (name) => fireEvent.mouseDown(await screen.findByRole('tab', { name }));
const type = (el, value) => fireEvent.change(el, { target: { value } });

describe('the page', () => {
  it('mounts with the saved-study selector, a help link and the scope limits', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Consequence Modelling Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toHaveAttribute('href', '/dashboard/apps/process-safety/consequence-studio/help');
    const scope = screen.getByTestId('scope-notice');
    ['two-phase', 'instantaneous puff', 'urban dispersion', 'jet fires', 'multi-energy', 'Kingery-Bulmash']
      .forEach((w) => expect(scope).toHaveTextContent(new RegExp(w, 'i')));
    expect(screen.getByTestId('facilities-screening-note')).toHaveTextContent(/point-source screening model/);
    ['Source term', 'Dispersion', 'Fire', 'Explosion', 'Harm'].forEach((t) => expect(screen.getByRole('tab', { name: t })).toBeInTheDocument());
  });

  it('lists studies for the organization only, from its own table', async () => {
    mount();
    await screen.findByRole('heading', { level: 1 });
    expect(mockFrom).toHaveBeenCalledWith('ps_consequence_studies');
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });
});

describe('source term', () => {
  it('shows the regime as the engine names it and follows it across the critical ratio', async () => {
    mount();
    expect(await screen.findByTestId('gas-regime')).toHaveTextContent(/^CHOKED$/);
    expect(screen.getByTestId('gas-rate')).toHaveTextContent('15.3');
    type(screen.getByTestId('gas-p0-input'), '1.5');
    expect(screen.getByTestId('gas-regime')).toHaveTextContent(/^SUBSONIC$/);
  });

  it('refuses a blank hole and names the field, rather than reading it as zero', async () => {
    mount();
    type(await screen.findByTestId('liquid-hole-input'), '');
    const card = screen.getByTestId('liquid-release');
    expect(within(card).getByRole('alert')).toHaveTextContent(/^holeDiameterM:/);
    expect(within(card).queryByTestId('liquid-rate')).not.toBeInTheDocument();
    expect(screen.getByTestId('liquid-hole-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('gives the pool diameter from the bund and an evaporation rate', async () => {
    mount();
    expect(await screen.findByTestId('pool-diameter')).toHaveTextContent('42.446');
    expect(screen.getByTestId('evaporation-rate')).toHaveTextContent(/^5\.86$/);
  });
});

describe('dispersion', () => {
  it('takes the evaporation rate, gives mg/m3 and ppm, and finds the far root', async () => {
    mount();
    await openTab(/Dispersion/);
    expect(await screen.findByTestId('linked-rate')).toHaveTextContent('5.86');
    expect(screen.getByTestId('centreline-mg')).toHaveTextContent(/^421$/);
    expect(screen.getByTestId('centreline-ppm')).toHaveTextContent(/^132$/);
    expect(screen.getByTestId('plume-distance-state')).toHaveTextContent(/^REACHED$/);
    expect(screen.getByTestId('plume-near')).toHaveTextContent('none');
    expect(screen.getByTestId('plume-far')).toBeInTheDocument();
    expect(screen.getByTestId('plume-chart')).toBeInTheDocument();
  });

  it('gives two roots for an elevated release', async () => {
    mount();
    await openTab(/Dispersion/);
    type(await screen.findByTestId('release-height-input'), '30');
    type(screen.getByTestId('target-concentration-input'), '5');
    expect(screen.getByTestId('plume-distance-state')).toHaveTextContent(/^REACHED$/);
    expect(screen.getByTestId('plume-near')).not.toHaveTextContent('none');
  });

  it('says a distance search needs a stability class when sigmas are given', async () => {
    mount();
    await openTab(/Dispersion/);
    type(await screen.findByTestId('sigma-mode'), 'user');
    type(screen.getByTestId('sigma-y-input'), '28.8');
    type(screen.getByTestId('sigma-z-input'), '10.3');
    expect(screen.getByText(/choose a stability class for this search/)).toBeInTheDocument();
    expect(screen.queryByTestId('plume-chart')).not.toBeInTheDocument();
  });
});

describe('fire', () => {
  it('opens on the Yellow Book 6.6.3 pool fire and reproduces the printed 4.58 kW/m2', async () => {
    mount();
    await openTab(/Fire/);
    expect(await screen.findByTestId('heat-flux')).toHaveTextContent(/^4\.58$/);
    expect(screen.getByTestId('flame-length')).toHaveTextContent(/^46\.775$/);
    expect(screen.getByTestId('flame-tilt')).toHaveTextContent(/^50\.829$/);
    expect(screen.getByTestId('linked-diameter')).toHaveTextContent('42.446');
    expect(screen.getByTestId('fire-distance-state')).toHaveTextContent(/^REACHED$/);
    expect(screen.getByTestId('fire-chart')).toBeInTheDocument();
    expect(screen.getByText(/air at 15 C is about 1\.48e-5/)).toBeInTheDocument();
  });

  it('refuses Bagster outside its band and names the path length', async () => {
    mount();
    await openTab(/Fire/);
    type(await screen.findByTestId('tau-mode'), 'bagster');
    type(screen.getByTestId('pw-input'), '10');
    const panel = screen.getByTestId('fire-flame');
    expect(within(panel).getByRole('alert')).toHaveTextContent(/^pathLengthM: pw x lies outside 1e4 to 1e5 N\/m/);
  });

  it('refuses a target under the tilted flame', async () => {
    mount();
    await openTab(/Fire/);
    type(await screen.findByTestId('fire-distance-input'), '40');
    const panel = screen.getByTestId('fire-flame');
    expect(within(panel).getByRole('alert')).toHaveTextContent(/^tiltDeg: the tilted flame reaches over the target/);
  });
});

describe('explosion', () => {
  it('gives the TNT mass, scaled distance and overpressure, and a distance for a target', async () => {
    mount();
    await openTab(/Explosion/);
    expect(await screen.findByTestId('tnt-mass')).toHaveTextContent('294.9');
    expect(screen.getByTestId('scaled-distance')).toHaveTextContent('15.02');
    expect(screen.getByTestId('overpressure')).toHaveTextContent(/^6\.05$/);
    expect(screen.getByTestId('blast-distance')).toBeInTheDocument();
    expect(screen.getByTestId('explosion-chart')).toBeInTheDocument();
  });

  it('refuses a TNT energy typed in kJ/kg', async () => {
    mount();
    await openTab(/Explosion/);
    type(await screen.findByTestId('tnt-energy-input'), '4680');
    expect(within(screen.getByTestId('explosion-charge')).getByRole('alert')).toHaveTextContent(/^tntBlastEnergyJKg:/);
  });

  it('refuses a scaled distance outside the fit range', async () => {
    mount();
    await openTab(/Explosion/);
    type(await screen.findByTestId('blast-distance-input'), '1000');
    expect(within(screen.getByTestId('explosion-overpressure')).getByRole('alert')).toHaveTextContent(/^scaledDistanceMKg13: Z lies outside 0\.05 to 40/);
  });
});

describe('harm', () => {
  it('carries the heat flux, concentration and overpressure over and gives each probability', async () => {
    mount();
    await openTab(/Harm/);
    expect(await screen.findByTestId('linked-heat-flux')).toHaveTextContent('4.58');
    expect(screen.getByTestId('linked-concentration')).toHaveTextContent('421');
    expect(screen.getByTestId('linked-overpressure')).toHaveTextContent('6.05');
    expect(screen.getByTestId('thermal-probability')).toHaveTextContent('%');
    expect(screen.getByTestId('toxic-probability')).toHaveTextContent('0 %');
    expect(screen.getByText(/below 1\.5e-7, the absolute accuracy of the normal CDF/)).toBeInTheDocument();
  });

  it('reproduces the Purple Book CO probit with the pb preset and a typed concentration', async () => {
    mount();
    await openTab(/Harm/);
    type(await screen.findByTestId('toxic-preset'), 'pb-carbon-monoxide');
    type(screen.getByTestId('toxic-link'), 'typed');
    type(screen.getByLabelText('Unit'), 'mg/m3');
    type(screen.getByTestId('toxic-concentration-input'), '21300');
    type(screen.getByTestId('toxic-time-input'), '30');
    expect(screen.getByTestId('toxic-probit')).toHaveTextContent(/^5\.968$/);
    expect(screen.getByTestId('toxic-probability')).toHaveTextContent('83.3 %');
  });
});

describe('the help guide', () => {
  it('renders every section it lists and cites the errata and judgement calls a user meets', () => {
    const { container } = render(<MemoryRouter><ConsequenceModellingStudioHelpGuide /></MemoryRouter>);
    CONSEQUENCE_GUIDE_SECTIONS.forEach((s) => expect(container.querySelector(`#section-${s.id}`)).not.toBeNull());
    expect(container).toHaveTextContent(/5\^2 \/ \(9\.80665 x 42\.445\) = 0\.06006/);
    expect(container).toHaveTextContent(/1e4 < pw x < 1e5 N\/m/);
    expect(container).toHaveTextContent(/Z = 0\.05 to 40 m\/kg\^\(1\/3\)/);
    expect(container).toHaveTextContent(/4\.0 to 5\.0 MJ\/kg/);
    expect(container).toHaveTextContent(/separate screening model/i);
  });
});

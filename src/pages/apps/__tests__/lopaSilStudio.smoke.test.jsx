/**
 * LOPA & SIL Studio page (Process Safety PS1).
 *
 * The engine is gated in packages/engines/__tests__/hse.lopa.test.js and the
 * data layer in src/utils/processSafety/__tests__/lopaStudy.test.js. This
 * mounts the app, because a validated engine behind a mis-wired panel is still
 * a broken app, and checks what a user could be misled by if the wiring
 * slipped: the outcome state printed as the engine names it, a non-credited
 * layer shown with the engine's reason, the scope limits stated on screen, and
 * the verdict taken on the required PFDavg.
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

import LopaSilStudio from '@/pages/apps/LopaSilStudio';
import LopaSilStudioHelpGuide, { LOPA_GUIDE_SECTIONS } from '@/pages/apps/LopaSilStudioHelpGuide';

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

const mount = () => render(<MemoryRouter><LopaSilStudio /></MemoryRouter>);
const openTab = async (name) => fireEvent.mouseDown(await screen.findByRole('tab', { name }));

describe('the page', () => {
  it('mounts with the saved-study selector, a help link and the scope limits', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /LOPA & SIL Studio/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toHaveAttribute('href', '/dashboard/apps/process-safety/lopa-sil-studio/help');
    const scope = screen.getAllByTestId('scope-notice')[0];
    expect(scope).toHaveTextContent(/no architectural constraint check/i);
    expect(scope).toHaveTextContent(/no high demand or continuous mode \(PFH\)/i);
  });

  it('lists studies for the organization only', async () => {
    mount();
    await screen.findByRole('heading', { level: 1 });
    expect(mockFrom).toHaveBeenCalledWith('ps_lopa_studies');
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });
});

describe('the LOPA worksheet', () => {
  it('prints the outcome state exactly as the engine names it, with the numbers behind it', async () => {
    mount();
    expect(await screen.findByTestId('lopa-outcome')).toHaveTextContent(/^SIL1$/);
    expect(screen.getByTestId('f-without-sif')).toHaveTextContent('5.00e-4');
    expect(screen.getByTestId('required-rrf')).toHaveTextContent(/^50$/);
    expect(screen.getByTestId('required-pfd')).toHaveTextContent(/^0\.02$/);
    expect(screen.getByTestId('meets-tmel')).toHaveTextContent('Yes');
  });

  it('shows a layer that is not credited with the engine reason', async () => {
    mount();
    const reason = await screen.findByTestId('not-credited-reason');
    expect(reason).toHaveTextContent('not flagged independent (independent must be true to take credit)');
  });

  it('moves to BEYOND_SIL3_REDESIGN when the TMEL is tightened far enough', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('tmel-input'), { target: { value: '1e-9' } });
    expect(screen.getByTestId('lopa-outcome')).toHaveTextContent('BEYOND_SIL3_REDESIGN');
  });

  it('shows NO_SIF_REQUIRED when the credited layers already meet the TMEL', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('tmel-input'), { target: { value: '1e-3' } });
    expect(screen.getByTestId('lopa-outcome')).toHaveTextContent('NO_SIF_REQUIRED');
  });

  it('shows RISK_REDUCTION_BELOW_SIL1 between RRF 1 and 10', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('tmel-input'), { target: { value: '1e-4' } });
    expect(screen.getByTestId('lopa-outcome')).toHaveTextContent('RISK_REDUCTION_BELOW_SIL1');
  });

  it('refuses a blank IEF and names the field, rather than reading it as zero', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('ief-input'), { target: { value: '' } });
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('initiatingEventFrequencyPerYr');
    expect(screen.queryByTestId('lopa-outcome')).not.toBeInTheDocument();
  });
});

describe('SIF verification', () => {
  it('gives PFDavg per subsystem, the SIF total, and the verdict against the scenario', async () => {
    mount();
    await openTab(/SIF verification/i);
    expect(await screen.findByTestId('sif-pfd')).toBeInTheDocument();
    expect(screen.getByTestId('pfd-sensor')).toBeInTheDocument();
    expect(screen.getByTestId('pfd-logic')).toBeInTheDocument();
    expect(screen.getByTestId('pfd-final')).toBeInTheDocument();
    expect(screen.getByTestId('sif-sil')).toHaveTextContent('SIL 2');
    const verdict = screen.getByTestId('sif-verdict');
    expect(verdict).toHaveTextContent(/Required SIL 1: met/);
    expect(verdict).toHaveTextContent(/Required PFDavg 0\.02: met/);
    expect(verdict).toHaveTextContent(/TMEL 1.00e-5 per year: met/);
  });

  it('prints the engine basis and formula for a subsystem', async () => {
    mount();
    await openTab(/SIF verification/i);
    const card = await screen.findByTestId('subsystem-sensor');
    expect(within(card).getByText(/IEC 61508-6:2010 Annex B\.3\.2\.2/)).toBeInTheDocument();
    expect(within(card).getByText(/PFD = 2\(\(1-bD\) lDD \+ \(1-b\) lDU\)\^2 tCE tGE/)).toBeInTheDocument();
  });

  it('refuses a redundant architecture without a beta, naming the field', async () => {
    mount();
    await openTab(/SIF verification/i);
    const card = await screen.findByTestId('subsystem-sensor');
    fireEvent.change(within(card).getByLabelText('beta (DU common cause) (fraction)'), { target: { value: '' } });
    expect(within(card).getByRole('alert')).toHaveTextContent(/^beta: is required for a redundant 1oo2/);
  });

  it('shows the lambda x T warning from the engine', async () => {
    mount();
    await openTab(/SIF verification/i);
    const card = await screen.findByTestId('subsystem-final');
    fireEvent.change(within(card).getByLabelText('Proof test interval T1 (h)'), { target: { value: '87600' } });
    expect(within(card).getByText(/exceeds 0\.1: the linearised \(rare-event\) equations overstate PFDavg/)).toBeInTheDocument();
  });
});

describe('proof test interval', () => {
  it('tabulates the sensitivity and finds the longest interval with the engine state', async () => {
    mount();
    await openTab(/Proof test interval/i);
    expect(await screen.findByTestId('sensitivity-chart')).toBeInTheDocument();
    const rows = within(screen.getByTestId('sensitivity-table')).getAllByRole('row');
    expect(rows).toHaveLength(10); // header + nine default intervals
    expect(screen.getByTestId('interval-state')).toHaveTextContent('FOUND');
    expect(screen.getByTestId('interval-hours')).toHaveTextContent(/h \(/);
  });

  it('reports UNACHIEVABLE for a typed target below the interval independent floor', async () => {
    mount();
    await openTab(/Proof test interval/i);
    fireEvent.change(await screen.findByLabelText('Subsystem to vary'), {
      target: { value: screen.getAllByRole('option').find((o) => /Pressure transmitters/.test(o.textContent)).value },
    });
    fireEvent.click(screen.getByLabelText(/A target PFDavg I type/));
    fireEvent.change(screen.getByLabelText('Target PFDavg (-)'), { target: { value: '1e-7' } });
    expect(screen.getByTestId('interval-state')).toHaveTextContent('UNACHIEVABLE');
  });
});

describe('the help guide', () => {
  it('renders every section it lists and cites the Annex B form and the decade convention', () => {
    const { container } = render(<MemoryRouter><LopaSilStudioHelpGuide /></MemoryRouter>);
    LOPA_GUIDE_SECTIONS.forEach((s) => expect(container.querySelector(`#section-${s.id}`)).not.toBeNull());
    expect(container).toHaveTextContent(/IEC 61508-6:2010 Annex B\.3\.2\.2/);
    expect(container).toHaveTextContent(/An exact decade falls in the lower SIL band/);
    expect(container).toHaveTextContent(/no high demand or continuous mode/i);
  });
});

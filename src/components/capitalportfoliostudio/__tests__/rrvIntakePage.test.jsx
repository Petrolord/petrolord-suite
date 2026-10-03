/**
 * U2-009 on the Capital Portfolio Studio page (jsdom, on the in-memory
 * Supabase double the /dev harness uses): a valuation sent by link opens the
 * project form filled and labelled; the project saves with no risk score and
 * no spread; after a reload the page reads the valuation again by id and
 * says "source changed since" with Refresh; a value typed over is marked.
 * And a saved portfolio of existing projects shows what main computed.
 */
import React from 'react';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, waitFor, within, configure, cleanup,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InMemorySupabase, { createStore, DEV_USER } from '@/dev/InMemorySupabase';
import { savedValuationRow, colleagueSharedRow, ekeneNorthValuation } from '@/pages/apps/riskedreserves/services/rrvPortfolioFixtures';
import { buildRrvPortfolioCandidate } from '@/pages/apps/riskedreserves/services/rrvPortfolioCandidate';
import { setInput } from '@/pages/apps/riskedreserves/services/rrvStore';
import { installDomShims } from '@/design/testing/themeAssertions';
import FIXTURE from './__fixtures__/existingPortfolio.json';
import GOLDEN from './__fixtures__/existingPortfolio.results.json';

configure({ asyncUtilTimeout: 20000 });

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args) => mockToast(...args),
}));
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: () => { throw new Error('the real client is not used here'); },
    rpc: async () => ({ data: null, error: null }),
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
  },
}));
// one auth object, as the real provider keeps (a new user object on every
// render would refetch the inventory on every render)
const mockAuth = { user: { id: 'dev-user' }, session: null, loading: false };
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => mockAuth,
}));
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});

// eslint-disable-next-line import/first
import CapitalPortfolioStudio from '@/pages/apps/CapitalPortfolioStudio';

beforeAll(() => {
  installDomShims();
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => mockToast.mockClear());

const money = (v) => `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)} MM`;
const candidate = (row = savedValuationRow()) => buildRrvPortfolioCandidate({ row, userId: DEV_USER.id }).contract;

const store = (o = {}) => createStore({
  portfolios: [{ id: 'pf-1', user_id: DEV_USER.id, name: 'Exploration 2027', capex_limit: 100, created_at: '2026-10-01T00:00:00.000Z' }],
  portfolio_projects: [],
  epe_mc_runs: [],
  rrv_valuations: [savedValuationRow({ userId: DEV_USER.id }), colleagueSharedRow()],
  ...o,
});
const mount = (db, path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <InMemorySupabase db={db}><CapitalPortfolioStudio /></InMemorySupabase>
  </MemoryRouter>,
);
const openPortfolio = async (name) => fireEvent.click(await screen.findByText(name));

describe('U2-009: the intake of a Risked Reserves valuation', () => {
  test('sent by link: the form opens filled, labelled as a mean, with no risk score, and saves the project', async () => {
    const c = candidate();
    const db = store();
    mount(db, '/?rrvValuation=valuation-1');
    const intakeCard = await screen.findByTestId('cp-rrv-intake');
    expect(screen.getByTestId('cp-rrv-note')).toHaveTextContent('Risked Reserves Valuation sent "Ekene North"');
    expect(intakeCard).toHaveTextContent(/Success-case mean value.*a mean of the success case \(a discovery\), after the exploration well; it is neither a median nor a P50/);
    expect(intakeCard).toHaveTextContent(/Development cost \(information\)/);
    expect(intakeCard).toHaveTextContent(`Valuation"Ekene North" (id valuation-1)`);
    expect(screen.getByLabelText('Success-case mean value ($MM)')).toHaveValue(c.successMeanValueMM);
    expect(screen.getByTestId('cp-rrv-npv-note')).toHaveTextContent('neither a median nor a P50');
    expect(screen.getByLabelText('CAPEX: the well cost ($MM)')).toHaveValue(25);
    expect(screen.getByLabelText('Value of the success-case P90 size ($MM)')).toHaveValue(c.p90SizeValueMM);
    expect(screen.getByLabelText('Value of the success-case P10 size ($MM)')).toHaveValue(c.p10SizeValueMM);
    expect(intakeCard).toHaveTextContent('values of two sizes, so percentiles of value would differ');
    expect(screen.queryByLabelText('NPV P90 ($MM)')).toBeNull();
    const risk = screen.getByTestId('cp-rrv-risk-score');
    expect(risk).toHaveTextContent('not provided by Risked Reserves Valuation');
    expect(risk).toHaveTextContent('Chance of success Pg 32.0%');
    expect(screen.queryByLabelText('Risk Score (1-10)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(db.portfolio_projects).toHaveLength(1));
    const row = db.portfolio_projects[0];
    expect(row).toMatchObject({
      name: 'Ekene North', capex: 25, risk_score: null, npv_p90: c.p90SizeValueMM, npv_p10: c.p10SizeValueMM, npv_stddev: null,
      fail_cost: 25, source_type: 'rrv', source_ref: 'valuation-1', user_id: DEV_USER.id,
    });
    expect(row.pos).toBeCloseTo(0.32, 12);
    expect(row.npv_p50).toBeCloseTo(c.successMeanValueMM, 9);

    await openPortfolio('Exploration 2027');
    const notes = await screen.findByTestId('cp-rrv-row-Ekene North');
    expect(notes).toHaveTextContent('RRV');
    expect(notes).toHaveTextContent('Pg 32.0%, risk score not provided');
    expect(screen.getByTestId('cp-mean-Ekene North')).toHaveTextContent('success-case mean');
    expect(screen.getByTestId('cp-rrv-footnote')).toHaveTextContent('they have no risk score');
    await waitFor(() => expect(notes).toHaveAttribute('data-state', 'current'));
    // the inventory's risked EMV is the valuation's EMV
    const cells = within(notes.closest('tr')).getAllByRole('cell');
    expect(cells[cells.length - 2]).toHaveTextContent(money(c.emvMM));
  });

  test('after a reload: the valuation is read again by id; source changed since, Refresh; a value typed over is marked', async () => {
    const db = store();
    mount(db, '/?rrvValuation=valuation-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(db.portfolio_projects).toHaveLength(1));
    cleanup();

    // in Risked Reserves Valuation the well cost moves to 30
    db.rrv_valuations[0] = savedValuationRow({ userId: DEV_USER.id, valuation: setInput(ekeneNorthValuation(), 'wellCost', 30), updatedAt: '2026-10-04T09:00:00.000Z' });
    mount(db);
    await openPortfolio('Exploration 2027');
    const state = await screen.findByTestId('cp-rrv-state-Ekene North');
    expect(state).toHaveTextContent(/Source changed since: .*well cost 25\.000 to 30\.000/);
    fireEvent.click(screen.getByTestId('cp-rrv-refresh-Ekene North'));
    await waitFor(() => expect(db.portfolio_projects[0].capex).toBe(30));
    const c2 = candidate(db.rrv_valuations[0]);
    expect(db.portfolio_projects[0].npv_p50).toBeCloseTo(c2.successMeanValueMM, 9);
    await waitFor(() => expect(screen.getByTestId('cp-rrv-row-Ekene North')).toHaveAttribute('data-state', 'current'));
    expect(screen.queryByTestId('cp-rrv-state-Ekene North')).toBeNull();
    cleanup();

    // the portfolio team types its own CAPEX over the received one
    db.portfolio_projects[0] = { ...db.portfolio_projects[0], capex: 45 };
    mount(db);
    await openPortfolio('Exploration 2027');
    expect(await screen.findByTestId('cp-rrv-edited-Ekene North')).toHaveTextContent('Edited after intake: CAPEX (well cost)');
    // and the form says what was received
    fireEvent.click(within(screen.getByTestId('cp-rrv-row-Ekene North').closest('tr')).getByTitle('Edit project'));
    expect(await screen.findByTestId('cp-rrv-edited-capex')).toHaveTextContent('edited after intake (received 30.00 $MM)');
    expect(screen.queryByTestId('cp-rrv-edited-pos')).toBeNull();
  });

  test('a colleague\'s shared valuation comes in as read-only provenance; the picker lists own and shared', async () => {
    const db = store();
    mount(db, '/?rrvValuation=valuation-shared');
    const card = await screen.findByTestId('cp-rrv-intake');
    expect(card).toHaveTextContent('a colleague\'s valuation shared with you: read-only provenance');
    expect(card).toHaveTextContent('"Ada Deep (shared)" (id valuation-shared)');
    // unlink, then the picker
    fireEvent.click(screen.getByLabelText('Unlink and edit manually'));
    fireEvent.click(screen.getByTestId('cp-rrv-pick'));
    const list = await screen.findByTestId('cp-rrv-list');
    // the list says it is reading first; the options follow
    expect(await within(list).findByTestId('cp-rrv-option-Ekene North')).toHaveTextContent(/Pg 32\.0%, EMV .* success-case mean .* well 25\.0 \$MM/);
    expect(within(list).getByTestId('cp-rrv-option-Ada Deep (shared)')).toHaveTextContent('Ada Deep (shared) (shared with you)');
    fireEvent.click(within(list).getByTestId('cp-rrv-option-Ekene North'));
    expect(await screen.findByTestId('cp-rrv-intake')).toHaveTextContent('"Ekene North" (id valuation-1)');
  });

  test('a link to a valuation that is gone says so and opens nothing', async () => {
    mount(store(), '/?rrvValuation=valuation-gone');
    expect(await screen.findByTestId('cp-rrv-note')).toHaveTextContent('was not found on your account, or is no longer shared with you');
    expect(screen.queryByTestId('cp-rrv-intake')).toBeNull();
  });
});

describe('existing projects open and compute exactly as before', () => {
  test('the saved portfolio: the inventory EMVs and the optimal portfolio are main\'s', async () => {
    const db = store({ portfolios: FIXTURE.portfolios.map((p) => ({ ...p, user_id: DEV_USER.id })), portfolio_projects: FIXTURE.projects.map((p) => ({ ...p, user_id: DEV_USER.id })) });
    mount(db);
    await openPortfolio('Stretch');
    for (const p of FIXTURE.projects) {
      const tr = (await screen.findByText(p.name)).closest('tr');
      // the last money cell of the row is the risked EMV
      const cells = within(tr).getAllByRole('cell');
      expect(cells[cells.length - 2]).toHaveTextContent(money(GOLDEN.emv[p.id]));
    }
    expect(screen.queryByTestId('cp-rrv-footnote')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Run Optimization/ }));
    const g = GOLDEN['pf-stretch@0'];
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Optimization Complete!' })));
    await screen.findByText('Optimal Portfolio');
    const funded = screen.getByText('Funded Projects').parentElement;
    for (const p of g.optimalProjects) expect(within(funded).getByText(p.name)).toBeInTheDocument();
    expect(within(funded).getAllByRole('row')).toHaveLength(g.optimalProjects.length + 1);
    expect(screen.getAllByText(money(g.totalEmv)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('metric-note')).toBeNull();
  });

  test('a typed project still asks for its risk score', async () => {
    mount(store());
    await openPortfolio('Exploration 2027');
    fireEvent.click(screen.getByRole('button', { name: /Add Project/ }));
    expect(await screen.findByLabelText('Risk Score (1-10)')).toHaveValue(5);
    expect(screen.getByLabelText('NPV P50 ($MM)')).toBeEnabled();
    expect(screen.queryByTestId('cp-rrv-intake')).toBeNull();
  });
});

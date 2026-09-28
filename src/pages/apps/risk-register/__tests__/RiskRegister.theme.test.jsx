/**
 * Design system rollout W4E: the Risk Register opts in to the Petrolord
 * theme. Its shell (rendered by all four routes: the tabbed register, New,
 * Edit and the risk page) carries the scope. The app mounts on its real
 * hooks over the in-memory database and runs the shared four checks (opens
 * light, the header toggle goes to dark and back and stores the choice, no
 * legacy console colour outside data-canvas regions with a negative
 * control, the route is registered for the themed cold-load loaders).
 * Every tab and route is then checked in light and dark, with the snapshot
 * dialog, a generated report (chart on white paper) and the report builder.
 * The heatmap bands keep a distinct status fill each, with the count in
 * the cell and the band word in the legend.
 */
import React from 'react';
import {
  render, screen, fireEvent, waitFor, within, cleanup,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, installDomShims, expectThemedPath, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import { makeFakeSupabase } from '../../assurance/shared/__tests__/fakeSupabase';
import RiskRegister from '../../RiskRegister';
import NewRiskPage from '../NewRiskPage';
import EditRiskPage from '../EditRiskPage';
import RiskDetailPage from '../RiskDetailPage';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => {
      const builder = mockDb.client.from(...args);
      // The in-memory builder has no .or(); the link reads use it.
      builder.or = () => builder;
      return builder;
    },
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

const ORG = 'org-1';
const BASE = '/dashboard/apps/assurance/risk-register';
const risk = (id, code, status, likelihood, impact, extra = {}) => ({
  id, org_id: ORG, risk_id: code, title: `Risk ${code}`, category: 'Operational', status,
  likelihood, impact, risk_score: likelihood * impact, created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z', target_score: 6, ...extra,
});
const seed = () => ({
  risk_register: [
    risk('r1', 'RSK-2026-001', 'Open', 5, 4, { residual_likelihood: 3, residual_impact: 2, next_review_date: '2026-01-01' }),
    risk('r2', 'RSK-2026-002', 'Under Review', 3, 4),
    risk('r3', 'RSK-2026-003', 'Mitigated', 2, 3),
    risk('r4', 'RSK-2026-004', 'Realized', 1, 2),
    risk('r5', 'RSK-2026-005', 'Draft', 1, 1),
  ],
  risk_tags: [{ id: 't1', risk_id: 'r1', tag: 'Drilling' }],
  risk_links: [],
  risk_register_snapshots: [
    { id: 's1', org_id: ORG, name: 'Q3 board pack', created_at: '2026-09-01T10:00:00Z', snapshot_data: { risk_count: 5 } },
  ],
  saved_reports: [],
});

beforeAll(installDomShims);
beforeEach(() => {
  mockDb = makeFakeSupabase(seed());
  try { window.localStorage.clear(); } catch { /* storage unavailable */ }
});

const renderAt = (entry) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path={BASE} element={<RiskRegister />} />
      <Route path={`${BASE}/new`} element={<NewRiskPage />} />
      <Route path={`${BASE}/:id/edit`} element={<EditRiskPage />} />
      <Route path={`${BASE}/:id`} element={<RiskDetailPage />} />
    </Routes>
  </MemoryRouter>,
);

const loaded = async (text = /RSK-2026-001/) => {
  await screen.findByTestId('theme-toggle', {}, { timeout: 4000 });
  if (text) await screen.findAllByText(text, {}, { timeout: 4000 });
};

describeAppTheme({
  name: 'Risk Register',
  route: BASE,
  renderApp: () => renderAt(`${BASE}?tab=dashboard`),
  ready: () => loaded(),
  scopeTestId: 'risk-theme-scope',
});

const VIEWS = [
  ['?tab=dashboard', /RSK-2026-001/],
  ['?tab=register', /RSK-2026-001/],
  ['?tab=heatmap', 'Corporate Risk Heatmap'],
  ['?tab=reports', 'Risk Analytics & Reports'],
  ['?tab=advanced-reports', 'Advanced Report Builder'],
  ['/new', 'Log New Risk'],
  ['/r1', 'Risk RSK-2026-001'],
  ['/r1/edit', 'Edit RSK-2026-001'],
];

const walk = async (theme) => {
  for (const [sub, text] of VIEWS) {
    window.localStorage.clear();
    if (theme === 'dark') window.localStorage.setItem(themeStorageKey(null), 'dark');
    renderAt(`${BASE}${sub}`);
    await loaded(text);
    expect({ sub, theme: getScopeRoot('risk-theme-scope').getAttribute('data-pl-theme') }).toEqual({ sub, theme });
    expectNoLegacyChrome();
    cleanup();
  }
};

describe('Risk Register themed views', () => {
  it('every tab and route reads in light with no legacy chrome', async () => {
    await walk('light');
  });

  it('every tab and route reads in dark with no legacy chrome', async () => {
    await walk('dark');
  });

  it('the snapshot dialog opens inside the theme with no legacy chrome', async () => {
    renderAt(`${BASE}?tab=dashboard`);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /save snapshot/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    await within(dialog).findByText('Q3 board pack');
    expectNoLegacyChrome();
  });

  it('a generated report keeps its chart on white paper and its chrome on roles', async () => {
    renderAt(`${BASE}?tab=reports`);
    await loaded('Risk Analytics & Reports');
    fireEvent.click(screen.getAllByRole('button', { name: /generate/i })[0]);
    await screen.findByTitle('Print');
    expectNoLegacyChrome();
    const chartToggle = screen.queryByRole('button', { name: /chart/i });
    if (chartToggle) {
      fireEvent.click(chartToggle);
      await waitFor(() => expect(document.querySelector('[data-canvas="chart"]')).not.toBeNull());
      expectNoLegacyChrome();
    }
  });

  it('the heatmap gives each band its own status fill, with the count in the cell and the band word in the legend', async () => {
    renderAt(`${BASE}?tab=heatmap`);
    await loaded('Corporate Risk Heatmap');
    const legend = screen.getByTestId('risk-band-legend');
    ['Critical', 'High', 'Medium', 'Low'].forEach((band) => expect(legend).toHaveTextContent(band));
    const swatches = [...legend.querySelectorAll('.w-3.h-3')].map((d) => d.className.split(' ').find((c) => c.startsWith('bg-pl-')));
    expect(swatches).toHaveLength(4);
    expect(new Set(swatches).size).toBe(4);
    // 5 x 4 = 20 is Critical, on the solid danger fill, labelled with its band and score.
    const cell = screen.getByRole('button', { name: /Likelihood 5, impact 4: Critical, score 20, 1 risk$/ });
    expect(cell).toHaveTextContent('1');
    expect(cell.className).toMatch(/\bbg-pl-danger\b/);
    expectNoLegacyChrome();
  });

  it('the score badge carries the band word and a status fill', async () => {
    renderAt(`${BASE}?tab=register`);
    await loaded();
    const badge = screen.getByText('20 - Critical');
    expect(badge.className).toMatch(/\bbg-pl-danger\b/);
  });

  it('registers every route for the cold-load loaders', () => {
    ['', '/new', '/r1', '/r1/edit'].forEach((sub) => expectThemedPath(`${BASE}${sub}`));
  });
});

/**
 * Design system rollout, Project Management Pro, session 6C of 3 (6C, 6D,
 * 6E). The app wraps itself in <ThemedApp> (see ProjectManagementPro.jsx),
 * so the whole app is in the scope from 6C on. 6C moved the page shell and
 * the top-level components/projectmanagement/*.jsx files to theme roles;
 * the subfolders are converted in 6D and 6E.
 *
 * 6D (session 2) converted analytics/, reports/, appraisal/, brownfield/ and
 * decommissioning/: the portfolio analytics tab, the report builder, the
 * three stage-type dashboards and their wizards now have strict checks, and
 * the wizards no longer carry 6C's interim dark island.
 *
 * Two kinds of check:
 *   - STRICT (no allow-list): the views built only from 6C files (portfolio
 *     projects tab, the default project dashboard and every one of its tabs
 *     apart from Integrations, the project panel and its dialogs) carry no
 *     legacy console colour outside data-canvas regions.
 *   - PENDING: views that still render files 6D or 6E will convert (the
 *     portfolio analytics tab, a stage-type project dashboard, the
 *     integration panels) pass with an allow-list built from exactly those
 *     files' own legacy tokens.
 *
 * 6E (session 3) converted exploration/, field_development/, help/,
 * integrations/ and smallprojects/: PENDING_6E is empty and the 6E views
 * (integrations tab, exploration dashboard, help centre, the wizards, the
 * field development and small project dashboards) are strict below.
 *
 * With 6D and 6E done both pending lists are empty, so the allow-list is
 * empty and every check in this file is strict; the pending views were
 * folded into the 6D and 6E strict blocks.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => {
  const PROJECTS = [
    {
      id: 'p1', name: 'Ekene Gas Plant Upgrade', company_name: 'Lordsway', stage: 'FEED', baseline_budget: 12000000,
      project_type: 'Other', status: 'Green', country: 'Nigeria', asset: 'Ekene', percent_complete: 40, start_date: '2026-01-01', user_id: 'u1',
    },
    {
      id: 'p2', name: 'Ekene North Exploration', company_name: 'Lordsway', stage: 'Prospecting', baseline_budget: 5000000,
      project_type: 'Exploration', status: 'Amber', country: 'Nigeria', asset: 'Ekene North', percent_complete: 10, start_date: '2026-02-01', user_id: 'u1',
    },
    // 6D: one project per stage-type dashboard 6D converted.
    {
      id: 'p3', name: 'Ekene West Appraisal', company_name: 'Lordsway', stage: 'Appraisal Planning', baseline_budget: 8000000,
      project_type: 'Appraisal', status: 'Green', country: 'Nigeria', asset: 'Ekene West', percent_complete: 20, start_date: '2026-03-01', user_id: 'u1',
    },
    {
      id: 'p4', name: 'Ekene Platform Revamp', company_name: 'Lordsway', stage: 'Opportunity Identification', baseline_budget: 6000000,
      project_type: 'Brownfield Development', status: 'Green', country: 'Nigeria', asset: 'Ekene', percent_complete: 5, start_date: '2026-04-01', user_id: 'u1',
    },
    {
      id: 'p5', name: 'Ekene South Decommissioning', company_name: 'Lordsway', stage: 'Planning', baseline_budget: 9000000,
      project_type: 'Decommissioning', status: 'Green', country: 'Nigeria', asset: 'Ekene South', percent_complete: 0, start_date: '2026-05-01', user_id: 'u1',
    },
  ];
  const rows = {
    projects: PROJECTS,
    tasks: [
      { id: 't1', project_id: 'p1', name: 'Compressor skid FEED', type: 'task', status: 'In Progress', priority: 'High', percent_complete: 50, planned_start_date: '2026-01-05', planned_end_date: '2026-12-20', planned_cost: 100000, actual_cost: 60000, owner: 'Ada', task_category: 'FEED', display_order: 1 },
      { id: 't2', project_id: 'p1', name: 'FEED gate', type: 'milestone', status: 'To Do', priority: 'Critical', percent_complete: 0, planned_start_date: '2026-12-30', planned_end_date: '2026-12-31', planned_cost: 0, display_order: 2 },
    ],
    pm_resources: [
      { id: 'r1', project_id: 'p1', name: 'Ada Obi', discipline: 'Process', type: 'Internal', availability_percent: 90, cost_per_day: 900, skills: ['HYSYS'] },
      // 6D: a team member and a risk on each stage-type project, so their lists render.
      ...['p3', 'p4', 'p5'].map((pid) => ({ id: `r-${pid}`, project_id: pid, name: 'Chidi Eze', discipline: 'Reservoir', type: 'Internal', availability_percent: 80, cost_per_day: 800, skills: [] })),
    ],
    pm_resource_assignments: [],
    risks: [
      { id: 'k1', project_id: 'p1', title: 'Long-lead compressor', category: 'Commercial', probability: 4, impact: 4, risk_score: 16, status: 'Open', owner: 'Ada' },
      ...['p3', 'p4', 'p5'].map((pid) => ({ id: `k-${pid}`, project_id: pid, title: 'Rig slot slips', category: 'Schedule', probability: 3, impact: 3, risk_score: 9, status: 'Open', owner: 'Chidi' })),
    ],
    project_issues: [{ id: 'i1', project_id: 'p1', title: 'Vendor data late', owner: 'Ada', status: 'Open', reported_date: '2026-03-01' }],
    pm_deliverables: [],
    project_updates: [{ id: 'u1', project_id: 'p1', report_date: '2026-03-01', status: 'Amber', percent_complete: 40, narrative: 'On track for FEED gate', spi: 0.95, cpi: 1.02 }],
    pm_integration_logs: [],
  };
  const makeQuery = (table) => {
    const q = {};
    const filters = [];
    const chain = () => q;
    ['select', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'in', 'gte', 'lte', 'neq']
      .forEach((m) => { q[m] = jest.fn(chain); });
    q.eq = jest.fn((col, val) => { filters.push([col, val]); return q; });
    const result = () => (rows[table] || []).filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
    q.single = jest.fn(() => Promise.resolve({ data: result()[0] || null, error: null }));
    q.maybeSingle = q.single;
    q.then = (resolve, reject) => Promise.resolve({ data: result(), error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn((table) => makeQuery(table)),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims, hasLegacyChrome,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import ProjectManagementPro from '@/pages/apps/ProjectManagementPro';
import { ThemedApp } from '@/design/ThemeProvider';
import FieldDevelopmentProjectDashboard from '@/components/projectmanagement/field_development/FieldDevelopmentProjectDashboard';
import { WorkoverProjectDashboard } from '@/components/projectmanagement/smallprojects/SmallProjectDashboards';
import { WorkoverProjectWizard } from '@/components/projectmanagement/smallprojects/SmallProjectWizards';

// Files still to convert (paths under src/components/projectmanagement).
// 6D and 6E: remove your files from these lists as you convert them.
const PENDING_6D = [];
// 6E converted its files (exploration, field_development, help,
// integrations, smallprojects); their views are checked strictly below.
const PENDING_6E = [];

// The allow-list: every legacy class token written in a pending file, and
// nothing else, so a legacy token that only a converted file uses still fails.
const PM_DIR = path.join(__dirname, '../../../components/projectmanagement');
const pendingTokens = () => {
  const tokens = new Set();
  [...PENDING_6D, ...PENDING_6E].forEach((f) => {
    const src = fs.readFileSync(path.join(PM_DIR, f), 'utf8');
    (src.match(/[A-Za-z0-9:_\-[\]/#.%]+/g) || []).forEach((t) => { if (hasLegacyChrome(t)) tokens.add(t); });
  });
  return [...tokens];
};
const PENDING_ALLOW = pendingTokens();

const USER = { id: 'u1', email: 'tester@example.com' };
const renderApp = () => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ user: USER, session: null, loading: false }}>
      <ProjectManagementPro />
    </AuthContext.Provider>
  </MemoryRouter>,
);
const ready = () => screen.findByRole('heading', { name: 'Ekene Gas Plant Upgrade' });
const SCOPE = 'pmp-theme-scope';

// The project views mount a Gantt, several recharts and dialogs; allow time
// when the suite runs beside others.
jest.setTimeout(30000);

describeAppTheme({
  name: 'Project Management Pro',
  route: '/dashboard/apps/economics/project-management-pro',
  renderApp,
  ready,
  scopeTestId: SCOPE,
  userId: 'u1',
  // Only the 6D/6E files' own tokens (see the header); empty after 6E. The
  // two tokens the shared negative control plants are left out, so the
  // control still proves the detector (the portfolio opening view renders
  // no pending file, so it needs neither).
  allow: PENDING_ALLOW.filter((t) => t !== 'bg-slate-900' && t !== 'text-white'),
});

const tab = (name) => {
  const t = screen.getByRole('tab', { name: new RegExp(name) });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
};

const openProject = async (id, heading) => {
  fireEvent.change(screen.getByLabelText('Select Project'), { target: { value: id } });
  expect(await screen.findByText(heading)).toBeInTheDocument();
};

// gantt-task-react measures its svg; jsdom has no SVG geometry.
const installSvgShims = () => {
  const proto = window.SVGSVGElement && window.SVGSVGElement.prototype;
  if (proto && !proto.createSVGPoint) {
    proto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return this; } });
    proto.getScreenCTM = () => ({ inverse() { return this; } });
  }
  const el = window.SVGElement && window.SVGElement.prototype;
  if (el && !el.getBBox) el.getBBox = () => ({ x: 0, y: 0, width: 40, height: 12 });
};

describe('Project Management Pro theme, 6C views (strict)', () => {
  beforeAll(() => { installDomShims(); installSvgShims(); });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the portfolio projects tab (grid and list) and the filter popover carry no legacy colour, light and dark', async () => {
    renderApp();
    await ready();
    expect(screen.getByText('Portfolio Overview')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /List/ }));
    expect(screen.getByText('Project Name')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(await screen.findByText('Filter Portfolio')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot(SCOPE)).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('every tab of the default project dashboard is themed; charts sit on white chart canvases', async () => {
    renderApp();
    await ready();
    await openProject('p1', 'Compressor skid FEED');
    expectNoLegacyChrome();

    tab('Kanban');
    expect(await screen.findByText('In Progress')).toBeInTheDocument();
    expectNoLegacyChrome();

    tab('Gantt');
    expect(await screen.findByText('Past planned end')).toBeInTheDocument();
    expect(getScopeRoot(SCOPE).querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    tab('Resources');
    expect(await screen.findByText('Ada Obi')).toBeInTheDocument();
    expectNoLegacyChrome();

    tab('Progress');
    expect(await screen.findByText('Update History')).toBeInTheDocument();
    expectNoLegacyChrome();

    tab('Risks');
    expect(await screen.findByText('Risks & Issues Management')).toBeInTheDocument();
    expectNoLegacyChrome();

    tab('Report');
    expect(await screen.findByText('Project Weekly Status Report')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot(SCOPE)).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the task, risk and progress dialogs opened from the project panel are themed', async () => {
    renderApp();
    await ready();
    await openProject('p1', 'Compressor skid FEED');

    fireEvent.click(screen.getByRole('button', { name: /Add Task/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Risk$/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Update$/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expectNoLegacyChrome();
  });
});

describe('Project Management Pro theme, 6D views (strict)', () => {
  beforeAll(() => { installDomShims(); installSvgShims(); });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const walkTabs = async (names) => {
    for (const name of names) {
      tab(name);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  };

  it('the portfolio analytics tab, each of its views and the report builder carry no legacy colour, light and dark', async () => {
    renderApp();
    await ready();
    tab('Analytics');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Analytics/ })).toHaveAttribute('data-state', 'active'));
    expect(await screen.findByText('Portfolio Value')).toBeInTheDocument();
    expect(getScopeRoot(SCOPE).querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
    await walkTabs(['By Type', 'Budget & Cost', 'Risks']);
    expect(await screen.findByText('Critical Risks (Top 5)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Export Report/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();

    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot(SCOPE)).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it.each([
    ['appraisal', 'p3', 'Stage Management', ['Wells', 'Schedule', 'Gates & Stages', 'Deliverables', 'Risks', 'Team', 'Overview']],
    ['brownfield', 'p4', 'Brownfield Stages', ['Tracks & Optimization', 'Schedule', 'Gates', 'Deliverables', 'Risks', 'Team', 'Overview']],
    ['decommissioning', 'p5', 'Decommissioning Stages', ['Operations & Enviro', 'Schedule', 'Gates', 'Deliverables', 'Risks', 'Team', 'Overview']],
  ])('the %s project dashboard and every one of its tabs are themed; the risk chart is on a white canvas', async (_kind, id, heading, tabs) => {
    renderApp();
    await ready();
    fireEvent.change(screen.getByLabelText('Select Project'), { target: { value: id } });
    expect(await screen.findByText(heading)).toBeInTheDocument();
    expect(await screen.findByText('Reservoir')).toBeInTheDocument();
    expect(getScopeRoot(SCOPE).querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
    await walkTabs(tabs.slice(0, -2));
    // The risks tab lists each risk with its score and band word.
    expect(screen.getByText('9 Medium')).toBeInTheDocument();
    await walkTabs(tabs.slice(-2));
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot(SCOPE)).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it.each([
    ['New Appraisal Project'],
    ['New Brownfield Project'],
    ['New Decom Project'],
  ])('the %s wizard follows the theme (no interim dark island) through every step', async (label) => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
    // Step through to the review page; the name is required on step 1.
    fireEvent.change(dialog.querySelector('input[name="name"]'), { target: { value: 'Theme walk' } });
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Next/ }));
      expectNoLegacyChrome();
    }
    expect(screen.getByRole('button', { name: /Create Project/ })).toBeInTheDocument();
  });
});


describe('Project Management Pro theme, 6E views (strict)', () => {
  beforeAll(() => { installDomShims(); installSvgShims(); });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the integrations tab (6E) and an exploration project dashboard (6E) carry no legacy colour, light and dark', async () => {
    renderApp();
    await ready();
    await openProject('p1', 'Compressor skid FEED');
    tab('Integrations');
    expect(await screen.findByText('App Integrations')).toBeInTheDocument();
    expect(screen.getByText('Pore Pressure (PPFG) Integration')).toBeInTheDocument();
    expect(screen.getByText('Project Deliverables')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.change(screen.getByLabelText('Select Project'), { target: { value: 'p2' } });
    await waitFor(() => expect(screen.queryByText('Compressor skid FEED')).not.toBeInTheDocument());
    expect(await screen.findByText('Stage Management')).toBeInTheDocument();
    expect(getScopeRoot(SCOPE).querySelectorAll('[data-canvas="chart"]').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
    for (const name of ['Schedule', 'Gates & Stages', 'Deliverables', 'Risks', 'Team']) {
      tab(name);
      expectNoLegacyChrome();
    }

    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(getScopeRoot(SCOPE)).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  it('the help centre (6E) and the exploration and field development wizards (6E) open in the scope with no legacy colour', async () => {
    renderApp();
    await ready();

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Help Center')).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('data-pl-theme', 'dark');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    for (const name of [/Video Tutorials/, /FAQ/, /Glossary/]) {
      fireEvent.click(within(dialog).getByRole('button', { name }));
      expectNoLegacyChrome();
    }
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    for (const [button, title] of [[/New Exploration Project/, 'New Exploration Project'], [/New Field Dev Project/, 'New Field Development Project']]) {
      fireEvent.click(screen.getByRole('button', { name: button }));
      dialog = await screen.findByRole('dialog');
      expect(within(dialog).getAllByText(new RegExp(title)).length).toBeGreaterThan(0);
      expect(dialog).not.toHaveAttribute('data-pl-theme', 'dark');
      expectNoLegacyChrome();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('the field development and small project dashboards and the small project wizard (6E) carry no legacy colour, light and dark', async () => {
    // The mocked portfolio holds no field development or small project,
    // so these views are mounted on their own inside the app's theme scope.
    const tasks = [
      { id: 't1', name: 'Concept select', type: 'task', status: 'Done', percent_complete: 100, task_category: 'Concept', planned_start_date: '2026-01-05', planned_end_date: '2026-03-01' },
      { id: 't2', name: 'FID', type: 'milestone', status: 'To Do', percent_complete: 0, task_category: 'FEED', planned_start_date: '2026-12-30', planned_end_date: '2026-12-31' },
    ];
    const projectData = {
      id: 'p9', name: 'Ekene Phase 2', asset: 'Ekene', baseline_budget: 90000000, stage: 'Concept',
      tasks, rawTasks: tasks, resources: [{ discipline: 'Process', type: 'Internal', name: 'Ada Obi' }],
      risks: [{ title: 'Long-lead compressor', risk_score: 16, status: 'Open' }, { title: 'Late vendor data', risk_score: 6, status: 'Open' }],
      deliverables: [{ name: 'FEED report', status: 'Under Review', app_source: 'PPFG' }], kpis: { cpi: 0.93 },
    };
    const views = [
      ['Development Stages', <FieldDevelopmentProjectDashboard projectData={projectData} onDataChange={() => {}} />],
      ['KPI targets', <WorkoverProjectDashboard projectData={projectData} onDataChange={() => {}} />],
      ['New Workover Project', <WorkoverProjectWizard open onOpenChange={() => {}} onProjectCreated={() => {}} userId="u1" />],
    ];
    for (const theme of ['light', 'dark']) {
      for (const [text, view] of views) {
        try { window.localStorage.clear(); } catch { /* storage unavailable */ }
        const { unmount } = render(
          <MemoryRouter>
            <AuthContext.Provider value={{ user: USER, session: null, loading: false }}>
              <ThemedApp defaultTheme={theme} data-testid="pmp-6e-scope">{view}</ThemedApp>
            </AuthContext.Provider>
          </MemoryRouter>,
        );
        expect((await screen.findAllByText(new RegExp(text))).length).toBeGreaterThan(0);
        expect(getScopeRoot('pmp-6e-scope')).toHaveAttribute('data-pl-theme', theme);
        expectNoLegacyChrome();
        unmount();
      }
    }
  });
});

describe('Project Management Pro theme, allow-list (empty after 6D and 6E)', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('the allow-list holds only tokens from the pending files', () => {
    // A sanity check on the list itself: it is non-empty while files are
    // pending, and every entry really is a legacy token.
    if (PENDING_6D.length + PENDING_6E.length === 0) expect(PENDING_ALLOW).toEqual([]);
    PENDING_ALLOW.forEach((t) => expect(hasLegacyChrome(t)).toBe(true));
  });
});

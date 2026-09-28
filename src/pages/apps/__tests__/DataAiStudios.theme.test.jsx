/**
 * Design system rollout batch 5F: the five Data & AI studios (Data Quality,
 * ML Workbench, Electrofacies, Production Forecasting ML Workbench, AI
 * Evaluation) opt in to the Petrolord theme. Each page and its help guide
 * wrap themselves in <ThemedApp>. describeAppTheme checks light by default,
 * the toggle round trip, no legacy console colour outside canvases (with a
 * negative control) and the cold-load registration. The tests below walk
 * every tab in light and dark, open the saved-run dialog, run each studio
 * on its test data so the result states (scorecards, fold tables, confusion
 * matrices, forecasts, the helper answer) are checked too, keep the charts
 * white in dark, and open each help guide. No engine number is asserted
 * here; the smoke tests hold those.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { parseLas } from '../../../../packages/engines/engines/welldata/lasParse';
import { prepareLogs } from '../../../../packages/engines/engines/welldata/lasImport';
import { syntheticFacies } from '../../../../packages/engines/tools/validation/dataai/synthetic_wells';
import { ekeneCsv } from '../../../utils/dataAi/__tests__/fixtures/forecast/ekene';

// Two wells registries: the Ekene ML fixtures (nine wells) for the ML
// Workbench and three synthetic facies wells (two cored) for Electrofacies.
const ML_FIX = path.join(__dirname, '../../../utils/dataAi/__tests__/fixtures/ml');
const mockMlRegistry = (() => {
  const wells = []; const logs = {}; const data = {};
  for (let n = 1; n <= 9; n += 1) {
    const id = `well-${n}`;
    wells.push({ id, name: `Ekene-${n}` });
    const prepared = prepareLogs(parseLas(fs.readFileSync(path.join(ML_FIX, `Ekene-${n}-ml.las`), 'utf8')), {});
    logs[id] = prepared.logs.map((l, i) => {
      const lid = `${id}-log-${i}`;
      data[lid] = l.data;
      return {
        id: lid, well_id: id, mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, stop_md_m: l.stopMdM, step_m: l.stepM, n_samples: l.nSamples,
      };
    });
  }
  return { wells, logs, data, intervals: {} };
})();
const mockFaciesRegistry = (() => {
  const N = 120;
  const wells = []; const logs = {}; const data = {}; const intervals = {};
  const { X, facies } = syntheticFacies(3 * N, 4, 7);
  for (let w = 0; w < 3; w += 1) {
    const id = `well-${w + 1}`;
    wells.push({ id, name: `Synth-${w + 1}` });
    const rows = X.slice(w * N, (w + 1) * N);
    const depth = rows.map((_, i) => 1500 + i * 0.5);
    const curves = { DEPT: depth, GR: rows.map((r) => r[0]), RHOB: rows.map((r) => r[1]), NPHI: rows.map((r) => r[2]), PEF: rows.map((r) => r[3]) };
    logs[id] = Object.keys(curves).map((m, i) => {
      const lid = `${id}-log-${i}`;
      data[lid] = curves[m];
      return {
        id: lid, well_id: id, mnemonic: m, unit: '', start_md_m: 1500, stop_md_m: 1500 + (N - 1) * 0.5, step_m: 0.5, n_samples: N,
      };
    });
    intervals[id] = [];
    if (w < 2) {
      const f = facies.slice(w * N, (w + 1) * N);
      let s = 0;
      for (let i = 1; i <= N; i += 1) {
        if (i === N || f[i] !== f[s]) {
          intervals[id].push({ kind: 'facies', top_md_m: depth[s], base_md_m: i === N ? depth[N - 1] + 0.5 : depth[i], code: f[s], label: null });
          s = i;
        }
      }
    }
  }
  return { wells, logs, data, intervals };
})();
let mockRegistry = mockMlRegistry;

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(async () => mockRegistry.wells),
  listLogs: jest.fn(async (id) => mockRegistry.logs[id] || []),
  downloadCurve: jest.fn(async (log) => Float32Array.from(mockRegistry.data[log.id])),
  saveLog: jest.fn(async () => ({ id: 'new-log' })),
}));
jest.mock('@/lib/stratRegistry', () => ({
  listIntervals: jest.fn(async (id) => mockRegistry.intervals[id] || []),
}));
jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(async () => []),
  listPoWells: jest.fn(async () => []),
  getDailyProduction: jest.fn(async () => []),
}));

const mockFrom = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
    storage: { from: () => ({ download: jest.fn() }) },
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
  AuthContext: require('react').createContext(null),
}));

/* eslint-disable import/first */
import DataQualityStudio from '@/pages/apps/DataQualityStudio';
import DataQualityStudioHelpGuide from '@/pages/apps/DataQualityStudioHelpGuide';
import MlWorkbench from '@/pages/apps/MlWorkbench';
import MlWorkbenchHelpGuide from '@/pages/apps/MlWorkbenchHelpGuide';
import ElectrofaciesStudio from '@/pages/apps/ElectrofaciesStudio';
import ElectrofaciesStudioHelpGuide from '@/pages/apps/ElectrofaciesStudioHelpGuide';
import ForecastingMlWorkbench from '@/pages/apps/ForecastingMlWorkbench';
import ForecastingMlWorkbenchHelpGuide from '@/pages/apps/ForecastingMlWorkbenchHelpGuide';
import AiEvaluationStudio from '@/pages/apps/AiEvaluationStudio';
import AiEvaluationStudioHelpGuide from '@/pages/apps/AiEvaluationStudioHelpGuide';
/* eslint-enable import/first */

const chain = () => {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn(() => q),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => q),
    then: (res) => res({ data: [], error: null }),
  };
  return q;
};

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => chain());
  mockInvoke.mockReset();
  mockRegistry = mockMlRegistry;
});

const openTab = async (name) => fireEvent.mouseDown(await screen.findByRole('tab', { name }));
const toDark = (scopeTestId) => {
  fireEvent.click(screen.getByTestId('theme-toggle'));
  expect(getScopeRoot(scopeTestId)).toHaveAttribute('data-pl-theme', 'dark');
};
const expectWhiteCharts = (scopeTestId) => {
  const charts = getScopeRoot(scopeTestId).querySelectorAll('[data-canvas="chart"]');
  expect(charts.length).toBeGreaterThan(0);
  charts.forEach((c) => expect(c).toHaveClass('bg-white'));
};
const fileOf = (text, name) => {
  const f = new File([text], name, { type: 'text/csv' });
  if (!f.text) f.text = () => Promise.resolve(text);
  return f;
};

const APPS = [
  {
    name: 'Data Quality Studio',
    route: '/dashboard/apps/data-ai/data-quality-studio',
    Page: DataQualityStudio,
    Help: DataQualityStudioHelpGuide,
    scopeTestId: 'dataqc-theme-scope',
    helpTestId: 'dataqc-help-theme-scope',
    title: /Data Quality Studio/i,
    tabs: [/QC profile/, /Scorecard and flags/, /Charts/],
  },
  {
    name: 'ML Workbench',
    route: '/dashboard/apps/data-ai/ml-workbench',
    Page: MlWorkbench,
    Help: MlWorkbenchHelpGuide,
    scopeTestId: 'mlwb-theme-scope',
    helpTestId: 'mlwb-help-theme-scope',
    title: /ML Workbench/i,
    tabs: [/^Model$/, /Validation results/, /Leakage and diagnostics/, /Write to a well/],
  },
  {
    name: 'Electrofacies Studio',
    route: '/dashboard/apps/data-ai/electrofacies-studio',
    Page: ElectrofaciesStudio,
    Help: ElectrofaciesStudioHelpGuide,
    scopeTestId: 'facies-theme-scope',
    helpTestId: 'facies-help-theme-scope',
    title: /Electrofacies Studio/i,
    tabs: [/Logs and core/, /PCA/, /Clustering/, /kNN and CART/, /Depth tracks/, /Write to a well/],
  },
  {
    name: 'Production Forecasting ML Workbench',
    route: '/dashboard/apps/data-ai/forecasting-ml-workbench',
    Page: ForecastingMlWorkbench,
    Help: ForecastingMlWorkbenchHelpGuide,
    scopeTestId: 'forecastml-theme-scope',
    helpTestId: 'forecastml-help-theme-scope',
    title: /Production Forecasting ML Workbench/i,
    tabs: [/Fit and forecast/, /Backtest/, /Field comparison/],
  },
  {
    name: 'AI Evaluation Studio',
    route: '/dashboard/apps/data-ai/ai-evaluation-studio',
    Page: AiEvaluationStudio,
    Help: AiEvaluationStudioHelpGuide,
    scopeTestId: 'aieval-theme-scope',
    helpTestId: 'aieval-help-theme-scope',
    title: /AI Evaluation Studio/i,
    tabs: [/Corpus and queries/, /^Retrieval$/, /Retrieval metrics/, /Compare systems/, /Answers and groundedness/, /Extraction scoring/, /Agreement/, /Calibration/],
  },
];

APPS.forEach((app) => {
  const renderApp = () => render(<MemoryRouter><app.Page /></MemoryRouter>);
  const ready = () => screen.findByRole('heading', { level: 1, name: app.title });

  describeAppTheme({
    name: app.name,
    route: app.route,
    renderApp,
    ready,
    scopeTestId: app.scopeTestId,
  });

  describe(`${app.name} themed states`, () => {
    beforeAll(installDomShims);
    beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

    it('every tab reads on roles in light and in dark', async () => {
      renderApp();
      await ready();
      for (const tab of app.tabs) {
        await openTab(tab);
        expectNoLegacyChrome();
      }
      toDark(app.scopeTestId);
      for (const tab of app.tabs) {
        await openTab(tab);
        expectNoLegacyChrome();
      }
    });

    it('the saved-run dialog opens in the scope with no legacy colour, in dark too', async () => {
      renderApp();
      await ready();
      toDark(app.scopeTestId);
      fireEvent.click(screen.getByTitle(/^Create new /));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'dark');
      expectNoLegacyChrome();
    });

    it('the help guide opens light in its own scope with no legacy colour', () => {
      render(<MemoryRouter><app.Help /></MemoryRouter>);
      expect(getScopeRoot(app.helpTestId)).toHaveAttribute('data-pl-theme', 'light');
      expectNoLegacyChrome();
      expectThemedPath(`${app.route}/help`);
    });
  });
});

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describe('Data & AI result states stay on roles, charts stay white', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('Data Quality: an uploaded ledger runs, the scorecard, flags and control charts read in dark', async () => {
    const csv = fs.readFileSync(path.join(__dirname, '../../../utils/dataAi/__tests__/fixtures/ekene-daily-production.csv'), 'utf8');
    render(<MemoryRouter><DataQualityStudio /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    toDark('dataqc-theme-scope');
    fireEvent.click(screen.getByRole('tab', { name: /Upload/ }));
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [fileOf(csv, 'ekene-daily-production.csv')] } });
    await screen.findByTestId('upload-mapping');
    fireEvent.change(screen.getByTestId('filter-value'), { target: { value: 'Ekene-1' } });
    fireEvent.click(screen.getByTestId('use-upload'));
    await screen.findByTestId('dataset-summary');
    fireEvent.click(screen.getByTestId('run-qc'));
    await openTab(/Scorecard and flags/);
    await screen.findByTestId('score-total');
    expect(screen.getAllByTestId('flag-row').length).toBeGreaterThan(0);
    expectNoLegacyChrome();
    await openTab(/Charts/);
    await screen.findByTestId('charts-panel');
    expectWhiteCharts('dataqc-theme-scope');
    expectNoLegacyChrome();
  }, 60000);

  it('ML Workbench: a group k-fold fit shows its fold table and crossplot in dark', async () => {
    render(<MemoryRouter><MlWorkbench /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    toDark('mlwb-theme-scope');
    const list = await screen.findByTestId('well-list');
    for (let n = 1; n <= 8; n += 1) fireEvent.click(within(list).getByLabelText(`Ekene-${n}`));
    fireEvent.click(screen.getByTestId('read-curves'));
    await screen.findByTestId('curve-list');
    fireEvent.click(screen.getByTestId('load-wells'));
    await screen.findByTestId('table-summary');
    fireEvent.change(screen.getByTestId('target-select'), { target: { value: 'RHOB' } });
    ['GR', 'DT', 'RT'].forEach((c) => fireEvent.click(screen.getByTestId(`feature-${c}`)));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('run-evaluate'));
    await openTab(/Validation results/);
    await screen.findByTestId('fold-table');
    expect(screen.getByTestId('crossplot')).toHaveAttribute('data-canvas', 'chart');
    expectWhiteCharts('mlwb-theme-scope');
    expectNoLegacyChrome();
  }, 60000);

  it('Electrofacies: k-means and CART results, the confusion matrix and depth tracks read in dark', async () => {
    mockRegistry = mockFaciesRegistry;
    render(<MemoryRouter><ElectrofaciesStudio /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    toDark('facies-theme-scope');
    const list = await screen.findByTestId('well-list');
    mockFaciesRegistry.wells.forEach((w) => fireEvent.click(within(list).getByLabelText(w.name)));
    fireEvent.click(screen.getByTestId('read-curves'));
    await screen.findByTestId('curve-list');
    fireEvent.click(screen.getByTestId('load-wells'));
    await screen.findByTestId('table-summary');
    fireEvent.change(screen.getByTestId('facies-source'), { target: { value: 'intervals' } });
    fireEvent.change(screen.getByTestId('facies-kind'), { target: { value: 'facies' } });
    await openTab(/Clustering/);
    fireEvent.change(screen.getByTestId('kmeans-k'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('run-kmeans'));
    await screen.findByTestId('kmeans-inertia');
    expectNoLegacyChrome();
    await openTab(/kNN and CART/);
    fireEvent.click(screen.getByTestId('run-cart'));
    await screen.findByTestId('cart-tree');
    // The confusion matrix is data: a table of counts on the panel roles.
    const confusion = screen.getAllByTestId(/-confusion$/)[0];
    expect(confusion.tagName).toBe('TABLE');
    expect(within(confusion).getAllByRole('row').length).toBeGreaterThan(1);
    expectNoLegacyChrome();
    await openTab(/Depth tracks/);
    await screen.findByTestId('track-core');
    expectWhiteCharts('facies-theme-scope');
    expectNoLegacyChrome();
  }, 60000);

  it('Forecasting: the fit table, forecast chart and intervals read in dark', async () => {
    const csv = ekeneCsv();
    render(<MemoryRouter><ForecastingMlWorkbench /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    toDark('forecastml-theme-scope');
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [fileOf(csv, 'ekene-monthly.csv')] } });
    await screen.findByTestId('upload-mapping');
    fireEvent.click(screen.getByTestId('use-upload'));
    await screen.findByTestId('table-summary');
    fireEvent.click(screen.getByTestId('run-fit'));
    await screen.findByTestId('fit-table');
    fireEvent.change(screen.getByTestId('horizon-h'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('run-intervals'));
    await screen.findByTestId('intervals-table');
    expect(screen.getByTestId('forecast-chart')).toHaveAttribute('data-canvas', 'chart');
    expectWhiteCharts('forecastml-theme-scope');
    expectNoLegacyChrome();
  }, 60000);

  it('AI Evaluation: the helper answer keeps its "Model output, not graded" label on a warning panel in dark', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        answer: 'Average reservoir pressure was 2,096 psia on 2023-01-01.', citations: ['EKD-018'], model: 'test-model', calls_today: 1, daily_cap: 50,
      },
      error: null,
    });
    render(<MemoryRouter><AiEvaluationStudio /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    toDark('aieval-theme-scope');
    await openTab(/Answers and groundedness/);
    fireEvent.click(await screen.findByTestId('assist-ask'));
    const res = await screen.findByTestId('assist-result');
    expect(within(res).getByText('Model output, not graded')).toHaveClass('text-pl-warning-text');
    expect(res.className).toMatch(/bg-pl-warning-bg/);
    fireEvent.click(screen.getByTestId('run-answers'));
    await screen.findByTestId('answers-summary');
    expectNoLegacyChrome();
    await openTab(/Calibration/);
    fireEvent.click(await screen.findByTestId('run-calibration'));
    await screen.findByTestId('calibration-summary');
    expect(screen.getByTestId('reliability-chart')).toHaveAttribute('data-canvas', 'chart');
    expectWhiteCharts('aieval-theme-scope');
    expectNoLegacyChrome();
  }, 60000);
});

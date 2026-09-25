/**
 * Production Forecasting ML Workbench page (Data & AI D4).
 *
 * The engine is gated in packages/engines/__tests__/dataai.forecast.test.js
 * and the workflow layer in src/utils/dataAi/__tests__/forecastWorkflows.test.js.
 * This mounts the app, because a validated engine behind a mis-wired panel
 * is still a broken app. The Ekene synthetic production (three wells of 60
 * months with a shut-in, the engine's own golden series) is uploaded as a
 * CSV, and the Production data spine is mocked for the second source. The
 * page is driven the way a user drives it and every figure on screen is
 * checked against a direct engine call.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EKENE, ekeneCsv } from '../../../utils/dataAi/__tests__/fixtures/forecast/ekene';

const mockSpine = {
  fields: [{ id: 'f1', name: 'Ekene field' }],
  wells: [{ id: 'w1', name: 'P-1', well_type: 'producer' }, { id: 'w9', name: 'I-1', well_type: 'injector' }],
  rate: () => EKENE[0].rate,
};
jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(async () => mockSpine.fields),
  listPoWells: jest.fn(async () => mockSpine.wells),
  getDailyProduction: jest.fn(async () => mockSpine.rate().map((v, i) => ({
    well_id: 'w1', prod_date: `${2021 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, oil_stb: v,
  }))),
}));

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

import ForecastingMlWorkbench from '@/pages/apps/ForecastingMlWorkbench';
import ForecastingMlWorkbenchHelpGuide, { FORECAST_GUIDE_SECTIONS } from '@/pages/apps/ForecastingMlWorkbenchHelpGuide';
import * as FC from '@/utils/dataAi/engine/forecast';
import { displayNumber } from '@/utils/dataAi/qcDisplay';
import { runField, parseSpec, defaultSpec } from '@/utils/dataAi/forecastWorkflows';
import { forecastTableFromUpload } from '@/utils/dataAi/forecastData';
import { parseDelimitedText } from '@/lib/tabularFile';

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

const CSV = ekeneCsv();
const csvFile = () => {
  const f = new File([CSV], 'ekene-monthly.csv', { type: 'text/csv' });
  if (!f.text) f.text = () => Promise.resolve(CSV);
  return f;
};
const mount = () => render(<MemoryRouter><ForecastingMlWorkbench /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

async function upload() {
  fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [csvFile()] } });
  await screen.findByTestId('upload-mapping');
  expect(screen.getByTestId('well-col')).toHaveDisplayValue('well (text)');
  expect(screen.getByTestId('value-col')).toHaveDisplayValue('oil_stb');
  fireEvent.change(screen.getByTestId('unit'), { target: { value: 'stb per month' } });
  fireEvent.click(screen.getByTestId('use-upload'));
  await screen.findByTestId('table-summary');
}

const Y = EKENE[0].rate;

describe('the page', () => {
  it('mounts with the saved-run selector, a disabled export, a help link and the empty states', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Production Forecasting ML Workbench' })).toBeInTheDocument();
    expect(screen.getByText('Saved forecast run')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    expect(screen.getByRole('link', { name: /Help guide/ })).toHaveAttribute('href', '/dashboard/apps/data-ai/forecasting-ml-workbench/help');
    expect(screen.getByTestId('no-data')).toHaveTextContent('No data loaded');
    expect(screen.getByTestId('spec-no-data')).toBeInTheDocument();
  });

  it('uploads the Ekene CSV, fits the three methods and the Arps decline, and shows the engine numbers', async () => {
    mount();
    await upload();
    expect(screen.getByTestId('table-counts')).toHaveTextContent('3 wells, 180 steps in all; one step is a month; unit stb per month.');
    fireEvent.click(screen.getByTestId('run-fit'));
    const table = await screen.findByTestId('fit-table');
    const rows = within(table).getAllByRole('row').slice(1);
    ['ses', 'holt', 'damped'].forEach((m, i) => {
      const r = FC.fitSmoothing({ y: Y, method: m, h: 24 });
      expect(rows[i]).toHaveTextContent(displayNumber(r.sse));
      expect(rows[i]).toHaveTextContent(displayNumber(r.params.alpha));
      expect(rows[i]).toHaveTextContent(r.optimiser.converged ? 'converged' : 'stopped before converging');
      expect(rows[i]).toHaveTextContent(`on a bound: ${r.optimiser.atBounds.length ? r.optimiser.atBounds.join(', ') : 'none'}`);
    });
    const a = FC.arpsForecast({ y: Y, h: 24 });
    expect(screen.getByTestId('arps-line')).toHaveTextContent(`qi ${displayNumber(a.qi)} per step`);
    expect(screen.getByTestId('arps-line')).toHaveTextContent('3 zero or negative dropped');
    expect(screen.getByTestId('forecast-chart')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).not.toBeDisabled();
  }, 60000);

  it('holds a typed parameter and shows the engine refusal of a bad one verbatim', async () => {
    mount();
    await upload();
    fireEvent.change(screen.getByTestId('param-damped-phi'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByTestId('run-fit'));
    const section = await screen.findByTestId('fit-results');
    expect(await within(section).findByRole('alert')).toHaveTextContent(FC.fitSmoothing({ y: Y, method: 'damped', phi: 1.5, h: 24 }).error);
    fireEvent.change(screen.getByTestId('param-damped-phi'), { target: { value: '0.9' } });
    fireEvent.click(screen.getByTestId('run-fit'));
    const cell = await within(screen.getByTestId('fit-table')).findByText(/phi 0\.9 \(held\)/);
    const r = FC.fitSmoothing({ y: Y, method: 'damped', phi: 0.9, h: 24 });
    expect(cell.closest('tr')).toHaveTextContent(displayNumber(r.sse));
    expect(within(section).queryByRole('alert')).toBeNull();
  }, 60000);

  it('runs the seeded bootstrap and labels P90 low and P10 high with the exceedance definition', async () => {
    mount();
    await upload();
    fireEvent.change(screen.getByTestId('horizon-h'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('run-intervals'));
    const t = await screen.findByTestId('intervals-table');
    const r = FC.forecastIntervals({ y: Y, method: 'damped', h: 6, nSims: 1000, seed: 42 });
    const rows = within(t).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('P90 (low)');
    expect(rows[0]).toHaveTextContent('P10 (high)');
    const cells = within(rows[1]).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual([String(Y.length), displayNumber(r.forecast[0]), displayNumber(r.P90[0]), displayNumber(r.P50[0]), displayNumber(r.P10[0])]);
    expect(r.P90[0]).toBeLessThan(r.P10[0]);
    expect(screen.getByTestId('intervals-section')).toHaveTextContent(r.definition);
    expect(screen.getByTestId('intervals-line')).toHaveTextContent('1,000 paths, seed 42');
    expect(screen.getByTestId('intervals-chart')).toBeInTheDocument();
  }, 60000);

  it('backtests against the Arps decline, ranks by MASE with the lag stated, and gives the MAPE reason on the shut-in', async () => {
    mount();
    await upload();
    openTab('Backtest');
    fireEvent.change(screen.getByTestId('bt-first'), { target: { value: '18' } });
    fireEvent.click(screen.getByTestId('run-compare'));
    await screen.findByTestId('compare-table');
    const c = FC.compareWithArps({
      y: Y, methods: ['ses', 'holt', 'damped'], firstOrigin: 18, horizon: 6, step: 6, refit: true, arpsModel: 'Auto-Select', rankBy: 'mase', m: 1,
    });
    expect(screen.getByTestId('compare-line')).toHaveTextContent(`Origins ${c.origins.join(', ')}; horizon 6; refit at every origin; MASE lag m = 1.`);
    const names = { ses: 'simple exponential smoothing', holt: "Holt's linear trend", damped: 'damped trend', arps: 'Arps decline' };
    expect(screen.getByTestId('compare-ranking')).toHaveTextContent(c.ranking.map((m) => names[m]).join(' > '));
    const rows = within(screen.getByTestId('compare-table')).getAllByRole('row').slice(1);
    c.rows.forEach((r, i) => expect(rows[i]).toHaveTextContent(displayNumber(r.mase)));
    // origin 24 forecasts across the shut-in months 25 to 27: MAPE is undefined with the engine reason
    expect(c.rows[0].mape).toBeNull();
    expect(screen.getByTestId('note-ses-mape')).toHaveTextContent(c.rows[0].notes.mape);
    expect(screen.getByTestId('compare-table')).toHaveTextContent('sMAPE is in percent on a 0 to 200 scale');
    fireEvent.change(screen.getByTestId('origin-pick'), { target: { value: String(c.origins[1]) } });
    expect(screen.getByTestId('origin-table')).toHaveTextContent(`Forecasts from origin ${c.origins[1]}`);
    expect(screen.getByTestId('origin-chart')).toBeInTheDocument();
  }, 60000);

  it('offers to hold the typed parameters in the backtest (off by default) and then backtests those methods with them held', async () => {
    mount();
    await upload();
    openTab('Backtest');
    expect(screen.queryByTestId('bt-hold-typed')).toBeNull();
    openTab('Fit and forecast');
    fireEvent.change(await screen.findByTestId('param-damped-phi'), { target: { value: '0.9' } });
    openTab('Backtest');
    const hold = await screen.findByTestId('bt-hold-typed');
    expect(hold).not.toBeChecked();
    fireEvent.change(screen.getByTestId('bt-first'), { target: { value: '18' } });
    const args = {
      y: Y, methods: ['ses', 'holt', 'damped'], firstOrigin: 18, horizon: 6, step: 6, refit: true, arpsModel: 'Auto-Select', rankBy: 'mase', m: 1,
    };
    const plain = FC.compareWithArps(args);
    const names = { ses: 'simple exponential smoothing', holt: "Holt's linear trend", damped: 'damped trend', arps: 'Arps decline' };
    // off: every parameter estimated, as before
    fireEvent.click(screen.getByTestId('run-compare'));
    await screen.findByTestId('compare-table');
    expect(screen.queryByTestId('compare-held')).toBeNull();
    let rows = within(screen.getByTestId('compare-table')).getAllByRole('row').slice(1);
    plain.rows.forEach((r, i) => expect(rows[i]).toHaveTextContent(displayNumber(r.mase)));
    // on: the damped row is the engine backtest with phi held
    fireEvent.click(hold);
    expect(screen.getByTestId('compare-spec')).toHaveTextContent('The typed parameters (damped trend phi 0.9) are held at every origin');
    fireEvent.click(screen.getByTestId('run-compare'));
    await screen.findByTestId('compare-held');
    expect(screen.getByTestId('compare-held')).toHaveTextContent('Typed parameters held at every origin: damped trend phi 0.9.');
    const bt = FC.backtest({
      y: Y, method: 'damped', firstOrigin: 18, horizon: 6, step: 6, refit: true, m: 1, phi: 0.9,
    });
    expect(bt.overall.mase).not.toBe(plain.rows[2].mase);
    rows = within(screen.getByTestId('compare-table')).getAllByRole('row').slice(1);
    expect(rows[2]).toHaveTextContent(displayNumber(bt.overall.mase));
    expect(rows[2]).toHaveTextContent(displayNumber(bt.overall.rmse));
    [0, 1, 3].forEach((i) => expect(rows[i]).toHaveTextContent(displayNumber(plain.rows[i].mase)));
    const held = plain.rows.map((r) => (r.method === 'damped' ? { method: 'damped', ...bt.overall } : r));
    const ranking = held.filter((r) => r.mase !== null).slice().sort((x, y) => x.mase - y.mase).map((r) => names[r.method]);
    expect(screen.getByTestId('compare-ranking')).toHaveTextContent(ranking.join(' > '));
    expect(screen.getByTestId('origin-params')).toHaveTextContent('damped trend alpha');
    expect(screen.getByTestId('origin-params')).toHaveTextContent('phi 0.9');
  }, 60000);

  it('compares every well in the field with the per-well engine rankings', async () => {
    mount();
    await upload();
    openTab('Field comparison');
    fireEvent.click(screen.getByTestId('run-field'));
    const summary = await screen.findByTestId('field-summary');
    const t = forecastTableFromUpload(parseDelimitedText(CSV), {
      label: 'x', wellColumn: 0, periodColumn: 1, valueColumn: 2,
    });
    const f = runField({ table: t, parsed: parseSpec(defaultSpec()) });
    const rows = within(summary).getAllByRole('row').slice(1);
    f.summary.forEach((s, i) => {
      expect(rows[i]).toHaveTextContent(String(s.rankedFirst));
      expect(rows[i]).toHaveTextContent(displayNumber(s.meanMetric));
    });
    const wells = within(screen.getByTestId('field-wells')).getAllByRole('row').slice(1);
    expect(wells).toHaveLength(3);
    expect(wells[0]).toHaveTextContent('EKENE-P01');
    expect(screen.getByTestId('ranked-first-chart')).toBeInTheDocument();
  }, 60000);

  it('reads producers of a field from the Production data spine as calendar months', async () => {
    mount();
    fireEvent.click(screen.getByTestId('source-spine'));
    fireEvent.change(await screen.findByTestId('spine-field'), { target: { value: 'f1' } });
    const list = await screen.findByTestId('spine-wells');
    expect(within(list).getByLabelText('P-1')).toBeChecked();
    expect(within(list).queryByLabelText('I-1')).toBeNull();
    fireEvent.click(screen.getByTestId('load-spine'));
    expect(await screen.findByTestId('table-counts')).toHaveTextContent('1 well, 60 steps in all; one step is a calendar month; unit stb per calendar month.');
    fireEvent.click(screen.getByTestId('run-fit'));
    const rows = within(await screen.findByTestId('fit-table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(displayNumber(FC.fitSmoothing({ y: Y, method: 'ses', h: 24 }).sse));
  }, 60000);
});

describe('the help guide', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ForecastingMlWorkbenchHelpGuide.jsx'), 'utf8');

  it('renders every section', () => {
    render(<MemoryRouter><ForecastingMlWorkbenchHelpGuide /></MemoryRouter>);
    FORECAST_GUIDE_SECTIONS.forEach((s) => expect(screen.getAllByText(s.title).length).toBeGreaterThan(0));
  });

  it('states the conventions the engine uses', () => {
    [
      'l_1 = y_1 and b_1 = y_2 - y_1', '2^-30', 'floor(u m)', 'mulberry32', 'simple-statistics 7.8.8', 'P90 is the low case',
      'per SPE PRMS', '0 to 200 scale', 'undefined when any actual is 0', 'lag m defaults to 1', '1e-12', 'engines/dca/arps.js',
      'Step k is passed as day k', '432 tests', '130 golden cases', '51 defects', 'NIST/SEMATECH',
    ].forEach((t) => expect(src).toContain(t));
  });

  it('follows the owner copy rule, names the methods and claims no AI it does not run', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'components', 'dataai', 'forecast');
    const files = [src, fs.readFileSync(path.join(__dirname, '..', 'ForecastingMlWorkbench.jsx'), 'utf8'),
      ...fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))];
    files.forEach((s) => {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/AI-powered|powered by AI|artificial intelligence/i);
    });
    expect(src).toContain('exponential smoothing');
    expect(src).toContain('Arps decline');
  });
});

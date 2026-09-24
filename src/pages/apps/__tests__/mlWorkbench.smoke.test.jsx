/**
 * ML Workbench page (Data & AI D2).
 *
 * The engine is gated in packages/engines/__tests__/dataai.ml.test.js and
 * the workflow layer in src/utils/dataAi/__tests__/mlWorkflows.ekene.test.js.
 * This mounts the app, because a validated engine behind a mis-wired panel
 * is still a broken app. The wells registry is mocked with the Ekene wells
 * (the fixture LAS files through the Well Data Manager's parser), and the
 * page is driven the way a user drives it: pick wells and curves, set the
 * target and features, fit, read the scores, write RHOB_ML into Ekene-9.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseLas } from '../../../../packages/engines/engines/welldata/lasParse';
import { prepareLogs } from '../../../../packages/engines/engines/welldata/lasImport';

const FIX = path.join(__dirname, '../../../utils/dataAi/__tests__/fixtures/ml');
const mockRegistry = (() => {
  const wells = [];
  const logs = {};
  const data = {};
  for (let n = 1; n <= 9; n += 1) {
    const id = `well-${n}`;
    wells.push({ id, name: `Ekene-${n}` });
    const prepared = prepareLogs(parseLas(fs.readFileSync(path.join(FIX, `Ekene-${n}-ml.las`), 'utf8')), {});
    logs[id] = prepared.logs.map((l, i) => {
      const lid = `${id}-log-${i}`;
      data[lid] = l.data;
      return {
        id: lid, well_id: id, mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, stop_md_m: l.stopMdM, step_m: l.stepM, n_samples: l.nSamples,
      };
    });
  }
  return { wells, logs, data };
})();
const mockSaveLog = jest.fn();

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(async () => mockRegistry.wells),
  listLogs: jest.fn(async (id) => mockRegistry.logs[id] || []),
  downloadCurve: jest.fn(async (log) => Float32Array.from(mockRegistry.data[log.id])),
  saveLog: (...a) => mockSaveLog(...a),
}));

const mockFrom = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
    storage: { from: () => ({ download: jest.fn() }) },
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
}));

import MlWorkbench from '@/pages/apps/MlWorkbench';
import MlWorkbenchHelpGuide, { ML_GUIDE_SECTIONS } from '@/pages/apps/MlWorkbenchHelpGuide';
import { tableFromBlocks, wellBlock, buildDesign } from '@/utils/dataAi/mlData';
import { defaultSpec, parseSpec, evaluate } from '@/utils/dataAi/mlWorkflows';
import { displayNumber } from '@/utils/dataAi/qcDisplay';

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
  mockSaveLog.mockReset();
  mockSaveLog.mockImplementation(async () => ({ id: 'new-log' }));
});

const mount = () => render(<MemoryRouter><MlWorkbench /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

/** The same table the page builds, straight from the fixtures. */
const expectedTable = (ns) => tableFromBlocks(ns.map((n) => {
  const id = `well-${n}`;
  const logs = mockRegistry.logs[id].filter((l) => ['DEPT', 'GR', 'DT', 'RT', 'RHOB', 'NPHI', 'CALI', 'SP', 'RXO', 'PEF'].includes(l.mnemonic));
  const samples = Object.fromEntries(logs.map((l) => [l.id, Float32Array.from(mockRegistry.data[l.id])]));
  return wellBlock({ well: { id, name: `Ekene-${n}` }, logs, samples }).block;
}));

async function loadEightWells() {
  const list = await screen.findByTestId('well-list');
  for (let n = 1; n <= 8; n += 1) fireEvent.click(within(list).getByLabelText(`Ekene-${n}`));
  fireEvent.click(screen.getByTestId('read-curves'));
  await screen.findByTestId('curve-list');
  fireEvent.click(screen.getByTestId('load-wells'));
  await screen.findByTestId('table-summary');
}

const chooseRhobModel = () => {
  fireEvent.change(screen.getByTestId('target-select'), { target: { value: 'RHOB' } });
  ['GR', 'DT', 'RT'].forEach((c) => fireEvent.click(screen.getByTestId(`feature-${c}`)));
  fireEvent.click(screen.getByTestId('log-RT'));
};

describe('the page', () => {
  it('mounts with the saved-run selector, disabled exports, a help link and the empty states', async () => {
    mount();
    expect(screen.getByRole('heading', { name: 'ML Workbench' })).toBeInTheDocument();
    expect(screen.getByText('Saved ML run')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    expect(screen.getByTestId('export-pdf')).toBeDisabled();
    expect(screen.getByRole('link', { name: /Help guide/ })).toHaveAttribute('href', '/dashboard/apps/data-ai/ml-workbench/help');
    expect(screen.getByTestId('no-data')).toHaveTextContent('No data loaded');
    expect(screen.getByTestId('spec-no-data')).toBeInTheDocument();
    await screen.findByTestId('well-list');
  });

  it('fits RHOB on eight Ekene wells by group k-fold and shows the engine scores, then writes RHOB_ML into Ekene-9', async () => {
    mount();
    await loadEightWells();
    expect(screen.getByTestId('table-summary')).toHaveTextContent('2,624 rows from 8 wells');
    chooseRhobModel();
    expect(screen.getByTestId('design-summary')).toHaveTextContent('2,624 rows from 8 wells');
    expect(screen.getByTestId('design-summary')).toHaveTextContent('features GR, DT, log10(RT)');
    fireEvent.click(screen.getByTestId('run-evaluate'));
    openTab('Validation results');
    const table = await screen.findByTestId('fold-table');

    // the numbers on screen are the engine's
    const spec = {
      ...defaultSpec(), target: 'RHOB', features: [{ name: 'GR', log: false }, { name: 'DT', log: false }, { name: 'RT', log: true }],
    };
    const design = buildDesign(expectedTable([1, 2, 3, 4, 5, 6, 7, 8]), spec);
    const ev = evaluate({ design, parsed: parseSpec(spec), task: 'regression' });
    expect(screen.getByTestId('pooled-regression')).toHaveTextContent(`Pooled RMSE ${displayNumber(ev.pooled.rmse)}, MAE ${displayNumber(ev.pooled.mae)}, R² ${displayNumber(ev.pooled.r2)}.`);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    rows.forEach((tr, q) => {
      expect(tr).toHaveTextContent(ev.folds[q].testGroups.join(', '));
      expect(tr).toHaveTextContent(displayNumber(ev.folds[q].test.r2));
    });
    expect(screen.getByTestId('coef-table')).toHaveTextContent('log10(RT)');
    expect(screen.getByTestId('crossplot')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).not.toBeDisabled();

    // write back
    openTab('Write to a well');
    fireEvent.change(await screen.findByTestId('writeback-well'), { target: { value: 'well-9' } });
    fireEvent.click(screen.getByTestId('writeback-predict'));
    await screen.findByTestId('writeback-counts');
    expect(screen.getByTestId('writeback-counts')).toHaveTextContent('328 of 328 samples predicted');
    expect(screen.getByTestId('writeback-mnemonic')).toHaveValue('RHOB_ML');
    fireEvent.change(screen.getByTestId('writeback-mnemonic'), { target: { value: 'GR' } });
    expect(screen.getByTestId('mnemonic-problem')).toHaveTextContent('This well already has a curve named GR');
    expect(screen.getByTestId('writeback-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('writeback-mnemonic'), { target: { value: 'RHOB_ML' } });
    fireEvent.click(screen.getByTestId('writeback-save'));
    await screen.findByTestId('writeback-saved');
    expect(mockSaveLog).toHaveBeenCalledTimes(1);
    const [wellId, log] = mockSaveLog.mock.calls[0];
    expect(wellId).toBe('well-9');
    expect(log.mnemonic).toBe('RHOB_ML');
    expect(log.data).toHaveLength(328);
    expect(log.provenance).toMatchObject({
      computed: true, engine: 'ml-workbench', method: 'ols', target: 'RHOB', predicted_well: 'Ekene-9', training_rows: 2624,
    });
    expect(log.provenance.validation.pooled_r2).toBe(ev.pooled.r2);
  }, 60000);

  it('shows the engine separation refusal verbatim for a label cut from a feature', async () => {
    mount();
    await loadEightWells();
    fireEvent.click(screen.getByTestId('task-classification'));
    fireEvent.change(screen.getByTestId('label-curve'), { target: { value: 'RT' } });
    fireEvent.change(screen.getByTestId('label-cutoff'), { target: { value: '3' } });
    ['GR', 'RHOB', 'RT'].forEach((c) => fireEvent.click(screen.getByTestId(`feature-${c}`)));
    fireEvent.click(screen.getByTestId('log-RT'));
    fireEvent.click(screen.getByTestId('run-evaluate'));
    openTab('Validation results');
    const table = await screen.findByTestId('fold-table');
    expect(within(table).getAllByRole('alert')[0]).toHaveTextContent(/y is completely separated by a linear combination of the features/);
    expect(screen.getByTestId('pooled-refused')).toHaveTextContent('No pooled score');
  }, 60000);

  it('runs the leakage comparison and reports the side the engine found', async () => {
    mount();
    await loadEightWells();
    chooseRhobModel();
    openTab('Leakage and diagnostics');
    fireEvent.click(screen.getByTestId('run-leakage'));
    const verdict = await screen.findByTestId('leakage-verdict');
    expect(verdict).toHaveTextContent(/^Optimism \(random-row test r2 - group test r2\): /);
    expect(verdict).toHaveTextContent(/On this data the random row split scored (better|worse) than the group split/);
    expect(screen.getByTestId('leakage-random')).toHaveTextContent('Wells on both sides: Ekene-');
    expect(screen.getByTestId('leakage-group')).toHaveTextContent('Wells on both sides: none.');
  }, 60000);
});

describe('the help guide', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'MlWorkbenchHelpGuide.jsx'), 'utf8');

  it('renders every section', () => {
    render(<MemoryRouter><MlWorkbenchHelpGuide /></MemoryRouter>);
    ML_GUIDE_SECTIONS.forEach((s) => expect(screen.getAllByText(s.title).length).toBeGreaterThan(0));
  });

  it('states the conventions the engine uses', () => {
    [
      'POPULATION sd', 'round robin', 'exactly 0.5 is class 0', '1e-15', 'refuses a fit above 1e8', 'Filip', '5.2e9',
      'Which way it falls depends on the data', 'NIST Statistical Reference Datasets', '_ML',
    ].forEach((t) => expect(src).toContain(t));
  });

  it('follows the owner copy rule and claims no AI it does not run', () => {
    [src, fs.readFileSync(path.join(__dirname, '..', 'MlWorkbench.jsx'), 'utf8')].forEach((s) => {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/AI-powered|powered by AI|artificial intelligence/i);
    });
    expect(src).not.toMatch(/always flatter/);
  });
});

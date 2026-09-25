/**
 * Electrofacies Studio page (Data & AI D3).
 *
 * The engine is gated in packages/engines/__tests__/dataai.cluster.test.js
 * and the workflow layer in src/utils/dataAi/__tests__/faciesWorkflows.test.js.
 * This mounts the app, because a validated engine behind a mis-wired panel
 * is still a broken app. The wells registry is mocked with three wells built
 * from the engine's seeded synthetic facies logs (two cored by facies
 * interval logs, one uncored), and the page is driven the way a user drives
 * it: pick wells and curves, choose logs and the core, run k-means, CART and
 * PCA, read the numbers, write a facies log to a well.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { syntheticFacies } from '../../../../packages/engines/tools/validation/dataai/synthetic_wells';

const N = 120;
const mockRegistry = (() => {
  const wells = [];
  const logs = {};
  const data = {};
  const intervals = {};
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
    // wells 1 and 2 are cored: one facies interval per run of equal facies
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
  return {
    wells, logs, data, intervals,
  };
})();
const mockSaveLog = jest.fn();

jest.mock('@/lib/wellsRegistry', () => ({
  listWells: jest.fn(async () => mockRegistry.wells),
  listLogs: jest.fn(async (id) => mockRegistry.logs[id] || []),
  downloadCurve: jest.fn(async (log) => Float32Array.from(mockRegistry.data[log.id])),
  saveLog: (...a) => mockSaveLog(...a),
}));
jest.mock('@/lib/stratRegistry', () => ({
  listIntervals: jest.fn(async (id) => mockRegistry.intervals[id] || []),
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

import ElectrofaciesStudio from '@/pages/apps/ElectrofaciesStudio';
import ElectrofaciesStudioHelpGuide, { FACIES_GUIDE_SECTIONS } from '@/pages/apps/ElectrofaciesStudioHelpGuide';
import * as C from '@/utils/dataAi/engine/cluster';
import { tableFromBlocks, wellBlock } from '@/utils/dataAi/mlData';
import { buildFaciesDesign, compactIntervals } from '@/utils/dataAi/faciesData';
import {
  defaultSpec, parseSpec, runKmeans, runSupervised,
} from '@/utils/dataAi/faciesWorkflows';
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

const mount = () => render(<MemoryRouter><ElectrofaciesStudio /></MemoryRouter>);
const openTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

/** The same table the page builds, straight from the mocked registry. */
const expectedTable = () => {
  const blocks = mockRegistry.wells.map((w) => {
    const logs = mockRegistry.logs[w.id];
    const samples = Object.fromEntries(logs.map((l) => [l.id, Float32Array.from(mockRegistry.data[l.id])]));
    return wellBlock({ well: w, logs, samples }).block;
  });
  const t = tableFromBlocks(blocks);
  return { ...t, intervals: Object.fromEntries(mockRegistry.wells.map((w) => [w.name, compactIntervals(mockRegistry.intervals[w.id])])) };
};
const SPEC = {
  ...defaultSpec(),
  features: ['GR', 'RHOB', 'NPHI', 'PEF'].map((name) => ({ name, log: false })),
  facies: { source: 'intervals', curve: '', kind: 'facies' },
};

async function loadAndChoose() {
  const list = await screen.findByTestId('well-list');
  mockRegistry.wells.forEach((w) => fireEvent.click(within(list).getByLabelText(w.name)));
  fireEvent.click(screen.getByTestId('read-curves'));
  await screen.findByTestId('curve-list');
  fireEvent.click(screen.getByTestId('load-wells'));
  await screen.findByTestId('table-summary');
  ['GR', 'RHOB', 'NPHI', 'PEF'].forEach((c) => fireEvent.click(screen.getByTestId(`feature-${c}`)));
  fireEvent.change(screen.getByTestId('facies-source'), { target: { value: 'intervals' } });
  fireEvent.change(screen.getByTestId('facies-kind'), { target: { value: 'facies' } });
}

describe('the page', () => {
  it('mounts with the saved-run selector, a disabled export, a help link and the empty states', async () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Electrofacies Studio' })).toBeInTheDocument();
    expect(screen.getByText('Saved facies run')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    expect(screen.getByRole('link', { name: /Help guide/ })).toHaveAttribute('href', '/dashboard/apps/data-ai/electrofacies-studio/help');
    expect(screen.getByTestId('no-data')).toHaveTextContent('No data loaded');
    expect(screen.getByTestId('spec-no-data')).toBeInTheDocument();
    await screen.findByTestId('well-list');
  });

  it('loads three wells with their interval logs, runs k-means and shows the engine numbers and the matching that ran', async () => {
    mount();
    await loadAndChoose();
    expect(screen.getByTestId('interval-kinds')).toHaveTextContent('facies (2 wells)');
    const design = buildFaciesDesign(expectedTable(), SPEC);
    expect(screen.getByTestId('design-rows')).toHaveTextContent(`360 rows on GR, RHOB, NPHI, PEF from 3 wells; ${design.labelled.length} have a core facies`);
    expect(design.labelled).toHaveLength(240);

    openTab('Clustering');
    fireEvent.change(screen.getByTestId('kmeans-k'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('run-kmeans'));
    const inertia = await screen.findByTestId('kmeans-inertia');
    const spec = { ...SPEC, kmeans: { ...SPEC.kmeans, k: '4' } };
    const r = runKmeans({ design, parsed: parseSpec(spec) });
    expect(inertia).toHaveTextContent(displayNumber(r.kmeans.inertia));
    expect(screen.getByTestId('kmeans-silhouette')).toHaveTextContent(displayNumber(r.silhouette.mean));
    expect(screen.getByTestId('kmeans-core-mode')).toHaveTextContent(`Matching ran ${r.compare.modeText}`);
    expect(screen.getByTestId('kmeans-core-ari')).toHaveTextContent(displayNumber(r.compare.match.ari));
    expect(screen.getByTestId('export-csv')).not.toBeDisabled();

    // depth tracks draw the core and the k-means column
    openTab('Depth tracks');
    expect(await screen.findByTestId('track-core')).toBeInTheDocument();
    expect(screen.getByTestId('track-kmeans')).toBeInTheDocument();

    // write the k-means labels to Synth-3 (uncored) as a new curve
    openTab('Write to a well');
    fireEvent.change(await screen.findByTestId('writeback-well'), { target: { value: 'Synth-3' } });
    fireEvent.click(screen.getByTestId('writeback-prepare'));
    await screen.findByTestId('writeback-counts');
    expect(screen.getByTestId('writeback-counts')).toHaveTextContent('120 of 120 samples carry a code');
    expect(screen.getByTestId('writeback-mnemonic')).toHaveValue('EFAC_KM');
    fireEvent.change(screen.getByTestId('writeback-mnemonic'), { target: { value: 'GR' } });
    expect(screen.getByTestId('mnemonic-problem')).toHaveTextContent('This well already has a curve named GR');
    fireEvent.change(screen.getByTestId('writeback-mnemonic'), { target: { value: 'EFAC_KM' } });
    fireEvent.click(screen.getByTestId('writeback-save'));
    await screen.findByTestId('writeback-saved');
    expect(mockSaveLog).toHaveBeenCalledTimes(1);
    const [wellId, log] = mockSaveLog.mock.calls[0];
    expect(wellId).toBe('well-3');
    expect(log.mnemonic).toBe('EFAC_KM');
    expect(Array.from(log.data)).toEqual(r.labels.slice(240));
    expect(log.provenance).toMatchObject({
      engine: 'electrofacies-studio', method: 'kmeans', parameters: { k: 4, seed: 42, n_init: 10 }, written_well: 'Synth-3', rows: 360,
    });
  }, 60000);

  it('runs CART held out by whole cored wells and prints the engine tree', async () => {
    mount();
    await loadAndChoose();
    openTab('kNN and CART');
    fireEvent.click(screen.getByTestId('run-cart'));
    const tree = await screen.findByTestId('cart-tree');
    const design = buildFaciesDesign(expectedTable(), SPEC);
    const r = runSupervised({ design, parsed: parseSpec(SPEC), method: 'cart' });
    expect(tree.textContent).toBe(r.finalTree.printed);
    expect(screen.getByTestId('split-line')).toHaveTextContent(`scored on ${r.split.nTest} cored rows of ${r.split.testGroups.join(', ')} (engine group split, seed 42)`);
    expect(r.split.testGroups).not.toContain('Synth-3');
    expect(screen.getByTestId('cart-accuracy')).toHaveTextContent(displayNumber(r.scores.report.accuracy));
  }, 60000);

  it('counts the rows of the written well outside the training range before a CART write-back, and stores the counts', async () => {
    mount();
    await loadAndChoose();
    openTab('kNN and CART');
    fireEvent.click(screen.getByTestId('run-cart'));
    await screen.findByTestId('cart-tree');
    // the training range counted here from the raw registry curves: the final
    // CART trains on every cored row, all 120 samples of Synth-1 and Synth-2
    const names = ['GR', 'RHOB', 'NPHI', 'PEF'];
    const curve = (w, m) => mockRegistry.data[mockRegistry.logs[`well-${w}`].find((l) => l.mnemonic === m).id].map((v) => Math.fround(v));
    const expected = names.map((m) => {
      const train = [...curve(1, m), ...curve(2, m)];
      const lo = Math.min(...train); const hi = Math.max(...train);
      const w3 = curve(3, m);
      return { below: w3.filter((v) => v < lo).length, above: w3.filter((v) => v > hi).length };
    });
    const w3rows = names.map((m) => curve(3, m));
    const outsideAny = w3rows[0].filter((_, i) => names.some((m, f) => {
      const train = [...curve(1, m), ...curve(2, m)];
      return w3rows[f][i] < Math.min(...train) || w3rows[f][i] > Math.max(...train);
    })).length;
    expect(outsideAny).toBeGreaterThan(0);

    openTab('Write to a well');
    fireEvent.change(await screen.findByTestId('writeback-method'), { target: { value: 'cart' } });
    fireEvent.change(screen.getByTestId('writeback-well'), { target: { value: 'Synth-3' } });
    fireEvent.click(screen.getByTestId('writeback-prepare'));
    const grid = await screen.findByTestId('writeback-range');
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    rows.forEach((tr, f) => {
      const cells = within(tr).getAllByRole('cell').map((c) => c.textContent);
      expect(cells[0]).toBe(names[f]);
      expect(cells.slice(3)).toEqual([String(expected[f].below), String(expected[f].above), String(expected[f].below + expected[f].above)]);
    });
    expect(screen.getByTestId('writeback-range-warning')).toHaveTextContent(`${outsideAny} of the 120 labelled rows of Synth-3`);
    expect(screen.getByTestId('writeback-save')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('writeback-save'));
    await screen.findByTestId('writeback-saved');
    const [, log] = mockSaveLog.mock.calls[0];
    expect(log.mnemonic).toBe('EFAC_CART');
    expect(log.provenance.training_range).toMatchObject({
      training_row_count: 240, rows_checked: 120, rows_outside_any_log: outsideAny,
    });
    expect(log.provenance.training_range.per_log.map((x) => [x.log, x.rows_below, x.rows_above])).toEqual(names.map((m, f) => [m, expected[f].below, expected[f].above]));
  }, 60000);

  it('shows an engine refusal verbatim', async () => {
    mount();
    await loadAndChoose();
    openTab('Clustering');
    fireEvent.change(screen.getByTestId('kmeans-k'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('run-kmeans'));
    const section = screen.getByTestId('kmeans-section');
    const alert = await within(section).findByRole('alert');
    const design = buildFaciesDesign(expectedTable(), SPEC);
    expect(alert).toHaveTextContent(C.kmeans({ X: design.X, k: 0, seed: 42 }).error);
    expect(alert).toHaveTextContent('k must be a whole number from 1 to 360 (the number of rows)');
  }, 60000);

  it('runs PCA and shows the engine eigenvalues', async () => {
    mount();
    await loadAndChoose();
    openTab('PCA');
    fireEvent.click(screen.getByTestId('run-pca'));
    const table = await screen.findByTestId('pca-eigen');
    const design = buildFaciesDesign(expectedTable(), SPEC);
    const p = C.pca({ X: design.X, names: design.names });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    rows.forEach((tr, k) => expect(tr).toHaveTextContent(displayNumber(p.eigenvalues[k])));
    expect(screen.getByTestId('scree-chart')).toBeInTheDocument();
  }, 60000);
});

describe('the help guide', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ElectrofaciesStudioHelpGuide.jsx'), 'utf8');

  it('renders every section', () => {
    render(<MemoryRouter><ElectrofaciesStudioHelpGuide /></MemoryRouter>);
    FACIES_GUIDE_SECTIONS.forEach((s) => expect(screen.getAllByText(s.title).length).toBeGreaterThan(0));
  });

  it('states the conventions the engine uses', () => {
    [
      'population SD', 'sample SD (n - 1)', 'largest absolute value is made positive', 'floor(u n)', '1e-12', 'lowest cluster ids',
      'top <= depth < base', 'one-to-one', 'majority', 'Hungarian', '0.92461872', '52 defects', 'EFAC_KM',
    ].forEach((t) => expect(src).toContain(t));
  });

  it('follows the owner copy rule and claims no AI it does not run', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'components', 'dataai', 'facies');
    const files = [src, fs.readFileSync(path.join(__dirname, '..', 'ElectrofaciesStudio.jsx'), 'utf8'),
      ...fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))];
    files.forEach((s) => {
      expect(s).not.toMatch(/[–—]/);
      expect(s).not.toMatch(/AI-powered|powered by AI|artificial intelligence/i);
    });
  });
});

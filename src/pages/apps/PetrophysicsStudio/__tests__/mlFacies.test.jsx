/**
 * AppUpgrade PETRO-U2-006: facies interchange with Data AI.
 * Studio -> Data AI: rule facies published as electrofacies intervals read
 * back through Data AI's own interval reader (compactIntervals,
 * faciesAtDepth) with the rule names at every depth.
 * Data AI -> Studio: an Electrofacies Studio curve (codes + legend in
 * provenance) becomes interval rows the Studio's strip tracks draw, labelled
 * from the legend, and the two classifications cross-tabulate sample by
 * sample.
 * Negative control (run 2026-09-29): with mlFaciesIntervals indexing labels
 * by raw code instead of the code's position, the cluster 7 run is labelled
 * wrongly and the legend case fails.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { intervalsFromRuns } from '@/lib/stratigraphy/intervals';
import { compactIntervals, faciesAtDepth } from '@/utils/dataAi/faciesData';
import { mlFaciesLogs, mlFaciesIntervals, mlKind, faciesCrosstab } from '../services/mlFacies';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

const depth = Float64Array.from({ length: 10 }, (_, i) => 100 + i);
const efac = { mnemonic: 'EFAC_KM', provenance: { engine: 'electrofacies-studio', method: 'kmeans', legend: [{ code: 2, label: 'cluster 2', matchedFacies: 'sand' }, { code: 7, label: 'cluster 7' }] } };

test('a Data AI curve becomes labelled intervals; NaN breaks a run', () => {
  const data = Float64Array.from([2, 2, 2, NaN, 7, 7, 2, 2, 7, 7]);
  const { rows, labels, method } = mlFaciesIntervals(depth, data, efac);
  expect(labels).toEqual(['cluster 2 (sand)', 'cluster 7']);
  expect(method).toBe('kmeans');
  expect(rows.map((r) => [r.top_md_m, r.base_md_m, r.label])).toEqual([
    [100, 103, 'cluster 2 (sand)'], [104, 106, 'cluster 7'], [106, 108, 'cluster 2 (sand)'], [108, 110, 'cluster 7'],
  ]);
  expect(rows.every((r) => r.kind === mlKind('EFAC_KM'))).toBe(true);
  expect(mlFaciesLogs([efac, { mnemonic: 'GR', provenance: {} }, { mnemonic: 'EFAC_CART' }]).map((l) => l.mnemonic)).toEqual(['EFAC_KM', 'EFAC_CART']);
});

test('Studio rule facies read back through Data AI\'s interval reader', () => {
  const ruleIdx = Float64Array.from([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]);
  const rows = intervalsFromRuns(depth, ruleIdx, ['sand', 'shale'], { kind: 'electrofacies', source: 'interpretation' });
  const compact = compactIntervals(rows);
  expect(faciesAtDepth(compact, 101)).toBe('sand');
  expect(faciesAtDepth(compact, 105)).toBe('shale');
  expect(faciesAtDepth(compact, 109.5)).toBe('sand');
});

test('the crosstab counts samples by rule class and ML class', () => {
  const rule = intervalsFromRuns(depth, Float64Array.from([0, 0, 0, 0, 1, 1, 1, 0, 0, 0]), ['sand', 'shale'], { kind: 'electrofacies' });
  const ml = mlFaciesIntervals(depth, Float64Array.from([2, 2, 2, NaN, 7, 7, 2, 2, 7, 7]), efac).rows;
  const t = faciesCrosstab(depth, rule, 'electrofacies', ml, mlKind('EFAC_KM'));
  expect(t.n).toBe(9);
  const iSand = t.a.indexOf('sand'); const iShale = t.a.indexOf('shale');
  const j2 = t.b.indexOf('cluster 2 (sand)'); const j7 = t.b.indexOf('cluster 7');
  expect(t.counts[iSand][j2]).toBe(4);
  expect(t.counts[iSand][j7]).toBe(2);
  expect(t.counts[iShale][j7]).toBe(2);
  expect(t.counts[iShale][j2]).toBe(1);
});

test('workstation: a Data AI facies curve shows as a strip on request', async () => {
  const backend = makeInMemoryBackend();
  const well = (await backend.listWells()).find((w) => w.name === 'KETA TYPE-1');
  const n = (await backend.listLogs(well.id)).find((l) => l.mnemonic === 'DEPT').n_samples;
  await backend.publishCurves(well.id, [{
    mnemonic: 'EFAC_KM', unit: '', data: Float32Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1)),
    startMdM: 2000, stopMdM: 2100, stepM: 0.5, nSamples: n, nullCount: 0,
    provenance: { computed: true, engine: 'electrofacies-studio', method: 'kmeans', legend: [{ code: 0, label: 'cluster 0' }, { code: 1, label: 'cluster 1' }] },
  }], 'dataai-run');
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  const rows = await screen.findAllByTestId('petro-well-row', {}, { timeout: 30000 });
  fireEvent.click(rows.find((r) => /KETA TYPE-1/.test(r.textContent)));
  await screen.findByTestId('petro-mlfacies', {}, { timeout: 30000 });
  expect(screen.getByTestId('petro-mlfacies').textContent).toMatch(/EFAC_KM.*kmeans, 2 classes/);
  fireEvent.click(screen.getByTestId('petro-mlfacies-show-EFAC_KM'));
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/EFAC_KM from Data AI is on a strip track/), { timeout: 30000 });
}, 400000);

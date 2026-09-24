/**
 * Electrofacies Studio PCA panel: the engine's warning (Data & AI D3).
 *
 * Since petrolord-engines #254, pca keeps both of its warnings, Jacobi
 * non-convergence first, then repeated eigenvalues, joined by '; '. The
 * panel shows each one verbatim on its own line. The result here is a real
 * engine call on the engine's own 'pca-warning-both' golden input (one
 * sweep allowed, two repeated eigenvalue pairs), so nothing is restated.
 *
 * (Kept beside the smoke test: the smoke test's copy-rule gate reads every
 * file in src/components/dataai/facies/ and expects no directories there.)
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import * as C from '@/utils/dataAi/engine/cluster';
import PcaPanel from '@/components/dataai/facies/PcaPanel';

const golden = require('../../../../packages/engines/test-data/dataai/goldens/cluster_cases.json');

const byId = (id) => {
  const c = golden.cases.find((x) => x.id === id);
  if (!c) throw new Error(`golden case ${id} missing from cluster_cases.json`);
  return c;
};

let mockResult = null;
jest.mock('@/contexts/ElectrofaciesContext', () => ({
  useElectrofacies: () => ({
    spec: { pca: { matrix: 'correlation', x: '1', y: '2' } },
    updateSpec: () => {},
    results: { pca: { result: mockResult } },
    design: {
      names: ['GR', 'RHOB', 'NPHI', 'PEF'], X: [], facies: null,
    },
    busy: null,
    cancelJob: () => {},
    runJob: () => {},
    isStale: () => false,
  }),
}));

const pcaOf = (id) => {
  const c = byId(id);
  const input = c.input || c.args;
  return C.pca(input);
};

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

describe('PCA panel warning', () => {
  it('shows both engine warnings verbatim, non-convergence first, one per line', () => {
    mockResult = pcaOf('pca-warning-both');
    const parts = mockResult.warning.split('; ');
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^Jacobi did not converge in 1 sweep \(the last sweep still rotated\)/);
    expect(parts[1]).toMatch(/differ by at most 1e-10 times the largest eigenvalue/);
    render(<PcaPanel />);
    const note = screen.getByTestId('pca-warning');
    parts.forEach((w) => expect(within(note).getByText(w)).toBeInTheDocument());
    expect(note.textContent).toBe(parts.join(''));
  });

  it('shows a single warning as one line', () => {
    mockResult = pcaOf('pca-warning-repeated-only');
    expect(mockResult.warning).not.toContain('; ');
    render(<PcaPanel />);
    expect(within(screen.getByTestId('pca-warning')).getByText(mockResult.warning)).toBeInTheDocument();
  });

  it('shows no warning note when the engine gives none', () => {
    mockResult = C.pca({ X: [[1, 2], [2, 1], [3, 5], [4, 3]], names: ['GR', 'RHOB'] });
    expect(mockResult.warning).toBeUndefined();
    render(<PcaPanel />);
    expect(screen.queryByTestId('pca-warning')).toBeNull();
  });
});

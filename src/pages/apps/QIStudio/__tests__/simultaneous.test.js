import { simultaneousProblem, densityNote, advancedProblem } from '../components/SimultaneousPanel';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject } from '../services/model';
import { readPdf, flat } from '@/lib/reportKit/testKit';

test('three to five distinct stacks, one past 25 degrees', () => {
  const s = (v, a) => ({ volumeId: v, angle: a });
  expect(simultaneousProblem([s('a', 5), s('b', 15)])).toMatch(/three to five/);
  // QI upgrade P1.4: near stacks run; the density gate withholds density and the tab says so
  expect(simultaneousProblem([s('a', 5), s('b', 12), s('c', 20)])).toBeNull();
  expect(densityNote([s('a', 5), s('b', 12), s('c', 20)])).toMatch(/farthest stack is 20 degrees: AI, SI and Vp\/Vs will be written, density will not/);
  expect(densityNote([s('a', 5), s('b', 15), s('c', 30)])).toBeNull();
  expect(advancedProblem({ epsAi: '0.05', epsSi: '0.05', epsRho: '', lfmHz: '8', vsVp: '', minRhoCorr: '0.5' })).toMatch(/pull of density/);
  expect(advancedProblem({ epsAi: '0.05', epsSi: '0.05', epsRho: '0.05', lfmHz: '8', vsVp: '1.5', minRhoCorr: '0.5' })).toMatch(/Vs\/Vp/);
  expect(advancedProblem({ epsAi: '0.05', epsSi: '0.05', epsRho: '0.05', lfmHz: '8', vsVp: '', minRhoCorr: '0.5' })).toBeNull();
  expect(simultaneousProblem([s('a', 5), s('a', 15), s('c', 30)])).toMatch(/different volume/);
  expect(simultaneousProblem([s('a', 5), s('b', 15), s('c', 30)])).toBeNull();
});

test('the report carries the simultaneous blind-well table', () => {
  const p = { ...blankProject(), simultaneous: { blind: { at: '2026-10-07T08:00:00Z', volumeName: 'Keta near', result: { blind: [{ name: 'KETA-1', blind: { ai: { rmsPct: 4.1 }, si: { rmsPct: 5.2 }, rho: { rmsPct: 3.3, corr: 0.62 } } }] } }, runs: [{ name: 'Keta: AI, SI, density, Vp/Vs', status: 'ready' }] } };
  const model = reportModel({ project: p, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Simultaneous inversion: Keta near/);
  expect(t).toMatch(/Density is the least resolved parameter/);
  expect(t).toMatch(/Volumes: Keta: AI, SI, density, Vp\/Vs/);
});

test('the report carries the angle wavelets', () => {
  const p = { ...blankProject(), simultaneous: { angleWavelets: { dtMs: 4, items: [{ angle: 5, peakHz: 29.6, phaseDeg: 2, samples: [0, 1, 0], wells: [{ name: 'KETA-1', synthCorr: 0.91 }] }, { angle: 35, peakHz: 18.4, phaseDeg: -6, samples: [0, 1, 0], wells: [{ name: 'KETA-1', synthCorr: 0.84 }] }] } } };
  const model = reportModel({ project: p, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Angle wavelets/);
  expect(t).toMatch(/18\.4/);
  expect(t).toMatch(/KETA-1 0\.84/);
});

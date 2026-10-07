import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject } from '../services/model';
import { inversionIssues } from '../services/inversionRun';
import { readPdf, flat } from '@/lib/reportKit/testKit';

const blind = [
  { name: 'KETA-1', blind: { corr: 0.91, rmsPct: 4.2, n: 120 }, withWell: { corr: 0.97, rmsPct: 2.1, n: 120 } },
  { name: 'KETA-4', blind: { corr: 0.55, rmsPct: 12.5, n: 90 }, withWell: { corr: 0.9, rmsPct: 3.0, n: 90 } },
];
const project = {
  ...blankProject(),
  inversion: {
    v1: {
      blind: { jobId: 'j1', at: '2026-10-06T20:00:00Z', volumeName: 'Keta 3D full stack', result: { settings: { method: 'model_based', output: 'AI' }, blind } },
      runs: [{ jobId: 'j2', volumeId: 'o1', name: 'Keta AI model-based', status: 'ready' }],
      spread: { jobId: 'j3', at: '2026-10-06T21:00:00Z', volumeName: 'Keta 3D full stack', result: { settings: { method: 'model_based' }, blind, sensitivity: { rows: [{ name: 'KETA-1', q10: 3.1, q50: 4.2, q90: 6.8 }], byScenario: [{ label: 'field wavelet, model below 4 Hz', meanRmsPct: 7.4 }] } } },
    },
  },
};
const matrix = { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } };

test('the report carries the blind-well table and the impedance volumes', () => {
  const model = reportModel({ project, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  expect(model.inversion).toHaveLength(1);
  expect(model.inversion[0].rows[1]).toEqual(['KETA-4', '0.55', '12.5', '0.90', '3.0']);
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-06T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Impedance inversion: Keta 3D full stack/);
  expect(t).toMatch(/Model-based, run on the seismic worker on 2026-10-06/);
  expect(t).toMatch(/Impedance volumes: Keta AI model-based/);
  expect(t).toMatch(/elastic estimates/);
  expect(t).toMatch(/Inversion sensitivity: Keta 3D full stack/);
  expect(t).toMatch(/field wavelet, model below 4 Hz/);
  expect(t).toMatch(/10th, 50th and 90th percentiles across the scenarios/);
});

test('blind-well issues: poor correlation, large error, a result that leans on the model', () => {
  const issues = inversionIssues(blind, 'Keta 3D');
  expect(issues.map((i) => i.severity)).toEqual(['high', 'medium', 'low']);
  expect(issues.every((i) => /KETA-4/.test(i.title))).toBe(true);
  expect(inversionIssues([blind[0]], 'Keta 3D')).toEqual([]);
});

test('the report carries the property calibration and check', () => {
  const p = {
    ...blankProject(),
    properties: {
      ai1: {
        porosity: { calibration: { at: '2026-10-07T01:00:00Z', volumeName: 'Keta AI', result: { settings: { kind: 'porosity' }, summary: { a: 0.41, b: -3.4e-5, r2: 0.74, n: 600, s: 0.018 }, rows: [{ name: 'KETA-1', n: 150, rms: 0.021, corr: 0.82, coverage: 0.78 }] } }, runs: [{ name: 'Keta AI: porosity', status: 'ready' }] },
        facies: { calibration: { at: '2026-10-07T01:00:00Z', volumeName: 'Keta AI', result: { settings: { kind: 'facies' }, summary: { classes: [{ name: 'gas sand', n: 40, prior: 0.2, mean: 5900, sd: 300 }] }, rows: [{ name: 'KETA-1', n: 150, accuracy: 0.86 }] } } },
      },
    },
  };
  const model = reportModel({ project: p, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  expect(model.properties).toHaveLength(2);
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Porosity from Keta AI/);
  expect(t).toMatch(/porosity = 0\.4100 - 3\.400e-5 x AI/);
  expect(t).toMatch(/Facies check: Keta AI/);
  expect(t).toMatch(/fluid hypothesis/);
});

test('property issues: poor fit, miscalibrated interval, poor facies', () => {
  const { propertyIssues } = require('../services/propertyRun');
  const por = propertyIssues({ settings: { kind: 'porosity' }, rows: [{ name: 'W1', corr: 0.3, coverage: 0.4 }, { name: 'W2', corr: 0.9, coverage: 0.8 }] }, 'AI');
  expect(por.map((i) => i.severity)).toEqual(['high', 'medium']);
  const fac = propertyIssues({ settings: { kind: 'facies' }, rows: [{ name: 'W1', accuracy: 0.5 }, { name: 'W2', accuracy: 0.9 }] }, 'AI');
  expect(fac).toHaveLength(1);
});

test('the report carries the prospect QI assessment and each prospect\'s reasons', async () => {
  const { makeInMemoryBackend } = require('../services/inMemoryBackend');
  const { analyseProspect } = require('../services/prospects');
  const b = makeInMemoryBackend();
  const [s1, s2] = await b.listSurfaces();
  const depth = await b.loadSurface(s1); const attr = await b.loadSurface(s2, { attribute: true });
  const prospect = { id: 'p1', name: 'Keta Dome', target: 'SAND A', anomaly: { threshold: 0.5, sense: 'high' }, evidence: [{ name: 'RMS', source: 'full_stack' }, { name: 'AVO', source: 'avo' }], competing: [{ name: 'Tuning', status: 'open' }] };
  const result = analyseProspect({ depth, attr, prospect, feasibility: 'feasible' });
  const p = { ...blankProject(), targets: ['SAND A'], feasibility: { 'SAND A': { verdict: 'feasible' } }, prospects: [{ ...prospect, result }] };
  const model = reportModel({ project: p, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Prospect QI assessment/);
  expect(t).toMatch(/Keta Dome/);
  expect(t).toMatch(/open: Tuning/);
  expect(t).toMatch(/Prospect: Keta Dome/);
  expect(t).toMatch(/Competing explanations still open: Tuning/);
  expect(t).toMatch(/million m3 to spill/);
});

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
});

test('blind-well issues: poor correlation, large error, a result that leans on the model', () => {
  const issues = inversionIssues(blind, 'Keta 3D');
  expect(issues.map((i) => i.severity)).toEqual(['high', 'medium', 'low']);
  expect(issues.every((i) => /KETA-4/.test(i.title))).toBe(true);
  expect(inversionIssues([blind[0]], 'Keta 3D')).toEqual([]);
});

import { parseVelocityTable } from '../components/PrestackPanel';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject } from '../services/model';
import { readPdf, flat } from '@/lib/reportKit/testKit';

test('the velocity table reads rows of time and RMS velocity', () => {
  expect(parseVelocityTable('# t v\n0 1800\n2000, 2600\n')).toEqual({ t_ms: [0, 2000], vrms: [1800, 2600] });
  expect(parseVelocityTable('0 1800\n0 1900').error).toMatch(/increase/);
  expect(parseVelocityTable('').error).toMatch(/at least one row/);
  expect(parseVelocityTable('0 fast').error).toMatch(/Row 1/);
});

test('the report carries the angle stacks and the usable angle', () => {
  const p = { ...blankProject(), prestack: { d2: { name: 'Keta gathers', at: '2026-10-07T05:00:00Z', velocity: { t_ms: [0, 2000], vrms: [1800, 2600] }, result: { stacks: [{ name: 'near', from: 0, to: 15, traces: 40000 }, { name: 'far', from: 30, to: 45, traces: 39000 }], usable_angle: { q10: 31.5, q50: 38.2, q90: 42.9 } } } } };
  const model = reportModel({ project: p, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Angle stacks: Keta gathers/);
  expect(t).toMatch(/Walden straight-ray angles from an RMS velocity table of 2 rows/);
  expect(t).toMatch(/Q10 31\.5, Q50 38\.2, Q90 42\.9 degrees/);
});

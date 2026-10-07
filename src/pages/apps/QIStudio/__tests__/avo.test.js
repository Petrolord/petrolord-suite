import { avoProblem } from '../components/AvoPanel';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject } from '../services/model';
import { readPdf, flat } from '@/lib/reportKit/testKit';

test('the stack choices need two stacks, distinct, with angles 5 degrees apart', () => {
  expect(avoProblem([{ volumeId: 'a', angle: 10 }, { volumeId: '', angle: '' }])).toMatch(/at least two/);
  expect(avoProblem([{ volumeId: 'a', angle: 10 }, { volumeId: 'a', angle: 30 }])).toMatch(/different volume/);
  expect(avoProblem([{ volumeId: 'a', angle: 10 }, { volumeId: 'b', angle: 12 }])).toMatch(/5 degrees/);
  expect(avoProblem([{ volumeId: 'a', angle: 10 }, { volumeId: 'b', angle: 70 }])).toMatch(/0 to 50/);
  expect(avoProblem([{ volumeId: 'a', angle: 8 }, { volumeId: 'b', angle: 30 }])).toBeNull();
});

test('the report lists the AVO volumes', () => {
  const p = { ...blankProject(), avo: { runs: [{ name: 'Keta AVO', stacks: [{ name: 'near', angle: 8 }, { name: 'far', angle: 32 }], volumeIds: { A: 'a', B: 'b', FF: 'f' }, vsVp: 0.5, status: 'ready' }] } };
  const model = reportModel({ project: p, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/AVO volumes/);
  expect(t).toMatch(/near \(8 degrees\), far \(32 degrees\)/);
  expect(t).toMatch(/Smith and Gidlow/);
});

test('the report carries the AVO calibration at the wells', () => {
  const p = { ...blankProject(), avo: { runs: [], wells: { runName: 'Keta AVO', at: '2026-10-07T07:00:00Z', scale: 2, n: 1, agree: 1, wells: [{ name: 'KETA-1', modelled: { A: -0.05, B: -0.12 }, scaled: { A: -0.05, B: -0.12 }, modelledClass: 'III', observedClass: 'III', residual: 0 }, { name: 'AKOMA-2', error: 'No Rock Physics gather published for this well.' }] } } };
  const model = reportModel({ project: p, inventory: [], matrix: { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } }, issues: [], chosenVolumes: [], ready: [] });
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-07T12:00:00Z') }).doc).text);
  expect(t).toMatch(/AVO at the wells: Keta AVO/);
  expect(t).toMatch(/One least-squares scale \(2\.00\)/);
  expect(t).toMatch(/AKOMA-2/);
});

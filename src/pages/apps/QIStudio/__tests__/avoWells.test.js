import { wellPoints, compareAtWells, avoWellIssues } from '../services/avoWells';

const rows = [
  { name: 'W1', modelled: { A: -0.05, B: -0.12 }, observed: { A: -0.1, B: -0.24 } },
  { name: 'W2', modelled: { A: 0.04, B: -0.08 }, observed: { A: 0.081, B: -0.159 } },
  { name: 'W3', modelled: { A: -0.06, B: -0.1 }, observed: null },
];

test('one scale ties the volumes to the model; classes compared after scaling', () => {
  const c = compareAtWells(rows);
  expect(c.scale).toBeCloseTo(2, 1);
  expect(c.n).toBe(2);
  expect(c.wells[0]).toMatchObject({ modelledClass: 'III', observedClass: 'III', agree: true });
  expect(c.wells[0].residual).toBeLessThan(0.01);
  expect(c.wells[2].error).toBe('no observed value');
  expect(avoWellIssues(c)).toEqual([]);
});

test('negative control: the wrong polarity and a class that differs are issues', () => {
  const flipped = rows.map((r) => (r.observed ? { ...r, observed: { A: -r.observed.A, B: -r.observed.B } } : r));
  const c = compareAtWells(flipped);
  expect(c.scale).toBeLessThan(0);
  const shifted = compareAtWells([rows[0], { ...rows[1], observed: { A: -0.12, B: -0.16 } }]);
  const issues = [...avoWellIssues(c), ...avoWellIssues(shifted)];
  expect(issues.some((i) => /opposite polarity/.test(i.title))).toBe(true);
  expect(issues.some((i) => /class differs/.test(i.title))).toBe(true);
});

test('well points need a trace and a zone-top time', () => {
  expect(wellPoints([{ name: 'A', ok: true, il: 1, xl: 2, topTwt: 1500 }, { name: 'B', ok: true, il: 1, xl: 2, topTwt: null }, { name: 'C', ok: false }])).toEqual([{ name: 'A', il: 1, xl: 2, t_ms: 1500 }]);
});

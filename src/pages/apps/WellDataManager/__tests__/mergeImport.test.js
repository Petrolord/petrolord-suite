// LAS-into-existing-well merge planning (2026-09-03).
import { planMerge, resampleToGrid, sameGrid, nextFreeName, findDepthLog } from '../engine/mergeImport';

const f32 = (a) => Float32Array.from(a);
const prep = (depth, curves) => [
  { mnemonic: 'DEPT', unit: 'M', data: f32(depth), nSamples: depth.length, nullCount: 0, startMdM: depth[0], stopMdM: depth[depth.length - 1], stepM: depth[1] - depth[0], provenance: { source_file: 'a.las' } },
  ...Object.entries(curves).map(([m, d]) => ({ mnemonic: m, unit: 'X', data: f32(d), nSamples: d.length, nullCount: d.filter((v) => !Number.isFinite(v)).length, startMdM: depth[0], stopMdM: depth[depth.length - 1], stepM: depth[1] - depth[0], provenance: { source_file: 'a.las' } })),
];

describe('resampleToGrid', () => {
  test('interpolates linearly, keeps nulls, blanks outside the LAS interval', () => {
    const out = resampleToGrid(f32([100, 101, 102, 103]), f32([10, 20, NaN, 40]), f32([99.5, 100, 100.5, 101.5, 102.5, 103, 104]));
    expect(Array.from(out).map((v) => (Number.isNaN(v) ? 'nan' : +v.toFixed(3)))).toEqual(['nan', 10, 15, 'nan', 'nan', 40, 'nan']);
  });
  test('sameGrid tolerates a millimetre', () => {
    expect(sameGrid(f32([1, 2, 3]), f32([1, 2.0005, 3]))).toBe(true);
    expect(sameGrid(f32([1, 2, 3]), f32([1, 2.01, 3]))).toBe(false);
  });
});

describe('planMerge', () => {
  test('into a well with no depth: depth travels and curves pass through', () => {
    const plan = planMerge({ prepLogs: prep([1, 2, 3], { GR: [1, 2, 3] }), keep: { GR: true } });
    expect(plan.depthReused).toBe(false);
    expect(plan.logs.map((l) => l.mnemonic)).toEqual(['DEPT', 'GR']);
    expect(plan.errors).toEqual([]);
  });
  test('into a well with a depth: no second depth, curves resampled onto the well grid, renamed with provenance', () => {
    const existingDepth = { log: { id: 'd1', mnemonic: 'DEPT', start_md_m: 0, stop_md_m: 4, step_m: 0.5 }, data: f32([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]) };
    const plan = planMerge({
      prepLogs: prep([1, 2, 3], { A34H: [10, 20, 30], GR: [5, 5, 5] }),
      keep: { A34H: true, GR: false },
      names: { A34H: 'RESD' },
      existingLogs: [existingDepth.log],
      existingDepth,
    });
    expect(plan.depthReused).toBe(true);
    expect(plan.resampled).toBe(1);
    expect(plan.logs).toHaveLength(1);
    const r = plan.logs[0];
    expect(r.mnemonic).toBe('RESD');
    expect(r.nSamples).toBe(9);
    expect(Array.from(r.data).map((v) => (Number.isNaN(v) ? 'nan' : v))).toEqual(['nan', 'nan', 10, 15, 20, 25, 30, 'nan', 'nan']);
    expect(r.nullCount).toBe(4);
    expect(r.provenance).toMatchObject({ source_mnemonic: 'A34H', resampled_from: { n_samples: 3, depth_mnemonic: 'DEPT' } });
    expect(r.startMdM).toBe(0); expect(r.stepM).toBe(0.5);
    expect(plan.report.find((x) => x.mnemonic === 'DEPT').action).toBe('depth-resampled');
  });
  test('same grid passes samples through untouched', () => {
    const existingDepth = { log: { id: 'd1', mnemonic: 'DEPT', start_md_m: 1, stop_md_m: 3, step_m: 1 }, data: f32([1, 2, 3]) };
    const plan = planMerge({ prepLogs: prep([1, 2, 3], { GR: [7, 8, 9] }), keep: { GR: true }, existingLogs: [existingDepth.log], existingDepth });
    expect(plan.resampled).toBe(0);
    expect(Array.from(plan.logs[0].data)).toEqual([7, 8, 9]);
    expect(plan.logs[0].provenance.resampled_from).toBeUndefined();
  });
  test('name clashes: keep both with the next :n suffix, or replace (deletion planned)', () => {
    const existing = [{ id: 'g1', mnemonic: 'GR' }, { id: 'g2', mnemonic: 'GR:2' }, { id: 'r1', mnemonic: 'RT' }];
    const plan = planMerge({
      prepLogs: prep([1, 2], { GR: [1, 2], RT: [3, 4] }),
      keep: { GR: true, RT: true },
      onClash: { RT: 'replace' },
      existingLogs: existing,
    });
    expect(plan.logs.map((l) => l.mnemonic)).toEqual(['DEPT', 'GR:3', 'RT']);
    expect(plan.deletions).toEqual([existing[2]]);
    expect(plan.logs[2].provenance.replaced_log_id).toBe('r1');
    expect(plan.report.map((r) => r.action)).toEqual(['depth', 'add-suffixed', 'replace']);
    expect(nextFreeName('gr', ['GR', 'GR:2'])).toBe('gr:3');
  });
  test('bad names are errors, never guessed', () => {
    const p1 = planMerge({ prepLogs: prep([1, 2], { GR: [1, 2], SGR: [1, 2] }), keep: { GR: true, SGR: true }, names: { SGR: 'gr' } });
    expect(p1.errors[0]).toMatch(/Two curves would be saved as "gr"/);
    const p2 = planMerge({ prepLogs: prep([1, 2], { GR: [1, 2] }), keep: { GR: true }, names: { GR: '  ' } });
    expect(p2.errors[0]).toMatch(/needs a name/);
    expect(findDepthLog([{ mnemonic: 'GR' }, { mnemonic: 'depth' }]).mnemonic).toBe('depth');
  });
});

import { describeGridResult, reportableSkips } from '../services/gridStatus';
import { contourPlan } from '../components/MapCanvas';

const spec = { nx: 31, ny: 21 };

test('names the reference and unit, the placed wells and the grid', () => {
  const result = { points: [1, 2, 3, 4, 5], skipped: [{ well: 'X', reason: 'no_top' }], extrapolated: 0, depthRef: 'tvdss' };
  expect(describeGridResult({ name: 'Top Dome structure', result, spec, depthUnit: 'ft' }))
    .toBe('Gridded Top Dome structure (TVDSS elevation, ft) from 5 wells (31×21). Review, then Publish.');
});

test('lists only the wells the engine could not place, with the reason text, and counts extrapolated tops', () => {
  const result = {
    points: [1, 2, 3],
    skipped: [{ well: 'W4', reason: 'no_top' }, { well: 'KETA-7', reason: 'above_survey', detail: 'x' }, { well: 'KETA-8', reason: 'no_location' }],
    extrapolated: 2,
    depthRef: 'md',
  };
  expect(reportableSkips(result.skipped).map((s) => s.well)).toEqual(['KETA-7', 'KETA-8']);
  expect(describeGridResult({ name: 'Top A structure', result, spec, depthUnit: 'm' }))
    .toBe('Gridded Top A structure (MD elevation, m) from 3 wells (31×21). Skipped 2: KETA-7 (top above the survey), KETA-8 (no surface location). 2 tops below the last survey station follow the final tangent. Review, then Publish.');
});

test('attribute maps have no depth reference', () => {
  const result = { points: [1, 2, 3], skipped: [], extrapolated: 0, depthRef: null };
  expect(describeGridResult({ name: 'phi_avg attribute', result, spec })).toContain('(attribute)');
});

describe('contourPlan (MapCanvas)', () => {
  const grid = Float32Array.from([-1500, -1480, -1460, -1440]); // 60 m span = 196.9 ft
  test('automatic step is nice in the display unit and labels are integers', () => {
    const ft = contourPlan({ grid, typed: '', unit: 'ft' });
    expect(ft.stepDisp).toBe(20); // 196.9 ft / ~10 levels
    expect(ft.stepM).toBeCloseTo(20 * 0.3048, 9);
    expect(ft.format(-1500)).toBe('-4921');
    const m = contourPlan({ grid, typed: '', unit: 'm' });
    expect(m.stepDisp).toBe(10); // contourLevels rounds the 60 m span up to a 10 m step
    expect(m.format(-1480)).toBe('-1480');
  });
  test('a typed interval wins and converts to metres', () => {
    const p = contourPlan({ grid, typed: '25', unit: 'ft' });
    expect(p.stepM).toBeCloseTo(7.62, 9);
    expect(p.stepDisp).toBe(25);
  });
  test('attributes ignore the unit', () => {
    const p = contourPlan({ grid: Float32Array.from([0.1, 0.2, 0.3]), typed: '', unit: 'ft', isLength: false });
    expect(p.stepDisp).toBeCloseTo(0.05, 9);
    expect(p.format(0.2)).toBe('0.20');
  });
});

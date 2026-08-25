// WD3 survey logic: azimuth-reference chain, definitive composite,
// plan-vs-actual deltas and the project-ahead round trip. Expectations
// come from the validated engine (compile + path) or closed forms —
// never hardcoded from the implementation under test.

import {
  gridAzimuthDelta, toGridSurvey, compositeStations, computeActualTable,
  planVsActual, projectAhead, parseManualStations,
} from '../services/surveyUtils';
import { computeWellPath } from '../engine/surveyMath';
import { compileSegments } from '../engine/segmentCompiler';

const WB = {
  azimuth_reference: 'magnetic',
  grid_convergence_deg: -1.5,
  mag_declination_deg: 2.25,
};

describe('gridAzimuthDelta (the magnetic -> true -> grid chain)', () => {
  test('grid reference needs nothing and adds nothing', () => {
    expect(gridAzimuthDelta('grid', {})).toBe(0);
  });
  test('true adds the convergence, magnetic adds declination + convergence', () => {
    expect(gridAzimuthDelta('true', WB)).toBeCloseTo(-1.5, 9);
    expect(gridAzimuthDelta('magnetic', WB)).toBeCloseTo(2.25 - 1.5, 9);
  });
  test('missing cached angles fail loudly for non-grid references', () => {
    expect(() => gridAzimuthDelta('true', {})).toThrow();
    expect(() => gridAzimuthDelta('magnetic', { grid_convergence_deg: 1 })).toThrow();
  });
});

describe('toGridSurvey', () => {
  test('rotates azimuths by the chain delta and keeps md/inc', () => {
    const raw = [{ md: 0, inc: 0, azi: 0 }, { md: 100, inc: 20, azi: 359.5 }];
    const grid = toGridSurvey(raw, 'magnetic', WB);
    expect(grid[0].md).toBe(0);
    expect(grid[1].inc).toBe(20);
    expect(grid[1].azi).toBeCloseTo((359.5 + 0.75) % 360, 9);
  });
});

describe('compositeStations (deeper run wins from its tie-on down)', () => {
  const runA = { stations: [{ md: 0, inc: 0, azi: 0 }, { md: 500, inc: 5, azi: 10 }, { md: 1000, inc: 10, azi: 10 }] };
  const runB = { stations: [{ md: 800, inc: 9, azi: 12 }, { md: 1400, inc: 20, azi: 15 }] };

  test('overlap is resolved in favour of the deeper run', () => {
    const c = compositeStations([runB, runA]); // order-insensitive
    expect(c.map((s) => s.md)).toEqual([0, 500, 800, 1400]);
    expect(c[2].inc).toBe(9); // runB's tie-on, not runA's 1000 md station
  });

  test('single run passes through; short runs are ignored', () => {
    expect(compositeStations([runA]).length).toBe(3);
    expect(compositeStations([{ stations: [{ md: 0, inc: 0, azi: 0 }] }])).toEqual([]);
    expect(compositeStations([])).toEqual([]);
  });
});

describe('planVsActual', () => {
  const plan = [
    { md: 0, inc: 0, azi: 0 },
    { md: 500, inc: 0, azi: 0 },
    { md: 950, inc: 45, azi: 90 },
    { md: 1500, inc: 45, azi: 90 },
  ];

  test('a survey that follows the plan exactly has zero deltas', () => {
    const rows = planVsActual(plan, plan);
    expect(rows.length).toBe(plan.length);
    for (const r of rows) {
      expect(r.dInc).toBeCloseTo(0, 9);
      expect(r.dAzi).toBeCloseTo(0, 9);
      expect(r.sep3d).toBeCloseTo(0, 9);
    }
  });

  test('deltas equal the engine path difference at each actual MD', () => {
    const actual = [
      { md: 0, inc: 0, azi: 0 },
      { md: 500, inc: 2, azi: 80 },
      { md: 1200, inc: 40, azi: 95 },
    ];
    const rows = planVsActual(plan, actual);
    expect(rows.length).toBe(3);
    const actPath = computeWellPath(actual);
    // The vertical-hold part of the plan is trivially interpolable:
    // plan at md 500 is (0, 0, tvd 500).
    expect(rows[1].dN).toBeCloseTo(actPath[1].y, 9);
    expect(rows[1].dE).toBeCloseTo(actPath[1].x, 9);
    expect(rows[1].dTvd).toBeCloseTo(actPath[1].tvd - 500, 9);
    expect(rows[1].sep3d).toBeCloseTo(Math.hypot(actPath[1].x, actPath[1].y, actPath[1].tvd - 500), 9);
    // Azimuth wrap: dAzi is the signed short way.
    expect(rows[1].dAzi).toBeCloseTo(80 - 0, 6);
  });

  test('actual MDs beyond the plan range are skipped, not extrapolated', () => {
    const actual = [
      { md: 1400, inc: 45, azi: 90 },
      { md: 1800, inc: 45, azi: 90 },
    ];
    const rows = planVsActual(plan, actual);
    expect(rows.length).toBe(1);
    expect(rows[0].md).toBe(1400);
  });
});

describe('projectAhead (continuous-build round trip)', () => {
  test('the solved arc, compiled from the survey station, lands on the target', () => {
    const from = { md: 2000, inc: 30, azi: 40, n: 300, e: 250, tvd: 1800 };
    const target = { n: 900, e: 700, tvd: 2600 };
    const sol = projectAhead({ from, target, mdUnit: 'm' });
    expect(sol.feasible).toBe(true);
    expect(sol.landing.md).toBeCloseTo(from.md + sol.report.endMdDelta, 9);
    const { path } = compileSegments({
      mdUnit: 'm',
      tieOn: { md: from.md, inc: from.inc, azi: from.azi },
      segments: sol.segments,
    });
    const end = path[path.length - 1];
    const start = path[0];
    expect(end.y - start.y).toBeCloseTo(target.n - from.n, 6);
    expect(end.x - start.x).toBeCloseTo(target.e - from.e, 6);
    expect(end.tvd - start.tvd).toBeCloseTo(target.tvd - from.tvd, 6);
  });

  test('an over-DLS requirement is refused with the limit named', () => {
    const from = { md: 1000, inc: 0, azi: 0, n: 0, e: 0, tvd: 1000 };
    const target = { n: 500, e: 0, tvd: 1050 };
    const sol = projectAhead({ from, target, mdUnit: 'm', maxDls: 1 });
    expect(sol.feasible).toBe(false);
    expect(sol.error).toMatch(/exceeds/);
  });
});

describe('computeActualTable', () => {
  test('needs at least two stations, reports in metres', () => {
    expect(computeActualTable([{ md: 0, inc: 0, azi: 0 }])).toBeNull();
    const t = computeActualTable([
      { md: 0, inc: 0, azi: 0 }, { md: 400, inc: 0, azi: 0 },
    ], { kbM: 25 });
    expect(t[1].tvd).toBeCloseTo(400, 9);
    expect(t[1].tvdss).toBeCloseTo(375, 9);
  });
});

describe('parseManualStations', () => {
  test('parses whitespace and comma rows', () => {
    const s = parseManualStations('0 0 0\n500, 10, 45\n# comment\n900\t20\t50');
    expect(s).toEqual([
      { md: 0, inc: 0, azi: 0 },
      { md: 500, inc: 10, azi: 45 },
      { md: 900, inc: 20, azi: 50 },
    ]);
  });
  test('rejects bad rows with the line number', () => {
    expect(() => parseManualStations('0 0 0\nabc')).toThrow(/Line 2/);
    expect(() => parseManualStations('0 0 0\n500 200 0')).toThrow(/inclination/);
    expect(() => parseManualStations('500 0 0\n400 0 0')).toThrow(/does not increase/);
    expect(() => parseManualStations('0 0 0')).toThrow(/at least 2/);
  });
});

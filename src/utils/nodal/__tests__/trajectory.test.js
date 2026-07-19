import { buildTrajectory, tvdAtMd, angleAtMd } from '../trajectory';

describe('nodal trajectory', () => {
  test('vertical well is the identity', () => {
    const t = buildTrajectory({ mode: 'vertical', depthFt: 8500 });
    expect(t.tvdMax).toBe(8500);
    expect(tvdAtMd(t, 4000)).toBeCloseTo(4000, 12);
    expect(angleAtMd(t, 4000)).toBe(0);
  });

  test('straight tangent matches cos(inc) analytically', () => {
    // Constant 30 degrees from 0 md: TVD = MD cos(30).
    const t = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 30, azi: 0 },
        { md: 1000, inc: 30, azi: 0 },
        { md: 2000, inc: 30, azi: 0 },
      ],
    });
    expect(t.tvdMax).toBeCloseTo(2000 * Math.cos(Math.PI / 6), 6);
  });

  test('build section arc matches the minimum curvature circle', () => {
    // 0 to 90 degrees over 900 ft of MD in one station pair: quarter circle,
    // radius R = dMd / (pi/2), TVD = R sin(90) = 2 dMd / pi.
    const t = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 0, azi: 0 },
        { md: 900, inc: 90, azi: 0 },
      ],
    });
    expect(t.tvdMax).toBeCloseTo((2 * 900) / Math.PI, 6);
  });

  test('non-ascending stations are skipped with a warning', () => {
    const t = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 0, azi: 0 },
        { md: 1000, inc: 10, azi: 0 },
        { md: 900, inc: 20, azi: 0 },
      ],
    });
    expect(t.warnings.length).toBeGreaterThan(0);
    expect(t.mdMax).toBe(1000);
  });

  test('survey not starting at zero md is anchored at surface', () => {
    const t = buildTrajectory({
      mode: 'deviated',
      survey: [{ md: 2000, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }],
    });
    expect(t.points[0].md).toBe(0);
    expect(tvdAtMd(t, 3000)).toBeCloseTo(3000, 6);
  });
});

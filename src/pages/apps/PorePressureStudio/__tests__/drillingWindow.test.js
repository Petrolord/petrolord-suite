import { drillingWindow } from '../services/drillingWindow';
import { emwPpg } from '../services/units';

describe('drilling window (PP T1-E1)', () => {
  const z = [0, 1000, 2000, 3000];
  const params = { waterDepthM: 100, mudlineMdM: 0 };
  // PP hydrostatic-ish then overpressured; FG a fixed gradient above it
  const g = 9.80665;
  const pp = z.map((d) => 1030 * g * (d + 100) + (d >= 3000 ? 8e6 : 0));
  const fg = z.map((d) => 1800 * g * (d + 100));
  const profile = { porePressurePa: pp, fracPressurePa: fg };

  test('narrowest window is where the overpressure closes on the fracture gradient', () => {
    const w = drillingWindow(profile, z, params);
    expect(w.narrowest.zBmlM).toBe(3000);
    const ref = 3100;
    expect(w.narrowest.windowPpg).toBeCloseTo(emwPpg(fg[3], ref) - emwPpg(pp[3], ref), 10);
    expect(w.maxPp.zBmlM).toBe(3000);
  });

  test('the conductor section and the mudline are skipped; no profile gives nulls', () => {
    const w = drillingWindow(profile, z, params, 1500);
    expect(w.narrowest.zBmlM).toBeGreaterThanOrEqual(1500);
    expect(drillingWindow(profile, z, params, 0).narrowest.zBmlM).toBeGreaterThan(0);
    expect(drillingWindow(null, z, params)).toEqual({ narrowest: null, maxPp: null });
  });
});

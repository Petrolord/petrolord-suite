/**
 * Phase 5: Seismolord -> ReservoirCalc Pro handoff.
 *
 * The XYZ path is the handoff format; the deep-z null-filter fix in
 * SurfaceParser is what makes it honest — before it, every surface
 * deeper than 9,000 ft silently vanished on import.
 */
import { writeXYZ } from '@/lib/gridding/surfaceExport';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import { SurfaceParser } from '@/pages/apps/ReservoirCalcPro/services/SurfaceParser';

/** A deep dome: crest -11,000 ft — entirely below the old -9,000 cutoff. */
function deepDomeGrid() {
  const nx = 20;
  const ny = 16;
  const x = Array.from({ length: nx }, (_, c) => 500000 + c * 50);
  const y = Array.from({ length: ny }, (_, r) => 6700000 + r * 50);
  const z = new Float64Array(nx * ny);
  let live = 0;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const dx = x[c] - 500475;
      const dy = y[r] - 6700375;
      const r2 = dx * dx + dy * dy;
      if (Math.sqrt(r2) > 400) {
        z[r * nx + c] = NULL_VALUE;
      } else {
        z[r * nx + c] = -11000 - 0.008 * r2;
        live += 1;
      }
    }
  }
  return { x, y, z, nx, ny, live };
}

describe('SurfaceParser deep-z null filter fix', () => {
  test('isNullZ rejects sentinels and keeps deep depths', () => {
    expect(SurfaceParser.isNullZ(1.0e30)).toBe(true);
    expect(SurfaceParser.isNullZ(-9999)).toBe(true);
    expect(SurfaceParser.isNullZ(-9999.25)).toBe(true);
    expect(SurfaceParser.isNullZ(999.25)).toBe(true);
    expect(SurfaceParser.isNullZ(NaN)).toBe(true);
    expect(SurfaceParser.isNullZ(250000)).toBe(true);      // implausible magnitude

    expect(SurfaceParser.isNullZ(-12000)).toBe(false);     // deep-water horizon
    expect(SurfaceParser.isNullZ(-8999)).toBe(false);
    expect(SurfaceParser.isNullZ(-45000)).toBe(false);     // negated TWT ms
    expect(SurfaceParser.isNullZ(0)).toBe(false);
    expect(SurfaceParser.isNullZ(-998.7)).toBe(false);     // near a sentinel, not it
  });

  test('a dome deeper than 9,000 ft survives import (was silently emptied before)', async () => {
    const g = deepDomeGrid();
    const file = new File([writeXYZ(g)], 'deep_dome.xyz');
    const result = await SurfaceParser.parse(file);
    expect(result.points.length).toBe(g.live);
    const zs = result.points.map((p) => p.z);
    // nearest node to the analytic crest sits 25 m off-centre: -11010 ft
    expect(Math.max(...zs)).toBeCloseTo(-11010, 0);
    expect(Math.min(...zs)).toBeLessThan(-11010);
  });

  test('sentinel rows are still filtered from delimited files', async () => {
    const text = [
      'X Y Z',                       // parseDelimited treats row 1 as a header
      '100 200 -12000.5',
      '100 250 -9999.25',
      '100 300 -9999',
      '100 350 1.0000000E+30',
      '150 200 -12500.0',
      '150 250 -12750.0',
      '150 300 -13000.0',
    ].join('\n');
    const file = new File([text], 'mixed.xyz');
    const result = await SurfaceParser.parse(file);
    // 4 legitimate rows survive; -9999.25, -9999 and 1.0E+30 are dropped
    expect(result.points.length).toBe(4);
    expect(result.points.every((p) => p.z < -9000)).toBe(true);
  });
});

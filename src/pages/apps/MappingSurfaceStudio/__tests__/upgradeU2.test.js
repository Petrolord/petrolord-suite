// Mapping & Surface Studio upgrade Step 2 (2026-09-30): service tests, one
// block per item (docs/upgrade/MappingSurfaceStudio-UPGRADE.md). Every
// gate calls the shipped function; numeric items carry a negative control.
import { runGriddingSync } from '../services/gridSync';
import { blocksForPoints, nodeBlocksFor } from '../services/polygonTools';
import { isNull } from '@/lib/gridding/gridmath';

// a N-S fault at x = 500 with a 100 m throw; the east block is a polygon
const planeW = (x, y) => -1500 - 0.05 * x + 0.02 * y;
const planeE = (x, y) => planeW(x, y) - 100;
const eastBlock = [[500, -50], [1100, -50], [1100, 1100], [500, 1100]];
const spec = { x0: 0, y0: 0, dx: 25, dy: 25, nx: 41, ny: 41 };
const wellXY = [[60, 80], [300, 120], [420, 700], [150, 950], [260, 450], [380, 300], [620, 90], [900, 200], [760, 640], [980, 930], [560, 500], [840, 420]];
const wells = wellXY.map(([x, y]) => ({ x, y, z: x < 500 ? planeW(x, y) : planeE(x, y), well: `W${x}` }));

describe('MAP-U2-001: fault blocks with the spline in tension and kriging', () => {
  const nodeBlocks = nodeBlocksFor(spec, [eastBlock]);
  const pts = blocksForPoints(wells, [eastBlock]);
  const worst = (z) => {
    let m = 0;
    for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) {
      const v = z[r * spec.nx + c]; if (isNull(v)) continue;
      const x = c * spec.dx; const y = r * spec.dy;
      m = Math.max(m, Math.abs(v - (nodeBlocks[r * spec.nx + c] ? planeE(x, y) : planeW(x, y))));
    }
    return m;
  };
  test.each([
    ['blocked-tension', { tension: 0.5, smoothing: 0, maxExtrapolation: 1e9 }],
    ['blocked-kriging', { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, maxExtrapolation: 1e9 }],
  ])('%s keeps the 100 m throw as a step at the polygon edge', (method, opts) => {
    const g = runGriddingSync(method, pts, spec, { ...opts, nodeBlocks });
    expect(worst(g.z)).toBeLessThan(2e-3);
    expect(g.blockCount).toBe(2);
    // across the fault, one cell apart, the map steps by the throw
    const r = 20; const cW = 19; const cE = 20;
    expect(g.z[r * spec.nx + cW] - g.z[r * spec.nx + cE]).toBeGreaterThan(95);
  });
  test('negative control: the same wells without the polygon smear the throw', () => {
    const t = runGriddingSync('tension', wells, spec, { tension: 0.5, mask: 'none' });
    expect(worst(t.z)).toBeGreaterThan(20);
    const k = runGriddingSync('kriging', wells, spec, { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, mask: 'none', maxExtrapolation: 1e9 });
    expect(worst(k.z)).toBeGreaterThan(20);
  });
});

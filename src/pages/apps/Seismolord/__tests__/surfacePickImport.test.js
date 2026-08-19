/**
 * Import parsers vs the COMMITTED oracle goldens: parsing the dome
 * surface files reproduces the analytic dome grid (within each
 * dialect's decimal precision), and parsing the committed pick files
 * lands the exact live cells of the oracle's pick lattice. This is
 * the independent-oracle check — the engines repo only proves
 * parse(write(g)) round-trips.
 */
import fs from 'fs';
import path from 'path';

import {
  parseSurfaceFile, detectSurfaceFormat, surfaceGridStats,
} from '@/lib/gridding/surfaceImport';
import { parsePickFile, rowsToPickLattice } from '@/pages/apps/Seismolord/engine/pickImport';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');
const SURF_DIR = path.join(DATA_DIR, 'surfaces');
const PICKS_DIR = path.join(DATA_DIR, 'picks');

const meta = JSON.parse(fs.readFileSync(path.join(SURF_DIR, 'dome_surface_meta.json'), 'utf8'));

/** The analytic dome grid, float64, mirroring model.py surface_grid(). */
function analyticGrid() {
  const { nx, ny, x0, y0, dx, dy } = meta.grid;
  const k = meta.grv.k_ft_per_m2;
  const xc = x0 + ((nx - 1) * dx) / 2;
  const yc = y0 + ((ny - 1) * dy) / 2;
  const z = new Float64Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const r2 = (x0 + c * dx - xc) ** 2 + (y0 + r * dy - yc) ** 2;
      z[r * nx + c] = Math.sqrt(r2) > meta.hull_radius_m
        ? NULL_VALUE : meta.z_crest_ft - k * r2;
    }
  }
  return { nx, ny, x0, y0, dx, dy, z };
}

// tolerance = dialect decimal precision + float32 storage quantization
// (half-ulp ~2.4e-4 at |z| ~ 7000 ft — parsed grids are Float32Arrays)
const surfaceCases = [
  ['dome_surface.xyz', 'xyz', 5e-4],
  ['dome_surface_cps3.dat', 'cps3', 5e-4],
  ['dome_surface_zmap.dat', 'zmap', 1e-3],
  ['dome_surface_irap.dat', 'irap', 5e-4],
];

describe.each(surfaceCases)('%s parses back to the analytic dome', (file, fmt, tol) => {
  const text = fs.readFileSync(path.join(SURF_DIR, file), 'utf8');
  const truth = analyticGrid();

  test(`detected as ${fmt} and matches the grid spec`, () => {
    expect(detectSurfaceFormat(text)).toBe(fmt);
    const p = parseSurfaceFile(text);
    expect(p.format).toBe(fmt);
    expect(p.nx).toBe(truth.nx);
    expect(p.ny).toBe(truth.ny);
    expect(p.x0).toBeCloseTo(truth.x0, 4);
    expect(p.y0).toBeCloseTo(truth.y0, 4);
    expect(p.dx).toBeCloseTo(truth.dx, 4);
    expect(p.dy).toBeCloseTo(truth.dy, 4);
  });

  test('every node matches within the dialect precision, nulls exact', () => {
    const p = parseSurfaceFile(text);
    let checkedLive = 0;
    for (let i = 0; i < truth.z.length; i++) {
      if (Math.abs(truth.z[i]) > 1e29) {
        expect(Math.abs(p.z[i])).toBeGreaterThan(1e29);
      } else {
        expect(Math.abs(p.z[i] - truth.z[i])).toBeLessThanOrEqual(tol);
        checkedLive += 1;
      }
    }
    expect(checkedLive).toBe(meta.live_nodes);
    const stats = surfaceGridStats(p);
    expect(stats.live).toBe(meta.live_nodes);
    expect(stats.zMin).toBeCloseTo(meta.z_min_ft, 2);
    expect(stats.zMax).toBeCloseTo(meta.z_max_ft, 2);
  });
});

const pickCases = [
  ['dome_ieee_picks', 'dome_ieee_picks_charisma.txt', 'charisma'],
  ['dome_ieee_picks', 'dome_ieee_picks_ilxl.txt', 'ilxlxyz'],
  ['dome_ieee_picks', 'dome_ieee_picks.xyz', 'xyz'],
  ['dome_step_picks', 'dome_step_picks_charisma.txt', 'charisma'],
  ['dome_step_picks', 'dome_step_picks_ilxl.txt', 'ilxlxyz'],
  ['dome_step_picks', 'dome_step_picks.xyz', 'xyz'],
];

describe.each(pickCases)('%s: %s lands back on the oracle lattice', (base, file, fmt) => {
  const pmeta = JSON.parse(
    fs.readFileSync(path.join(PICKS_DIR, `${base}_meta.json`), 'utf8'));
  const raw = Buffer.from(pmeta.picks.base64, 'base64');
  const truth = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const g = pmeta.geometry;
  const geom = { nIl: g.n_il, nXl: g.n_xl, ns: 64 };
  const lines = { il0: g.il0, ilStep: g.il_step, xl0: g.xl0, xlStep: g.xl_step };
  const affine = {
    origin: pmeta.affine.origin,
    ilVec: pmeta.affine.il_vec,
    xlVec: pmeta.affine.xl_vec,
  };

  test('exact live cells, samples within the .4f z precision', () => {
    const { format, rows } = parsePickFile(
      fs.readFileSync(path.join(PICKS_DIR, file), 'utf8'));
    expect(format).toBe(fmt);
    expect(rows.length).toBe(pmeta.live_rows);
    // golden z is negative-down TWT ms -> sample = -z / dt
    const out = rowsToPickLattice(rows, geom, lines, affine, (z) => -z / g.dt_ms);
    expect(out.placed).toBe(pmeta.live_rows);
    expect(out.skipped).toBe(0);
    expect(out.collisions).toBe(0);
    const tol = 1e-4 / g.dt_ms + 1e-6;      // z printed with 4 decimals
    for (let c = 0; c < truth.length; c++) {
      if (truth[c] === NULL_F32) expect(out.picks[c]).toBe(NULL_F32);
      else expect(Math.abs(out.picks[c] - truth[c])).toBeLessThanOrEqual(tol);
    }
  });
});

// Saved geo_surfaces rows from earlier releases (MAP-U1 PL5), each with a
// small dome grid in the row's own units. The upgrade e2e seeds them into
// the harness (window.__MAP_SEED__) and opens every one; jest runs the
// export, caption and GRV paths on them.
// Run: node e2e/fixtures/map/saved/generate.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FT = 0.3048;
const FT_US = 1200 / 3937;
const dome = (xm, ym) => -1500 - 0.0001 * ((xm - 502000) ** 2 + (ym - 6700000) ** 2);
const grid = (spec, { zScale = 1, xyScale = 1, sign = 1, nullAt = null } = {}) => {
  const z = [];
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) {
    const i = r * spec.nx + c;
    if (nullAt === i) { z.push(1e30); continue; }
    z.push(Math.round((sign * dome((spec.x0 + c * spec.dx) * xyScale, (spec.y0 + r * spec.dy) * xyScale) / zScale) * 1000) / 1000);
  }
  return z;
};
const M = { x0: 501000, y0: 6699200, dx: 200, dy: 200, nx: 11, ny: 9 };
const row = (id, name, spec, extra) => ({ id, name, origin_x: spec.x0, origin_y: spec.y0, nx: spec.nx, ny: spec.ny, dx: spec.dx, dy: spec.dy, storage_path: `user-dev/${id}/grid.f32`, ...extra });
const pts = [{ well: 'KETA-1', x: 501400, y: 6699600, z: dome(501400, 6699600), md: 1530, extrapolated: false }, { well: 'KETA-3', x: 502600, y: 6700400, z: dome(502600, 6700400), md: 1560, extrapolated: false }];

const rows = [
  { release: 'G4 2026-07-13 Seismolord export (feet, no CRS, no display)', row: row('saved-g4', 'G4 Seismolord horizon', M, { kind: 'structure', z_domain: 'depth', z_unit: 'ft', provenance: { app: 'seismolord' }, created_at: '2026-07-13T10:00:00Z' }), grid: grid(M, { zScale: FT }) },
  { release: 'MS2 2026-09-05 imported CPS-3 in metres with a CRS', row: row('saved-ms2', 'MS2 imported CPS-3', M, { kind: 'structure', z_domain: 'depth', z_unit: 'm', crs: 'EPSG:32632', xy_unit: 'm', provenance: { engine: 'mapping-surface-studio', imported_from: { file_name: 'top.cps3.dat', format: 'cps3' }, z_convention: 'elevation' }, created_at: '2026-09-05T10:00:00Z' }), grid: grid(M, { nullAt: 0 }) },
  { release: 'MS5 2026-09-06 rotated Irap (30 deg)', row: row('saved-ms5-rot', 'MS5 rotated Irap', M, { kind: 'structure', z_domain: 'depth', z_unit: 'm', rotation_deg: 30, provenance: { imported_from: { file_name: 'rot.irap', format: 'irap' } }, created_at: '2026-09-06T10:00:00Z' }), grid: grid(M) },
  { release: 'MS5 2026-09-06 digitized surface (no CRS)', row: row('saved-ms5-dig', 'MS5 digitized contours', M, { kind: 'structure', z_domain: 'depth', z_unit: 'm', provenance: { app: 'contour-map-digitizer', image: 'scan.png', z_convention: 'elevation' }, created_at: '2026-09-06T11:00:00Z' }), grid: grid(M) },
  { release: 'T1 2026-09-26 re-gridded top map with display, points, tension, a kept previous grid', row: row('saved-t1', 'T1 Top Dome structure', M, { kind: 'structure', z_domain: 'depth', z_unit: 'm', crs: 'EPSG:32632', xy_unit: 'm', provenance: { source: { type: 'top', key: 'Top Dome' }, depth_ref: 'tvdss', cell_m: 200, method: 'tension', control_points: 2, points: pts, display: { contourStep: '50', colormap: 'structure', labels: true, legend: true, north: true, scaleBar: true }, history: [{ replaced_at: '2026-09-26T12:00:00Z', archive_path: 'user-dev/saved-t1/grid.prev-1.f32', previous: { nx: 6, ny: 5, dx: 400, dy: 400, origin_x: 501000, origin_y: 6699200, z_unit: 'm', z_domain: 'depth', kind: 'structure' } }] }, created_at: '2026-09-26T12:00:00Z' }), grid: grid(M) },
  { release: 'T1 2026-09-26 MD map (attribute, no unit)', row: row('saved-t1-md', 'T1 Top Dome MD (measured depth, m)', M, { kind: 'attribute', z_domain: 'attribute', z_unit: null, provenance: { source: { type: 'top', key: 'Top Dome' }, depth_ref: 'md', cell_m: 200 }, created_at: '2026-09-26T13:00:00Z' }), grid: grid(M, { sign: -1 }) },
  { release: 'U1 2026-09-30 state-plane frame in US survey feet', row: row('saved-u1-ftus', 'U1 state plane structure', { x0: 501000 / FT_US, y0: 6699200 / FT_US, dx: 200 / FT_US, dy: 200 / FT_US, nx: 11, ny: 9 }, { kind: 'structure', z_domain: 'depth', z_unit: 'ft', crs: 'EPSG:2274', xy_unit: 'ftUS', provenance: { imported_from: { file_name: 'sp.irap', format: 'irap' } }, created_at: '2026-09-30T10:00:00Z' }), grid: grid({ x0: 501000 / FT_US, y0: 6699200 / FT_US, dx: 200 / FT_US, dy: 200 / FT_US, nx: 11, ny: 9 }, { xyScale: FT_US, zScale: FT }) },
];
writeFileSync(join(here, 'surfaces.json'), `${JSON.stringify({ note: 'geo_surfaces rows by release; grid in the row z_unit, row-major south first', surfaces: rows }, null, 1)}\n`);

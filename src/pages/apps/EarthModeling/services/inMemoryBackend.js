// In-memory backend for the /dev/earth-modeling harness and jest: the
// full Earth Modeling app drivable without auth or DB. Seeds the
// analytic oracle fixture (services/fixture.js) — three structural
// surfaces on the goldens' model frame, four wells with tops / zones /
// planar properties — so Playwright asserts the oracle's numbers off
// the rendered UI. Same interface as registryBackend.

import { MODEL_SPEC, planeGrid, fixtureWells, FAULT_POLYGON } from './fixture';
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

export function makeInMemoryBackend() {
  const wells = fixtureWells();
  const surfaces = [];
  const gridStore = new Map();
  const projects = [];
  let depthUnit = null; // EM0: unset in the harness, the app falls back to its default

  for (const name of ['TopA', 'TopB', 'BaseB']) {
    const id = nid('surf');
    // the fixture planes are positive-down like the engine; the registry
    // stores elevation, so the seed converts the way a publish would
    gridStore.set(id, depthDownToSurfaceZ(planeGrid(name)));
    surfaces.push({
      id, user_id: 'user-dev', organization_id: null, is_own: true,
      name, kind: 'structure',
      origin_x: MODEL_SPEC.x0, origin_y: MODEL_SPEC.y0,
      nx: MODEL_SPEC.nx, ny: MODEL_SPEC.ny, dx: MODEL_SPEC.dx, dy: MODEL_SPEC.dy,
      z_domain: 'depth', z_unit: 'm', provenance: { fixture: true },
      storage_path: `user-dev/${id}/grid.f32`,
      created_at: new Date(2026, 6, 14, 9, 0, seq).toISOString(),
    });
  }

  // EM3: a synthetic GR per fixture well (10 m samples to TD), a sand
  // body below 1500 m MD so the section's cut-off fill has something to show
  const grOf = (w) => {
    const td = Math.max(...(w.deviation || []).map((d) => d.md), 1500);
    const n = Math.floor(td / 10) + 1;
    const dept = new Float32Array(n); const gr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const md = i * 10;
      dept[i] = md;
      gr[i] = md > 1500 && md < 1620 ? 35 + 10 * Math.sin(md / 15) : 95 + 20 * Math.sin(md / 40);
    }
    return { DEPT: dept, GR: gr };
  };
  const curvesByWell = new Map(wells.map((w) => [w.id, grOf(w)]));

  return {
    async listWells() { return wells.map((w) => ({ ...w })); },
    async listLogs(wellId) {
      const c = curvesByWell.get(wellId) || {};
      return Object.keys(c).map((mnemonic) => ({ id: `${wellId}-log-${mnemonic}`, well_id: wellId, mnemonic, unit: mnemonic === 'GR' ? 'API' : 'm', n_samples: c[mnemonic].length, storage_path: `dev/${wellId}/${mnemonic}.f32` }));
    },
    async downloadCurve(log) {
      const c = curvesByWell.get(log.well_id);
      if (!c?.[log.mnemonic]) throw new Error(`No curve data for ${log.mnemonic}.`);
      return c[log.mnemonic];
    },
    async listSurfaces() { return [...surfaces]; },
    async downloadSurfaceGrid(surface) {
      const g = gridStore.get(surface.id);
      if (!g) throw new Error(`No grid data for ${surface.name}.`);
      return g;
    },
    async saveSurface(s) {
      if (s.grid.length !== s.spec.nx * s.spec.ny) throw new Error('Grid length does not match nx*ny.');
      const id = nid('surf');
      gridStore.set(id, s.grid instanceof Float32Array ? s.grid : Float32Array.from(s.grid));
      const row = {
        id, user_id: 'user-dev', organization_id: null, is_own: true,
        name: s.name, kind: s.kind || 'structure',
        origin_x: s.spec.x0, origin_y: s.spec.y0, nx: s.spec.nx, ny: s.spec.ny, dx: s.spec.dx, dy: s.spec.dy,
        z_domain: s.zDomain || 'depth', z_unit: s.zUnit ?? 'm', crs_note: s.crsNote || null,
        provenance: s.provenance || {}, storage_path: `user-dev/${id}/grid.f32`,
        created_at: new Date(2026, 6, 14, 12, 0, seq).toISOString(),
      };
      surfaces.push(row);
      return row;
    },
    // fault polygons drawn in Mapping (geo_culture kind fault_polygon,
    // MS5): the fixture's L-shaped fault, so adding it reproduces the
    // goldens' two-block census without drawing
    async listFaultPolygons() {
      return [{ id: 'cult-fault-dev', name: 'Fixture fault (Mapping)', vertices: FAULT_POLYGON.map(([x, y]) => [x, y]), is_own: true, source: 'geo_culture' }];
    },
    // EM0: a boundary polygon (geo_culture kind boundary) over the
    // western 60% of the frame, so clipping changes the census
    async listBoundaries() {
      const { x0, y0, dx, dy, nx, ny } = MODEL_SPEC;
      const xw = x0 + 0.6 * (nx - 1) * dx;
      const yn = y0 + (ny - 1) * dy;
      return [{ id: 'cult-lease-dev', name: 'Fixture lease (Mapping)', vertices: [[x0 - 1, y0 - 1], [xw, y0 - 1], [xw, yn + 1], [x0 - 1, yn + 1]], is_own: true, source: 'geo_culture' }];
    },
    async getDepthUnit() { return depthUnit; },
    async setDepthUnit(u) { if (!['m', 'ft'].includes(u)) throw new Error(`Depth unit must be m or ft, got "${u}".`); depthUnit = u; return u; },
    async listProjects() { return projects.map((p) => ({ ...p })); },
    async saveProject(p) {
      const row = { id: nid('emp'), name: p.name, definition: p.definition, updated_at: new Date(2026, 6, 14, 12, 0, seq).toISOString() };
      projects.push(row);
      return { ...row };
    },
    async updateProject(id, patch) {
      const row = projects.find((p) => p.id === id);
      if (!row) throw new Error('Model not found.');
      Object.assign(row, patch, { updated_at: new Date(2026, 6, 14, 13, 0, seq).toISOString() });
      return { ...row };
    },
    async deleteProject(id) {
      const i = projects.findIndex((p) => p.id === id);
      if (i >= 0) projects.splice(i, 1);
    },
  };
}

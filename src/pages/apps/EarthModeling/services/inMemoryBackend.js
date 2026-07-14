// In-memory backend for the /dev/earth-modeling harness and jest: the
// full Earth Modeling app drivable without auth or DB. Seeds the
// analytic oracle fixture (services/fixture.js) — three structural
// surfaces on the goldens' model frame, four wells with tops / zones /
// planar properties — so Playwright asserts the oracle's numbers off
// the rendered UI. Same interface as registryBackend.

import { MODEL_SPEC, planeGrid, fixtureWells } from './fixture';

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

export function makeInMemoryBackend() {
  const wells = fixtureWells();
  const surfaces = [];
  const gridStore = new Map();
  const projects = [];

  for (const name of ['TopA', 'TopB', 'BaseB']) {
    const id = nid('surf');
    gridStore.set(id, planeGrid(name));
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

  return {
    async listWells() { return wells.map((w) => ({ ...w })); },
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

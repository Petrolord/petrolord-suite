// In-memory backend for the /dev/mapping-surface-studio harness and
// jest: the mapping app drivable without auth or DB. Seeds a handful
// of wells with tops (structure-map control points) so the e2e can
// grid "Top Dome" across them and contour it. Surfaces start empty —
// the user grids and publishes; a seeded org-shared read-only surface
// exercises the owner-only guards. Same interface as registryBackend.

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

const SAMPLE_WELLS = [
  { name: 'KETA-1', x: 501000, y: 6700200, tops: { 'Top Dome': 1500, 'Base Sand': 1660 }, phi: 0.20 },
  { name: 'KETA-2', x: 502400, y: 6700600, tops: { 'Top Dome': 1560, 'Base Sand': 1705 }, phi: 0.25 },
  { name: 'KETA-3', x: 503500, y: 6700400, tops: { 'Top Dome': 1470, 'Base Sand': 1612 }, phi: 0.30 },
  { name: 'KETA-4', x: 502000, y: 6699400, tops: { 'Top Dome': 1520, 'Base Sand': 1640 }, phi: 0.22 },
];

export function makeInMemoryBackend() {
  const wells = SAMPLE_WELLS.map((w, i) => ({
    id: `map-w${i + 1}`,
    user_id: 'user-dev',
    organization_id: null,
    is_own: true,
    name: w.name,
    surface_x: w.x,
    surface_y: w.y,
    tops: Object.entries(w.tops).map(([name, md], ti) => ({ id: `map-w${i + 1}-t${ti}`, name, md_m: md })),
    zones: [{ name: 'Reservoir', properties: { phi_avg: w.phi } }],
  }));

  const surfaces = [];
  const gridStore = new Map(); // surface id -> Float32Array

  // seed one org-shared read-only surface (flat-ish grid)
  const sharedId = nid('surf');
  const sharedGrid = new Float32Array(6 * 6).fill(1550);
  gridStore.set(sharedId, sharedGrid);
  surfaces.push({
    id: sharedId, user_id: 'user-other', organization_id: 'org-dev', is_own: false,
    name: 'Regional Top (org shared)', kind: 'structure',
    origin_x: 500800, origin_y: 6699200, nx: 6, ny: 6, dx: 500, dy: 300,
    z_domain: 'depth', z_unit: 'm', provenance: { shared: true },
    storage_path: `user-other/${sharedId}/grid.f32`,
    created_at: new Date(2026, 0, 10).toISOString(),
  });

  const ownSurface = (surface, what) => {
    const s = surfaces.find((x) => x.id === surface.id);
    if (!s) throw new Error('Surface not found.');
    if (!s.is_own) throw new Error(`Only the owner can ${what} this surface (org sharing is read-only).`);
    return s;
  };

  return {
    async listWells() { return wells.map((w) => ({ ...w })); },
    async listSurfaces() {
      return [...surfaces].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    async downloadSurfaceGrid(surface) {
      const g = gridStore.get(surface.id);
      if (!g) throw new Error(`No grid data for ${surface.name}.`);
      return g;
    },
    async saveSurface(s) {
      if (s.grid.length !== s.spec.nx * s.spec.ny) throw new Error('Grid length does not match nx*ny.');
      const id = nid('surf');
      gridStore.set(id, s.grid);
      const row = {
        id, user_id: 'user-dev', organization_id: null, is_own: true,
        name: s.name, kind: s.kind || 'structure',
        origin_x: s.spec.x0, origin_y: s.spec.y0, nx: s.spec.nx, ny: s.spec.ny, dx: s.spec.dx, dy: s.spec.dy,
        z_domain: s.zDomain || 'depth', z_unit: s.zUnit || null, crs_note: s.crsNote || null,
        provenance: s.provenance || {}, storage_path: `user-dev/${id}/grid.f32`,
        created_at: new Date(2026, 6, 13, 12, 0, seq).toISOString(),
      };
      surfaces.push(row);
      return row;
    },
    async deleteSurface(surface) {
      ownSurface(surface, 'delete');
      const i = surfaces.findIndex((x) => x.id === surface.id);
      surfaces.splice(i, 1);
      gridStore.delete(surface.id);
    },
  };
}

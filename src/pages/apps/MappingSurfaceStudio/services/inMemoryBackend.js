// In-memory backend for the /dev/mapping-surface-studio harness and
// jest: the mapping app drivable without auth or DB. Seeds five wells
// with tops (structure-map control points): four vertical, KETA-2 on
// the Well Correlation harness survey and KETA-5 on the structure-map
// golden's build-and-hold survey, so the depth frame is exercised.
// Surfaces start with one org-shared read-only row (elevation, the
// registry convention); the user grids and publishes the rest. Same
// interface as registryBackend.

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

/** Build-and-hold survey: KOP `kop`, `rate` deg per 30 m to `hold` deg,
 *  straight to `td` at `azi` (the oracle's BuildHold, stations every
 *  30 m through the build). */
export function buildHoldStations({ kop = 500, rate = 4, hold = 40, td = 3000, azi = 135 } = {}) {
  const st = [{ md: 0, inc: 0, azi }, { md: kop, inc: 0, azi }];
  for (let i = 1; i <= Math.round(hold / rate); i++) st.push({ md: kop + 30 * i, inc: rate * i, azi });
  st.push({ md: td, inc: hold, azi });
  return st;
}

const KB = 30;
const SAMPLE_WELLS = [
  { name: 'KETA-1', x: 501000, y: 6700200, td: 1800, tops: { 'Top Dome': 1500, 'Base Sand': 1660 }, phi: 0.20, ntg: 0.72 },
  { name: 'KETA-2', x: 502200, y: 6700600, td: 1750, tops: { 'Top Dome': 1560, 'Base Sand': 1705 }, phi: 0.25, ntg: 0.65,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }] },
  { name: 'KETA-3', x: 503500, y: 6700400, td: 1800, tops: { 'Top Dome': 1470, 'Base Sand': 1612 }, phi: 0.30, ntg: 0.80 },
  { name: 'KETA-4', x: 502000, y: 6699400, td: 1800, tops: { 'Top Dome': 1520, 'Base Sand': 1640 }, phi: 0.22, ntg: 0.70 },
  { name: 'KETA-5', x: 501200, y: 6699800, td: 3000, tops: { 'Top Dome': 1700, 'Base Sand': 1900 }, phi: 0.18, ntg: 0.60,
    deviation: buildHoldStations() },
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
    kb_m: KB,
    td_md_m: w.td,
    deviation: w.deviation || [],
    tops: Object.entries(w.tops).map(([name, md], ti) => ({ id: `map-w${i + 1}-t${ti}`, name, md_m: md })),
    // zones named after their top, the PT4 default
    zones: [{ name: 'Top Dome', top_md_m: w.tops['Top Dome'], base_md_m: w.tops['Base Sand'], properties: { phi_avg: w.phi, ntg: w.ntg } }],
  }));

  const surfaces = [];
  const gridStore = new Map(); // surface id -> Float32Array
  const culture = [];
  const featureStore = new Map(); // culture id -> features

  // MS3: one own TWT surface to convert (a dome in time, positive ms)
  const twtId = nid('surf');
  const twtSpec = { x0: 500600, y0: 6699200, nx: 16, ny: 11, dx: 200, dy: 200 };
  const twt = new Float32Array(twtSpec.nx * twtSpec.ny);
  for (let r = 0; r < twtSpec.ny; r++) {
    for (let c = 0; c < twtSpec.nx; c++) {
      const x = twtSpec.x0 + c * twtSpec.dx - 502100;
      const y = twtSpec.y0 + r * twtSpec.dy - 6700200;
      twt[r * twtSpec.nx + c] = 1400 + 0.00012 * (x * x + y * y); // ms, crest 1400 at the centre
    }
  }
  gridStore.set(twtId, twt);
  surfaces.push({
    id: twtId, user_id: 'user-dev', organization_id: null, is_own: true,
    name: 'Dome TWT', kind: 'structure',
    origin_x: twtSpec.x0, origin_y: twtSpec.y0, nx: twtSpec.nx, ny: twtSpec.ny, dx: twtSpec.dx, dy: twtSpec.dy,
    z_domain: 'time', z_unit: 'ms', provenance: { app: 'seismolord', horizon: { name: 'Dome' }, domain: 'twt_ms' },
    storage_path: `user-dev/${twtId}/grid.f32`,
    created_at: new Date(2026, 0, 12).toISOString(),
  });

  // seed one org-shared read-only surface (flat-ish grid, elevation)
  const sharedId = nid('surf');
  const sharedGrid = new Float32Array(6 * 6).fill(-1550);
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
        crs: s.crs || null, xy_unit: s.xyUnit || null,
        provenance: s.provenance || {}, storage_path: `user-dev/${id}/grid.f32`,
        created_at: new Date(2026, 6, 13, 12, 0, seq).toISOString(),
      };
      surfaces.push(row);
      return row;
    },
    async updateSurface(id, patch) {
      const s = ownSurface({ id }, 'edit');
      Object.assign(s, patch, { updated_at: new Date(2026, 6, 13, 13, 0, seq).toISOString() });
      return { ...s };
    },
    async replaceSurfaceGrid(surface, p) {
      const s = ownSurface(surface, 're-grid');
      if (p.grid.length !== p.spec.nx * p.spec.ny) throw new Error('Grid length does not match nx*ny.');
      gridStore.set(s.id, p.grid);
      Object.assign(s, {
        kind: p.kind || s.kind,
        origin_x: p.spec.x0, origin_y: p.spec.y0, nx: p.spec.nx, ny: p.spec.ny, dx: p.spec.dx, dy: p.spec.dy,
        z_domain: p.zDomain || s.z_domain, z_unit: p.zUnit === undefined ? s.z_unit : p.zUnit,
        crs: p.crs === undefined ? s.crs : p.crs, xy_unit: p.xyUnit === undefined ? s.xy_unit : p.xyUnit,
        provenance: p.provenance || s.provenance,
        updated_at: new Date(2026, 6, 13, 14, 0, seq).toISOString(),
      });
      return { ...s };
    },
    async deleteSurface(surface) {
      ownSurface(surface, 'delete');
      const i = surfaces.findIndex((x) => x.id === surface.id);
      surfaces.splice(i, 1);
      gridStore.delete(surface.id);
    },
    async setSurfaceShared(surface, shared) {
      const s = ownSurface(surface, 'share');
      s.organization_id = shared ? 'org-dev' : null;
      return { ...s };
    },
    // culture / GIS layers (W1.3): one demo block so the harness can
    // exercise the overlay without auth/DB; file import stays
    // registry-only, drawn polygons (MS3) save here
    async listCulture() {
      return [{
        id: 'cult-dev',
        name: 'Demo license block',
        kind: 'license_block',
        geometry_type: 'polygon',
        feature_count: 1,
        style: { color: '#f59e0b', weight: 1 },
        crs: null,
        is_own: true,
        organization_id: null,
      }, ...culture.map((c) => ({ ...c }))];
    },
    async downloadCultureFeatures(row) {
      if (row?.id && featureStore.has(row.id)) return featureStore.get(row.id);
      return [{
        type: 'polygon',
        rings: [[[500600, 6699000], [503600, 6699000], [503600, 6701000], [500600, 6701000], [500600, 6699000]]],
        props: { NAME: 'OML-DEV' },
        label: 'OML-DEV',
      }];
    },
    async saveCulture(c) {
      const id = nid('cult');
      featureStore.set(id, c.features);
      const row = {
        id, user_id: 'user-dev', organization_id: null, is_own: true,
        name: c.name, kind: c.kind || 'other', geometry_type: c.geometryType || 'mixed',
        feature_count: c.features.length, style: c.style || {}, crs: c.crs || null, xy_unit: c.xyUnit || null,
        bbox: c.bbox || null, provenance: c.provenance || {}, storage_path: `user-dev/${id}/features.json`,
        created_at: new Date(2026, 6, 13, 15, 0, seq).toISOString(),
      };
      culture.push(row);
      return { ...row };
    },
    async updateCulture(id, patch) {
      const c = culture.find((x) => x.id === id);
      if (!c) throw new Error('Polygon not found.');
      Object.assign(c, patch);
      return { ...c };
    },
    async deleteCulture(row) {
      const i = culture.findIndex((x) => x.id === row.id);
      if (i < 0) throw new Error('Only the owner can delete this layer (org sharing is read-only).');
      culture.splice(i, 1);
      featureStore.delete(row.id);
    },
    canImportCulture: false,
    // MS3 time-to-depth: a linear model and a layer cake (refused)
    async listVelocityModels() {
      return [
        { id: 'vol-dev', name: 'KETA 3D (v0 2000, k 0.3)', kind: 'linear', velocity: { v0: 2000, k: 0.3 } },
        { id: 'vol-lc', name: 'KETA 3D layer cake', kind: 'layercake', velocity: { type: 'layercake', layers: [{ v0: 1800, k: 0.2, base_horizon_id: 'h1' }, { v0: 2400, k: 0.1 }] } },
      ];
    },
  };
}

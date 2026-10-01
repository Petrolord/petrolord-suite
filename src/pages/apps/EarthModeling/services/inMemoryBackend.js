// In-memory backend for the /dev/earth-modeling harness and jest: the
// full Earth Modeling app drivable without auth or DB. Seeds the
// analytic oracle fixture (services/fixture.js) — three structural
// surfaces on the goldens' model frame, four wells with tops / zones /
// planar properties — so Playwright asserts the oracle's numbers off
// the rendered UI. Same interface as registryBackend.

import { MODEL_SPEC, planeGrid, fixtureWells, FAULT_POLYGON, seismicFaultFixture } from './fixture';
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';
import { SAVED_MODELS, resolveSavedModel } from './savedFixtures';
import { faultToModelObjects } from '@/lib/seismicFaultsReader';

// Seismolord U2-003: a seismic volume over the model frame (50 m bins,
// V0 2000 m/s) and one interpreted fault, three sticks dipping east from
// crossline 10 at 800 ms to crossline 14 at 1,600 ms. At its mid level
// (1,200 ms) the fault crosses x = 1600 from south to north, so its
// hanging-wall block is the eastern half of the frame.
export const SEISMIC_FIXTURE = {
  volume: {
    id: 'vol-em', name: 'EM fixture 3D', crs: null,
    survey_meta: {
      il: { min: 1, step: 1, count: 20 }, xl: { min: 1, step: 1, count: 25 }, ns: 600, dt_us: 4000,
      affine: { origin: { x: 1000, y: 2000 }, il_vec: { x: 0, y: 50 }, xl_vec: { x: 50, y: 0 } },
    },
    velocity_model: { kind: 'linear', v0: 2000, k: 0 },
  },
  fault: {
    id: 'sf-east', name: 'F-East (Seismolord)', volume_id: 'vol-em',
    sticks: [2, 10, 18].map((il) => ({ points: [{ il, xl: 10, s: 200 }, { il, xl: 12, s: 300 }, { il, xl: 14, s: 400 }] })),
    surface: null,
  },
};

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

/**
 * @param {{savedModels?: boolean, propertyMaps?: boolean}} [opts] savedModels seeds one saved
 *   model per release (U1, PL5); propertyMaps seeds zone A's Petrophysics net pay and HCPV
 *   maps as Mapping grids them (U2-008)
 */
export function makeInMemoryBackend({ savedModels = false, propertyMaps = false } = {}) {
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

  // U2-008: zone A's net pay is 70% of its vertical thickness (TopB - TopA =
  // 30 + 0.01 (x - 1000) m) and its HCPV thickness is net x 0.22 x 0.7
  if (propertyMaps) {
    const { x0, y0, dx, dy, nx, ny } = MODEL_SPEC;
    const net = new Float32Array(nx * ny); const hcpv = new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const t = 30 + 0.01 * (c * dx);
      net[r * nx + c] = 0.7 * t; hcpv[r * nx + c] = 0.7 * t * 0.22 * 0.7;
    }
    for (const [name, key, g] of [['A net pay (TVT)', 'net_tvt_m', net], ['A HCPV (TVT)', 'hcpv_tvt_m', hcpv]]) {
      const id = nid('surf');
      gridStore.set(id, g);
      surfaces.push({
        id, user_id: 'user-dev', organization_id: null, is_own: true, name, kind: 'attribute',
        origin_x: x0, origin_y: y0, nx, ny, dx, dy, z_domain: 'attribute', z_unit: 'm', crs: null, xy_unit: 'm',
        provenance: { source: { type: 'zone', zoneName: 'A', key } }, storage_path: `user-dev/${id}/grid.f32`,
        created_at: new Date(2026, 9, 1, 9, 0, seq).toISOString(),
      });
    }
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

  if (savedModels) {
    for (const m of SAVED_MODELS) {
      const r = resolveSavedModel(m, surfaces);
      projects.push({ id: nid('emp'), name: r.name, definition: r.definition, updated_at: new Date(2026, 6, 14, 12, 0, seq).toISOString() });
    }
  }

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
        rotation_deg: s.spec.rotation_deg || 0,
        z_domain: s.zDomain || 'depth', z_unit: s.zUnit ?? 'm', crs_note: s.crsNote || null,
        crs: s.crs || null, xy_unit: s.xyUnit || null,
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
    // Seismolord U2-003: faults read through the shared reader contract, plus
    // (U2-001) a 60 degree fault with depth rails over the whole frame and a
    // time-only one, so the per-zone path and its refusal can be driven
    async listSeismicFaults() {
      const obj = faultToModelObjects(SEISMIC_FIXTURE.fault, SEISMIC_FIXTURE.volume);
      const time = { ...seismicFaultFixture(), id: 'sf-time', name: 'F-Time (Seismolord)' };
      time.surface = time.surface.map((r) => r.map((p) => ({ ...p, depthM: null })));
      time.sticks = time.surface;
      return { faults: [...(obj.error ? [] : [obj]), seismicFaultFixture(), time], skipped: obj.error ? [{ name: obj.name, reason: obj.error }] : [] };
    },
    // EM0: a boundary polygon (geo_culture kind boundary) over the
    // western 60% of the frame, so clipping changes the census
    isSample: true, // T1: the empty-state sample link hides itself on sample data
    async listBoundaries() {
      const { x0, y0, dx, dy, nx, ny } = MODEL_SPEC;
      const xw = x0 + 0.6 * (nx - 1) * dx;
      const yn = y0 + (ny - 1) * dy;
      return [{ id: 'cult-lease-dev', name: 'Fixture lease (Mapping)', vertices: [[x0 - 1, y0 - 1], [xw, y0 - 1], [xw, yn + 1], [x0 - 1, yn + 1]], is_own: true, source: 'geo_culture' }];
    },
    // U2-002: one sample SCAL Studio project (inputs_data, schema 1), the
    // Petrophysics harness sample: Leverett J a 0.25, b 1.4, Swirr 0.15,
    // k 150 mD, phi 0.22; FWL 1,640 m (5,380.58 ft) under the fixture zones
    async listScalProjects() { return [{ id: 'scal-sample', name: 'Fixture SAND J (sample)', updatedAt: '2026-10-01T00:00:00Z' }]; },
    async loadScalProject(id) {
      if (id !== 'scal-sample') return null;
      return {
        id, name: 'Fixture SAND J (sample)', schema: 1, samples: [],
        capillary: { jMode: 'manual', manual: { a: '0.25', b: '1.4', Swirr: '0.15' }, SwirrOverride: '', includedSampleIds: [], reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' } },
        height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: String(1640 / 0.3048), swMin: '0.2', swMax: '0.95' },
      };
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

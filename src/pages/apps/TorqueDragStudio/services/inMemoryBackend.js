// In-memory backend for the /dev/torque-drag harness and e2e: seeds the
// ORACLE GOLDEN horizontal well (packages/engines/test-data/drilling/goldens)
// so the e2e spec asserts oracle numbers straight off the UI. Same interface
// as wpBackend; no Supabase, no auth.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/torquedrag_cases.json';

const IN = 0.0254;

const CASE = golden.cases.find((c) => c.name === 'horizontal');

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-1H', depth_unit: 'm',
  kb_elev_m: 30, head_x: 500000, head_y: 6800000,
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: CASE.stations, engine_version: 'drilling-wd2',
};

// Golden geometry → stored hole_sections shape (9-5/8 47 casing to the shoe,
// 8-1/2 open hole below, matching casingwear_cases.json).
const HOLE_SECTIONS = CASE.geometry.map((g) => (g.cased ? {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: 12.25 * IN, cased: true,
  casing_od_m: 9.625 * IN, casing_id_m: g.holeIdM, casing_weight_kgm: 69.94,
  grade: 'L-80', description: '9-5/8 47 casing',
} : {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: g.holeIdM, cased: false,
  description: '8-1/2 open hole',
}));

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden case',
  string: CASE.string,
  mud: { densityKgM3: CASE.mudDensityKgM3 },
  friction: { cased: 0.25, open: 0.35, overrides: [] },
  operations: {
    wobN: CASE.params.wobN,
    bitTorqueNm: CASE.params.bitTorqueNm,
    tripSpeedMs: CASE.params.tripSpeedMs,
    rpm: CASE.params.rpm,
    ops: ['trip_out', 'trip_in', 'rotate_on_bottom', 'slide_drill'],
    wear: { schedule: [{ rpm: 120, hours: 50 }], wearFactorMm3PerKNm: 2, intervalM: 30 },
  },
  created_at: '2026-08-26T00:00:00Z',
};

export const HARNESS_GOLDEN_CASE = CASE;

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let geometry = { id: 'geom-1', wellbore_id: 'wb-1', hole_sections: HOLE_SECTIONS };
  let seq = 1;
  return {
    kind: 'memory',
    listSites: async () => [SITE],
    listWellbores: async () => [WELLBORE],
    getDefinitiveTrajectory: async () => ({ wellbore: WELLBORE, design: DESIGN, stations: DESIGN.stations }),
    getGeometry: async () => geometry,
    saveGeometry: async (wellboreId, holeSections) => {
      geometry = { ...geometry, hole_sections: holeSections };
      return geometry;
    },
    listCases: async () => cases,
    saveCase: async (row) => {
      seq += 1;
      const created = { ...row, id: `case-${seq}`, created_at: new Date().toISOString() };
      cases = [...cases, created];
      return created;
    },
    updateCase: async (id, patch) => {
      cases = cases.map((c) => (c.id === id ? { ...c, ...patch } : c));
      return cases.find((c) => c.id === id);
    },
    deleteCase: async (id) => { cases = cases.filter((c) => c.id !== id); },
    listRuns: async (caseId) => runs.filter((r) => r.case_id === caseId),
    saveRun: async (run) => {
      seq += 1;
      const created = { ...run, id: `run-${seq}`, created_at: new Date().toISOString() };
      runs = [created, ...runs];
      return created;
    },
    deleteRun: async (id) => { runs = runs.filter((r) => r.id !== id); },
  };
}

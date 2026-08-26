// In-memory backend for /dev/hydraulics and e2e: seeds the ORACLE GOLDEN
// slant-well kcl_polymer case (packages/engines/test-data/drilling/goldens/
// hydraulics_cases.json) so the spec asserts oracle numbers off the UI.
// Also serves a small synthetic PP/FP mud window so the overlay chart path
// is exercised without a registry.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/hydraulics_cases.json';

const IN = 0.0254;

const CASE = golden.cases.find((c) => c.well === 'slant' && c.mudName === 'kcl_polymer');

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-2S', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: null,
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: CASE.stations, engine_version: 'drilling-wd2',
};

const HOLE_SECTIONS = CASE.geometry.map((g) => (g.cased ? {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: 12.25 * IN, cased: true,
  casing_od_m: 9.625 * IN, casing_id_m: g.holeIdM, casing_weight_kgm: 69.94,
  grade: 'L-80', description: '9-5/8 47 casing',
} : {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: g.holeIdM, cased: false,
  description: '8-1/2 open hole',
}));

// 3 x 14 mm reproduces the golden TFA exactly.
export const SEED_NOZZLES_MM = [14, 14, 14];

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden case',
  mud: { densityKgM3: CASE.mud.densityKgM3, fann: CASE.mud.fann, model: 'auto' },
  string: CASE.string,
  flow: { flowRateM3s: 0.025, nozzlesMm: SEED_NOZZLES_MM, surfaceLossPa: 0 },
  trip: { mode: 'closed', maxSpeedMs: 3 },
  cuttings: { ropMs: 0.005, dParticleM: 0.006, rhoSolidKgM3: 2600 },
  created_at: '2026-08-26T00:00:00Z',
};

// Synthetic PP/FP window (EMW kg/m3 vs TVD) bracketing the golden ECDs.
function syntheticMudWindow() {
  const rows = [];
  for (let tvd = 400; tvd <= 2600; tvd += 200) {
    rows.push({
      tvd,
      ppEmw: 1.05 + tvd * 4e-5,   // g/cc
      fpEmw: 1.55 + tvd * 5e-5,
      obgEmw: 1.9 + tvd * 2e-5,
      ppMpa: null, fpMpa: null, obgMpa: null,
    });
  }
  return rows;
}

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
    listTdCases: async () => [],
    loadMudWindow: async () => syntheticMudWindow(),
  };
}

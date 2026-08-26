// In-memory backend for /dev/well-control and e2e: seeds the ORACLE GOLDEN
// slant well and its 'moderate_gas' kick (packages/engines/test-data/
// drilling/goldens/wellcontrol_cases.json) so the spec asserts oracle
// numbers off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/wellcontrol_cases.json';

const IN = 0.0254;

const CASE = golden.cases.find((c) => c.well === 'slant');

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-3K', depth_unit: 'm',
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

export const SEED_KICK = { sidppPa: 2.0e6, sicpPa: 2.9e6, pitGainM3: 3.0 };

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden kick',
  string: CASE.string,
  mud: { densityKgM3: CASE.mudDensityKgM3 },
  pump: {
    outputM3PerStroke: CASE.pump.outputM3PerStroke,
    scr: [{ spm: 30, pressurePa: CASE.pump.scrPressurePa }],
    scrIndex: 0,
  },
  shoe: { mdM: CASE.shoeMd, fracEmwKgM3: CASE.fracEmwKgM3 },
  kick: {
    ...SEED_KICK,
    influxDensityKgM3: 240,
    kickIntensityKgM3: 60,
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
    listTdCases: async () => [],
    loadMudWindow: async () => null,
  };
}

// In-memory backend for /dev/cementing and e2e: seeds the ORACLE GOLDEN
// slant-well 7" job (packages/engines/test-data/drilling/goldens/
// cementing_cases.json, lead_tail program) so the spec asserts oracle
// numbers off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/cementing_cases.json';

const CASE = golden.cases.find((c) => c.well === 'slant');

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-4C', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: null,
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: CASE.stations, engine_version: 'drilling-wd2',
};

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden 7in job',
  casing: CASE.casing,
  fluids: {
    mudInHole: { densityKgM3: 1440, fann: CASE.mudFann },
    program: [
      { kind: 'spacer', densityKgM3: 1500, volumeM3: 4, fann: CASE.spacerFann },
      { kind: 'lead', densityKgM3: 1560, volumeM3: null, fann: CASE.leadFann },
      { kind: 'tail', densityKgM3: 1900, volumeM3: null, fann: CASE.tailFann },
      { kind: 'displacement', densityKgM3: 1440, volumeM3: null, fann: CASE.mudFann },
    ],
  },
  job: {
    tocMd: CASE.tocMd,
    excessOpenHolePct: CASE.excessOpenHolePct,
    leadTailSplitMd: CASE.leadTailSplitMd,
    pumpRateM3s: CASE.pumpRateM3s,
    slurryYieldM3PerSack: CASE.slurryYieldM3PerSack,
    fracEmwKgM3: 1750,
  },
  centralizers: CASE.centralizer,
  created_at: '2026-08-26T00:00:00Z',
};

export const HARNESS_GOLDEN_CASE = CASE;

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let geometry = { id: 'geom-1', wellbore_id: 'wb-1', hole_sections: CASE.holeSections };
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
    loadMudWindow: async () => null,
  };
}

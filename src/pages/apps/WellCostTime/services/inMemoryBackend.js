// In-memory backend for /dev/well-cost and e2e: serves the ORACLE
// GOLDEN cost & time case as the seed
// (packages/engines/test-data/drilling/goldens/wellcost_cases.json),
// so the spec recomputes expectations via wctRun + engines off the UI.
// The golden risk model carries a fixed seed, so the Monte Carlo run is
// bit-reproducible between the UI and the spec.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/wellcost_cases.json';
import { buildGoldenCaseDoc } from './wctRun';

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-11C', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: 'gw-1',
};

export const HARNESS_GOLDEN = golden;
export const goldenCaseDoc = () => buildGoldenCaseDoc(golden);

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: null,
  ...goldenCaseDoc(),
  created_at: '2026-08-29T00:00:00Z',
};

const HOLE_SECTIONS = [
  { from_md_m: 0, to_md_m: 500, hole_id_m: 0.66, cased: false, description: '26in surface hole' },
  { from_md_m: 500, to_md_m: 2000, hole_id_m: 0.444, cased: false, description: '17.5in intermediate hole' },
  { from_md_m: 2000, to_md_m: 3000, hole_id_m: 0.311, cased: false, description: '12.25in production hole' },
];

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let seq = 1;
  return {
    kind: 'memory',
    listSites: async () => [SITE],
    listWellbores: async () => [WELLBORE],
    getDefinitiveTrajectory: async () => ({ wellbore: WELLBORE, design: null, stations: null }),
    getGeometry: async () => ({ id: 'geom-1', wellbore_id: 'wb-1', hole_sections: HOLE_SECTIONS }),
    listCtCases: async () => [],
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

// In-memory backend for /dev/well-integrity and e2e: serves the golden
// slant trajectory as the definitive design and the ORACLE GOLDEN
// barrier/annulus/P&A case as the seed
// (packages/engines/test-data/drilling/goldens/wellintegrity_cases.json),
// so the spec recomputes expectations via wiRun + engines off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/wellintegrity_cases.json';
import { buildGoldenCaseDoc } from './wiRun';

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-10I', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: 'gw-1',
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: golden.stations, engine_version: 'drilling-wd2',
};

export const HARNESS_GOLDEN = golden;
export const goldenCaseDoc = () => buildGoldenCaseDoc(golden);

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  ...goldenCaseDoc(),
  created_at: '2026-08-28T00:00:00Z',
};

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let seq = 1;
  return {
    kind: 'memory',
    listSites: async () => [SITE],
    listWellbores: async () => [WELLBORE],
    getDefinitiveTrajectory: async () => ({ wellbore: WELLBORE, design: DESIGN, stations: DESIGN.stations }),
    listCtCases: async () => [],
    listCdCases: async () => [],
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

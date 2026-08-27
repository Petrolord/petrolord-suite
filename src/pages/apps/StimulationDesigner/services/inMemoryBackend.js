// In-memory backend for /dev/stimulation and e2e: serves the ORACLE
// GOLDEN stim profile as published gm-1.0.0 (SHMIN/SHMAX/UCS) and
// pp-1.0.0 (PP/OBG) curves on the 50 m grid, the golden slant trajectory
// as the definitive design, and the golden frac/acid case as the seed
// (packages/engines/test-data/drilling/goldens/stim_cases.json), so the
// spec recomputes expectations via stRun + engines off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/stim_cases.json';
import { buildGoldenCaseDoc } from './stRun';

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-9S', depth_unit: 'm',
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

// Published-curve serving (the D8 harness pattern): gm-1.0.0 + pp-1.0.0
// provenance rows on the golden profile grid, MPa Float32 round trip.
const grid = golden.profile.tvdM;
const stepM = grid[1] - grid[0];
const logRow = (id, mnemonic, provenance) => ({
  id, well_id: 'gw-1', mnemonic, unit: 'MPA',
  start_md_m: grid[0], stop_md_m: grid[grid.length - 1], step_m: stepM,
  n_samples: grid.length, null_count: 0, provenance,
});
const PP_PROV = { computed: true, engine: 'pore-pressure-studio', pipeline_version: 'pp-1.0.0', project_id: 'pp-proj' };
const GM_PROV = { computed: true, engine: 'geomechanics-studio', pipeline_version: 'gm-1.0.0', project_id: 'gm-proj' };

const LOGS = [
  logRow('log-pp', 'PP', PP_PROV),
  logRow('log-obg', 'OBG', PP_PROV),
  logRow('log-shmin', 'SHMIN', GM_PROV),
  logRow('log-shmax', 'SHMAX', GM_PROV),
  logRow('log-ucs', 'UCS', GM_PROV),
];
const CURVES = {
  'log-pp': Float32Array.from(golden.profile.ppPa, (v) => v / 1e6),
  'log-obg': Float32Array.from(golden.profile.svPa, (v) => v / 1e6),
  'log-shmin': Float32Array.from(golden.profile.shminPa, (v) => v / 1e6),
  'log-shmax': Float32Array.from(golden.profile.shmaxPa, (v) => v / 1e6),
  'log-ucs': Float32Array.from(golden.profile.ucsPa, (v) => v / 1e6),
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
    listPsCases: async () => [],
    listGeoLogs: async () => [...LOGS],
    downloadCurve: async (log) => {
      if (CURVES[log.id]) return CURVES[log.id];
      throw new Error('Unknown curve.');
    },
  };
}

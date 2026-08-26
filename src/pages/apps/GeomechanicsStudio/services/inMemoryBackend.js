// In-memory backend for /dev/geomechanics and e2e: serves the ORACLE GOLDEN
// synthetic profile as published pp-1.0.0 PP/OBG curves + a DT curve on the
// same 50 m grid, and the golden slant trajectory as the definitive design
// (packages/engines/test-data/drilling/goldens/geomech_cases.json), so the
// spec asserts oracle numbers off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/geomech_cases.json';

const PROFILE = golden.profile;
const CASE = golden.cases.find((c) => c.well === 'slant');
const P = golden.params;

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-5G', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: 'gw-1',
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: CASE.stations, engine_version: 'drilling-wd2',
};
const GEO_WELL = { id: 'gw-1', name: 'Harness Well GW-1' };

const grid = PROFILE.tvdM;
const stepM = grid[1] - grid[0];
const logRow = (id, mnemonic, unit, provenance = null) => ({
  id, well_id: 'gw-1', mnemonic, unit,
  start_md_m: grid[0], stop_md_m: grid[grid.length - 1], step_m: stepM,
  n_samples: grid.length, null_count: 0, provenance,
});
const PP_PROV = { computed: true, engine: 'pore-pressure-studio', pipeline_version: 'pp-1.0.0', project_id: 'pp-proj' };

const LOGS = [
  logRow('log-dept', 'DEPT', 'M'),
  logRow('log-dt', 'DT', 'US/M'),
  logRow('log-pp', 'PP', 'MPA', PP_PROV),
  logRow('log-obg', 'OBG', 'MPA', PP_PROV),
];
const CURVES = {
  'log-dept': Float32Array.from(grid),
  'log-dt': Float32Array.from(PROFILE.dtUsPerM),
  'log-pp': Float32Array.from(PROFILE.ppPa, (v) => v / 1e6),
  'log-obg': Float32Array.from(PROFILE.svPa, (v) => v / 1e6),
};

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden MEM',
  source: { geoWellId: 'gw-1', ppSource: 'published', mudlineMdM: 0 },
  params: {
    nu: P.nu,
    alphaBiot: P.alphaBiot,
    ePa: P.ePa,
    epsX: P.epsX,
    epsY: P.epsY,
    frictionAngleDeg: P.frictionAngleDeg,
    regime: P.regime,
    shmaxAzimuthDeg: P.shmaxAzimuthDeg,
    tensileStrengthPa: P.tensileStrengthPa,
    ucs: { correlation: 'horsrud' },
  },
  created_at: '2026-08-27T00:00:00Z',
};

export const HARNESS_GOLDEN = golden;

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let published = [];
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
    listGeoWells: async () => [GEO_WELL],
    listGeoLogs: async () => [...LOGS, ...published],
    downloadCurve: async (log) => {
      if (CURVES[log.id]) return CURVES[log.id];
      const p = published.find((x) => x.id === log.id);
      if (p) return p.__data;
      throw new Error('Unknown curve.');
    },
    publishCurves: async (geoWellId, preparedLogs) => {
      for (const l of preparedLogs) {
        seq += 1;
        published = published.filter((x) => x.mnemonic !== l.mnemonic);
        published.push({
          ...logRow(`pub-${seq}`, l.mnemonic, l.unit, l.provenance),
          __data: l.data,
        });
      }
      return published.length;
    },
  };
}

// In-memory backend for /dev/casing-tubing and e2e: serves the ORACLE GOLDEN
// slant trajectory as the definitive design and seeds the golden two-section
// 9-5/8 casing case (packages/engines/test-data/drilling/goldens/
// tubular_cases.json — TVD section breaks inverted to MD through the exact
// tvdAt), so the spec recomputes expectations via ctRun + engines off the UI.

import golden from '../../../../../packages/engines/test-data/drilling/goldens/tubular_cases.json';
import geomechGolden from '../../../../../packages/engines/test-data/drilling/goldens/geomech_cases.json';
import { tvdAt } from '../engine/wellControl';
import { buildGoldenCaseDoc } from './ctRun';

const SLANT = geomechGolden.cases.find((c) => c.well === 'slant');
const STATIONS = SLANT.stations;
const TD_MD = STATIONS[STATIONS.length - 1].md;

const SITE = { id: 'site-1', name: 'Harness Field', crs: 'EPSG:32631', organization_id: null };
const WELLBORE = {
  id: 'wb-1', site_id: 'site-1', name: 'Harness-6C', depth_unit: 'm',
  kb_elev_m: 25, head_x: 500000, head_y: 6800000, geo_well_id: 'gw-1',
};
const DESIGN = {
  id: 'design-1', wellbore_id: 'wb-1', name: 'Plan A', revision: 1,
  status: 'definitive', stations: STATIONS, engine_version: 'drilling-wd2',
};

export const goldenCaseDoc = () => buildGoldenCaseDoc(golden);

const SEED_CASE = {
  id: 'case-1',
  wellbore_id: 'wb-1',
  design_id: 'design-1',
  name: 'Golden 9-5/8 Design',
  ...(() => {
    const doc = goldenCaseDoc();
    return {
      strings: doc.strings,
      environment: doc.environment,
      load_cases: doc.loadCases,
      packer: doc.packer,
      safety_factors: doc.safetyFactors,
    };
  })(),
  created_at: '2026-08-27T00:00:00Z',
};

export const HARNESS_GOLDEN = golden;
export const HARNESS_STATIONS = STATIONS;

// Synthetic published mud window consistent with the golden environment:
// flat 1.20 g/cc pore EMW and 1.80 g/cc frac EMW along the well.
function mudWindowRows() {
  const rows = [];
  for (let md = 200; md <= TD_MD; md += 200) {
    const tvd = tvdAt(STATIONS, md);
    if (!(tvd > 0)) continue;
    rows.push({
      md, tvd, tvdss: tvd - 25,
      ppMpa: (1200 * 9.80665 * tvd) / 1e6,
      fpMpa: (1800 * 9.80665 * tvd) / 1e6,
      obgMpa: null,
      ppEmw: 1.2, fpEmw: 1.8, obgEmw: null,
      windowMpa: ((1800 - 1200) * 9.80665 * tvd) / 1e6,
    });
  }
  return rows;
}

export function makeInMemoryBackend() {
  let cases = [{ ...SEED_CASE }];
  let runs = [];
  let seqN = 1;
  return {
    kind: 'memory',
    listSites: async () => [SITE],
    listWellbores: async () => [WELLBORE],
    getDefinitiveTrajectory: async () => ({ wellbore: WELLBORE, design: DESIGN, stations: STATIONS }),
    listCases: async () => cases,
    saveCase: async (row) => {
      seqN += 1;
      const created = { ...row, id: `case-${seqN}`, created_at: new Date().toISOString() };
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
      seqN += 1;
      const created = { ...run, id: `run-${seqN}`, created_at: new Date().toISOString() };
      runs = [created, ...runs];
      return created;
    },
    deleteRun: async (id) => { runs = runs.filter((r) => r.id !== id); },
    loadMudWindow: async () => mudWindowRows(),
  };
}

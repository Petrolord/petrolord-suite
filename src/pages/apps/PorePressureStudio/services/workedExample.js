// The worked example project (AppUpgrade PP-U2-010). A graduate opens it
// from the empty workstation or the help guide and walks a whole
// prognosis on the oracle's synthetic offshore well (ORACLE PP-1: 100 m of
// water, KB 30 m, mudline at 130 m MD, hydrostatic to 2,500 m below the
// mudline, then a 4 kPa/m overpressure ramp): the trend fitted on shale
// picks, four MDT pressures and three leak-off tests, the mud weights used,
// the margins and the casing seats. It runs on the in-memory backend, so
// nothing reaches the account: Save keeps the example in this browser tab.
// Every number the help guide quotes comes from this seed and the oracle.

import goldens from '../../../../../packages/engines/test-data/porepressure/goldens.json';
import { makeInMemoryBackend, MUDLINE_MD_M, HARNESS_RES_NCT } from './inMemoryBackend';

const W = goldens.well;
const P = W.params;
const at = (arr, z) => arr[W.z_bml_m.indexOf(z)];

export const EXAMPLE_PROJECT_KEY = 'pp.example.project.v1';

export const EXAMPLE_PROJECT = Object.freeze({
  id: 'pp-worked-example',
  name: 'Worked example',
  params: {
    waterDepthM: P.water_depth_m,
    rhoSeawaterKgM3: P.rho_seawater,
    rhoFluidKgM3: P.rho_fluid,
    mudlineMdM: MUDLINE_MD_M,
    nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m },
    method: 'eaton',
    eatonN: P.eaton_n,
    bowers: { A: 10, B: 0.75 },
    nu: 0.25,
    resNct: { ...HARNESS_RES_NCT },
    eatonNRes: 1.2,
    margins: { tripKgM3: 0.5 * (1000 / 8.345404), kickKgM3: 0.5 * (1000 / 8.345404), minShallowSeatBmlM: 0 },
    report: { field: 'Worked example', analyst: '' },
  },
  // shale picks on the VSH, one per 200 m of the normally pressured section
  picks: [300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100, 2300].map((z) => ({ z, dt: at(W.dt_us_per_m, z), auto: true })),
  calibration: [
    ...[2700, 3000, 3300, 3700].map((z) => ({ z, pMpa: Number((at(W.pore_pressure_pa, z) / 1e6).toFixed(2)), kind: 'rft', source: 'worked example MDT' })),
    ...[1000, 2000, 3000].map((z) => ({ z, pMpa: Number((at(W.frac_pressure_pa, z) / 1e6).toFixed(2)), kind: 'lot', source: 'worked example LOT' })),
    ...[[500, 1.03], [1500, 1.05], [2600, 1.12], [3200, 1.22], [3800, 1.3]].map(([z, sg]) => ({
      z, pMpa: Number(((sg * 1000 * 9.80665 * (z + MUDLINE_MD_M)) / 1e6).toFixed(3)), kind: 'mw', source: 'worked example mud weights',
    })),
  ],
  source: { kind: 'well', nctFittedFor: true },
});

export function makeWorkedExampleBackend() {
  const b = makeInMemoryBackend({ seedProject: EXAMPLE_PROJECT, projectKey: EXAMPLE_PROJECT_KEY });
  return { ...b, isExample: true, publishCurves: null };
}

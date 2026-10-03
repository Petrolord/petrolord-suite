// Saved ReservoirCalc Pro state from earlier releases (upgrade U1, PL5,
// 2026-09-30). One saved_quickvol_projects row per shape the app has
// written since saving first worked (2026-08-02), and one rcp_prospects
// row per shape. jest opens every row through the shipped context; the
// harness seeds them with `/dev/reservoircalc-pro?saved=1` so the e2e
// opens them in a browser. Fixtures only: no I/O.

const dome = () => {
  // a metre dome (crest -1500 m) on a UTM frame, 21 x 21 nodes at 100 m
  const pts = [];
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    const x = 501000 + i * 100; const y = 6699000 + j * 100;
    pts.push({ x, y, z: -1500 - 0.0001 * ((x - 502000) ** 2 + (y - 6700000) ** 2) });
  }
  return pts;
};
const FT_PER_M = 3.280839895013123;

const st = (v, s = 0.25) => ({ p90: v * (1 - s), p50: v, p10: v * (1 + s * 1.4), mean: v * 1.03, stdDev: v * s * 0.6, min: v * 0.4, max: v * 2.2, cdf: [{ x: v * 0.4, y: 0 }, { x: v, y: 50 }, { x: v * 2.2, y: 100 }] });

const baseInputs = {
  fluidType: 'oil', topSurfaceId: null, baseSurfaceId: null, area: 5000, thickness: 50, ntg: 1, porosity: 0.2, sw: 0.3,
  fvf: 1.2, bg: 0.005, recovery: 25, recoveryGas: 70, pressure: 3500, temperature: 180, permeability: 100, api: 35,
  gasGrav: 0.7, owc: -8000, goc: -7000, gasCapFraction: null,
};

/** saved_quickvol_projects rows, oldest first. */
export const SAVED_PROJECT_ROWS = [
  {
    release: '2026-08-02 first working save (#150): one reservoir, no reservoirs list',
    row: {
      id: 'saved-0802-single', user_id: 'user-dev', project_name: 'Aug single reservoir', mode: 'deterministic', created_at: '2026-08-02T10:00:00Z',
      inputs_data: {
        description: 'Simple oil case', version: 1,
        inputs: { deterministic: { ...baseInputs }, surfaces: [], polygons: [], maps: [] },
        unitSystem: 'field', inputUnits: null, calcMethod: 'deterministic', inputMethod: 'simple', reservoirName: 'Main sand',
        probResults: null, auditTrail: [], updated_at: '2026-08-02T10:00:00Z',
      },
      results_data: { stooip: 226275000, giip: 0, grv: 250000, volumeUnit: 'STB', unitSystem: 'field', fluidType: 'oil' },
    },
    expect: { reservoirs: 1, unitSystem: 'field', stooip: 226275000 },
  },
  {
    release: '2026-08-02 multi-reservoir project (#150): two cases, one metric',
    row: {
      id: 'saved-0802-multi', user_id: 'user-dev', project_name: 'Aug two reservoirs', mode: 'deterministic', created_at: '2026-08-02T12:00:00Z',
      inputs_data: {
        description: '', version: 3,
        inputs: { deterministic: { ...baseInputs }, surfaces: [], polygons: [] },
        unitSystem: 'field', calcMethod: 'deterministic', inputMethod: 'simple', reservoirName: 'Upper',
        reservoirs: [
          { id: 'r-up', name: 'Upper', inputs: { ...baseInputs }, surfaces: {}, aois: [], maps: [], unitSystem: 'field', inputUnits: null, calcMethod: 'deterministic', inputMethod: 'simple', results: null, probResults: null },
          { id: 'r-lo', name: 'Lower', inputs: { ...baseInputs, area: 20, thickness: 15, owc: -2400, goc: -2100 }, surfaces: {}, aois: [], maps: [], unitSystem: 'metric', inputUnits: { area: 'km2', thickness: 'm', contact: 'm', bg: 'rcf_scf', pressure: 'bar', temperature: 'C' }, calcMethod: 'deterministic', inputMethod: 'simple', results: null, probResults: null },
        ],
        activeReservoirId: 'r-up', probResults: null, auditTrail: [],
      },
      results_data: null,
    },
    expect: { reservoirs: 2, unitSystem: 'field' },
  },
  {
    release: '2026-08-14 Monte Carlo with raw realizations, no run metadata (#170)',
    row: {
      id: 'saved-0814-mc', user_id: 'user-dev', project_name: 'Aug Monte Carlo', mode: 'probabilistic', created_at: '2026-08-14T09:00:00Z',
      inputs_data: {
        description: '', version: 2,
        inputs: { deterministic: { ...baseInputs }, surfaces: [], polygons: [] },
        unitSystem: 'field', calcMethod: 'probabilistic', inputMethod: 'simple', reservoirName: 'Main sand',
        probResults: {
          raw: { stooip: [180e6, 226e6, 290e6], giip: [0, 0, 0], grv: [1, 1, 1], samples: [{ index: 0, targetVol: 180e6, inputs: { area: 4500, thickness: 45, phi: 0.18, sw: 0.32, fvf: 1.25, bg: 0.005, ntg: 1 } }] },
          stats: { stooip: st(226e6), giip: {}, sensitivity: [{ parameter: 'area', contribution: 55, impactDirection: 1 }], iterations: 10000, validCount: 10000 },
          diagnostics: { rejectedCount: 0, outOfBounds: [], warnings: [], tracking: {} },
        },
        auditTrail: [],
      },
      results_data: null,
    },
    expect: { reservoirs: 1, unitSystem: 'field', mcUnstamped: true },
  },
  {
    release: '2026-09-06 RC registry surface (XY rescaled to feet), hybrid, contact unit m, registry provenance',
    row: {
      id: 'saved-0906-rc', user_id: 'user-dev', project_name: 'Sep registry hybrid', mode: 'deterministic', created_at: '2026-09-06T15:00:00Z',
      inputs_data: {
        description: '', version: 1,
        inputs: {
          deterministic: { ...baseInputs, topSurfaceId: 'surf-ft', thickness: 300, owc: -1550 * FT_PER_M, goc: null, registryProvenance: { zone: { zone: 'Keta Sand', wells: ['KETA-1'] } } },
          surfaces: [{ id: 'surf-ft', name: 'Top Dome (registry, ft)', format: 'xyz', points: dome().map((p) => ({ x: p.x * FT_PER_M, y: p.y * FT_PER_M, z: p.z * FT_PER_M })), minZ: -1700 * FT_PER_M, maxZ: -1500 * FT_PER_M, avgZ: -1560 * FT_PER_M, pointCount: 441, xyUnit: 'ft', depthUnit: 'ft', zConvention: 'elevation', crs: null, registryId: 'geo-1', registryName: 'Top Dome' }],
          polygons: [],
        },
        unitSystem: 'field', inputUnits: { area: 'acre', thickness: 'ft', contact: 'm', bg: 'rcf_scf', pressure: 'psi', temperature: 'F' },
        calcMethod: 'deterministic', inputMethod: 'hybrid', reservoirName: 'Keta Sand', probResults: null, auditTrail: [],
      },
      results_data: null,
    },
    expect: { reservoirs: 1, unitSystem: 'field', structural: true },
  },
  {
    release: '2026-09-26 T1 structural Monte Carlo on a metre surface (contacts sampled, no recoverable streams)',
    row: {
      id: 'saved-0926-t1', user_id: 'user-dev', project_name: 'T1 structural MC', mode: 'probabilistic', created_at: '2026-09-26T16:00:00Z',
      inputs_data: {
        description: '', version: 4,
        inputs: {
          deterministic: { ...baseInputs, topSurfaceId: 'surf-m', thickness: 120, owc: -1550, goc: null },
          surfaces: [{ id: 'surf-m', name: 'Harness Dome', format: 'xyz', points: dome(), minZ: -1700, maxZ: -1500, avgZ: -1560, pointCount: 441, xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation', crs: 'EPSG:32632', registryId: 'geo-2', registryName: 'Harness Dome' }],
          polygons: [],
        },
        unitSystem: 'metric', inputUnits: { area: 'km2', thickness: 'm', contact: 'm', bg: 'rcf_scf', pressure: 'bar', temperature: 'C' },
        calcMethod: 'probabilistic', inputMethod: 'hybrid', reservoirName: 'Dome',
        probResults: {
          raw: { stooip: [8e6, 10e6, 13e6], giip: [0, 0, 0], grv: [1, 1, 1], samples: [{ index: 1, targetVol: 10e6, inputs: { owc: -1550, grvFactor: 1, ntg: 1, phi: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005 } }] },
          stats: { stooip: st(10e6), giip: {}, sensitivity: [], iterations: 10000, validCount: 10000 },
          diagnostics: { rejectedCount: 0, outOfBounds: [], warnings: [], tracking: {} },
        },
        auditTrail: [{ id: 'a1', timestamp: '2026-09-26T16:00:00Z', action: 'Monte Carlo run', details: '10,000 iterations' }],
      },
      results_data: null,
    },
    expect: { reservoirs: 1, unitSystem: 'metric', mcUnstamped: true, structural: true },
  },
];

/** rcp_prospects rows, oldest first, with what Risked Reserves Valuation should say. */
export const SAVED_PROSPECT_ROWS = [
  {
    release: '2026-07-13 G5 prospect: raw STB, no unit, no basis',
    row: { id: 'pros-g5', name: 'G5 raw STB', pg_factors: { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 }, inputs: { mean: 228.89e6, p90: 178.81e6, p50: 225.54e6, p10: 284.03e6 }, risked: { pg: 0.2352, risked_mean: 53.8e6 } },
    expect: { pg: 0.2352, p50: 225.54, note: /read as STB.*may be in-place/ },
  },
  {
    release: '2026-09-26 T1 prospect: MMSTB stated, no basis (in-place STOIIP)',
    row: { id: 'pros-t1', name: 'T1 MMSTB', pg_factors: { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 }, inputs: { mean: 228.89, p90: 178.81, p50: 225.54, p10: 284.03, unit: 'MMbbl' }, risked: { pg: 0.2352, risked_mean: 53.8, success: { mean: 228.89, p90: 178.81, p50: 225.54, p10: 284.03 } } },
    expect: { pg: 0.2352, p50: 225.54, note: /may be in-place/ },
  },
  {
    release: '2026-09-30 U1 gas prospect: Bscf, recoverable',
    row: { id: 'pros-u1', name: 'U1 gas recoverable', pg_factors: { trap: 0.7, reservoir: 0.8, charge: 0.7, seal: 0.8 }, inputs: { mean: 120, p90: 60, p50: 110, p10: 200, unit: 'Bcf', basis: 'recoverable' }, risked: { pg: 0.3136, risked_mean: 37.6, success: { mean: 120, p90: 60, p50: 110, p10: 200 } } },
    expect: { pg: 0.3136, p50: 110 / 6, note: /converted from Bcf/ },
  },
];

/**
 * Risked Reserves Valuation U2-006 ("Re-run prospect"): the project the
 * Risked Reserves harness prospects name in their source block
 * (riskedreserves/services/rrvFixtures.js: project-ekene, reservoirs r-d07
 * and r-e02), so the re-run link opens a real project in the harness.
 */
export const RERUN_PROJECT_ROW = (() => {
  const base = SAVED_PROJECT_ROWS.find((r) => r.row.id === 'saved-0802-multi').row;
  const blob = JSON.parse(JSON.stringify(base.inputs_data));
  blob.reservoirs = [
    { ...blob.reservoirs[0], id: 'r-d07', name: 'D-07 sand' },
    { ...blob.reservoirs[1], id: 'r-e02', name: 'E-02 sand' },
  ];
  blob.activeReservoirId = 'r-e02';
  blob.reservoirName = 'E-02 sand';
  return { ...JSON.parse(JSON.stringify(base)), id: 'project-ekene', project_name: 'Ekene Block', created_at: '2026-10-01T10:00:00Z', inputs_data: blob };
})();

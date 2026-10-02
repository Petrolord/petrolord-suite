// Fluid Systems Studio projects as earlier releases saved them (FLUID-U1,
// PL5 and RL4): the jest suites and the /dev harness (?saved=1) open these
// to prove an old project still opens, computes and reports, with n/a for
// what it never had. The payloads are the `inputs_data` of the rows.

// Phase 3 (2026-07-07), before the Studio shell: inputs_data was the raw
// inputs object itself. No fluid model selector, no composition tuning.
export const LEGACY_PRE_SHELL = Object.freeze({
  streamA: {
    blackOil: { api: 28.5, gor: 480, gasSg: 0.82, temp: 185, pb: null, salinity: 42000 },
    composition: { model: 'pr', raw: '' },
  },
  correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' },
  feed: { oilRate: 2500 },
  separatorTrain: { stages: [{ pressure: 300, temperature: 110, enabled: true }, { pressure: 50, temperature: 90, enabled: false }] },
  streamB: { blackOil: { api: 22, gor: 200, gasSg: 0.85, temp: 150, pb: null, salinity: 10000 }, composition: { model: 'pr', raw: '' } },
  blending: { enabled: false, streamB_fraction: 50 },
  batchRun: { enabled: false, variable: 'api', min: 20, max: 40, steps: 5 },
  flowAssurance: { flowline: { length: 2500, diameter: 3, outletPressure: 200, ambientTemp: 85 }, inhibitors: [] },
  ptProfile: { raw: '3000, 180\n2000, 140\n500, 50' },
});

// Studio shell (2026-07-19) to the T1 release (2026-09-26): schema 1, a
// compositional project with an applied tuning and NO record of the fit,
// no identification, no input sources, no unit system, no pvt block.
export const SCHEMA_1_TUNED_EOS = Object.freeze({
  id: 'fixture-schema1',
  name: 'Ekene E-2000 oil (saved 2026-09)',
  schema: 1,
  modified: '2026-09-20T10:00:00.000Z',
  inputs: {
    fluidModel: 'eos',
    streamA: {
      blackOil: { api: 32, gor: 650, gasSg: 0.75, temp: 200, pb: 2600, salinity: 35000 },
      composition: {
        model: 'pr78',
        zPct: { N2: 0, CO2: 2, H2S: 0, C1: 40, C2: 7, C3: 6, iC4: 0, nC4: 5, iC5: 0, nC5: 0, nC6: 6, 'C7+': 34 },
        plus: { mw: 190, sg: 0.84, tbF: null },
        pressure: 3500,
        temp: 200,
        envelope: { tMinF: 40, tMaxF: 400, nT: 15 },
        tuning: {
          lab: { psatPsia: '2750', psatTF: null, totalGor: null, stoApi: null, bo: null },
          applied: { fTc: 0.985, fPc: 1.02, kC1: 0.03, sPlus: 0.05 },
        },
      },
    },
    correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' },
    feed: { oilRate: 1000 },
    separatorTrain: { stages: [{ pressure: 450, temperature: 120, enabled: true }, { pressure: 200, temperature: 100, enabled: true }, { pressure: 14.7, temperature: 60, enabled: false }] },
    streamB: { blackOil: { api: 22, gor: 200, gasSg: 0.85, temp: 150, pb: null, salinity: 10000 }, composition: { model: 'pr', raw: '' } },
    blending: { enabled: false, streamB_fraction: 50 },
    batchRun: { enabled: false, variable: 'api', min: 20, max: 40, steps: 5 },
    flowAssurance: { flowline: { length: 2500, diameter: 3, outletPressure: 200, ambientTemp: 85 }, inhibitors: [] },
    ptProfile: { raw: '' },
  },
});

/** Rows of saved_fluid_studio_projects for a harness or a test double. */
export const savedProjectRows = (userId = 'dev-user') => [
  { id: 'fixture-legacy', user_id: userId, project_name: 'Pre-shell project (2026-07)', inputs_data: LEGACY_PRE_SHELL, created_at: '2026-07-08T09:00:00Z', updated_at: '2026-07-08T09:00:00Z' },
  { id: 'fixture-schema1', user_id: userId, project_name: SCHEMA_1_TUNED_EOS.name, inputs_data: SCHEMA_1_TUNED_EOS, created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T10:00:00Z' },
];

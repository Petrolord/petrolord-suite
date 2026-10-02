// Sample Material Balance cases for the /dev harness, the report tests and
// the sample reports: published data sets, shaped as rb_* rows.
//
//   case-ahmed-11-3    oil, depletion drive, no aquifer
//                      Tarek Ahmed, Reservoir Engineering Handbook, Example
//                      11-3 (Virginia Hills Beaverhill Lake), Table 11-3
//   case-dake-9-2      oil with a Carter-Tracy aquifer, ten yearly surveys
//                      Dake, Fundamentals of Reservoir Engineering (1978),
//                      Exercise 9.2 (packages/engines/test-data/mbal/dake-9-2.ts)
//   case-pletcher-gas  gas with a pot aquifer, ten yearly surveys
//                      Pletcher, SPE 75354 (2002), Tables 1 to 3
//
// The numbers are the published ones; the dates of the Pletcher and Dake
// cases are nominal (the books give years 0 to 10).

import { rsAt, computePvtRow } from '@/utils/fluidStudioCalculations';

const DEFAULT_CORRELATIONS = { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson', z_factor: 'hall_yarborough', water: 'mccain', gas_viscosity: 'lee_gonzalez_eakin' };
export const SAMPLE_USER = { id: 'dev-user', email: 'harness@petrolord.dev' };

// Ahmed Table 11-3: p (psia), Bo (rb/STB), Np (MSTB), Wp (MSTB); all above Pb 1500
const AHMED = [
  [3685, 1.3102, 0, 0], [3680, 1.3104, 20.481, 0], [3676, 1.3104, 34.75, 0],
  [3667, 1.3105, 78.557, 0], [3664, 1.3105, 101.846, 0], [3640, 1.3109, 215.681, 0],
  [3605, 1.3116, 364.613, 0], [3567, 1.3122, 542.985, 0.159], [3515, 1.3128, 841.591, 0.805],
  [3448, 1.313, 1273.53, 2.579], [3360, 1.315, 1691.887, 5.008], [3275, 1.316, 2127.077, 6.5],
  [3188, 1.317, 2575.33, 8.0],
];

// Dake Exercise 9.2: year, p (psia), Np (MMSTB), Rp (scf/STB), Bo (rb/STB), Rs (scf/STB), Bg (rb/scf)
const DAKE = [
  [0, 2740, 0.00, 650, 1.404, 650, 0.00093], [1, 2620, 7.88, 760, 1.374, 592, 0.00098],
  [2, 2395, 18.42, 845, 1.349, 545, 0.00107], [3, 2199, 29.15, 920, 1.329, 507, 0.00117],
  [4, 2029, 40.69, 975, 1.316, 471, 0.00128], [5, 1883, 50.14, 1025, 1.303, 442, 0.00139],
  [6, 1760, 58.42, 1065, 1.294, 418, 0.00150], [7, 1655, 65.39, 1095, 1.287, 398, 0.00160],
  [8, 1571, 70.74, 1120, 1.280, 383, 0.00170], [9, 1507, 74.54, 1145, 1.276, 371, 0.00176],
  [10, 1460, 77.43, 1160, 1.273, 364, 0.00182],
];

// Pletcher Tables 2 and 3: year, p (psia), Gp (Bscf), Wp (STB), z, Bg (rb/Mscf), Bw (rb/STB)
const PLETCHER = [
  [0, 6411, 0.000, 0, 1.1192, 0.6279, 1.0452], [1, 5947, 5.475, 378, 1.0890, 0.6587, 1.0467],
  [2, 5509, 10.950, 1434, 1.0618, 0.6933, 1.0480], [3, 5093, 16.425, 3056, 1.0374, 0.7327, 1.0493],
  [4, 4697, 21.900, 5284, 1.0156, 0.7778, 1.0506], [5, 4319, 27.375, 8183, 0.9966, 0.8300, 1.0517],
  [6, 3957, 32.850, 11864, 0.9801, 0.8910, 1.0529], [7, 3610, 38.325, 16425, 0.9663, 0.9628, 1.0540],
  [8, 3276, 43.800, 22019, 0.9551, 1.0487, 1.0551], [9, 2953, 49.275, 28860, 0.9467, 1.1532, 1.0560],
  [10, 2638, 54.750, 37256, 0.9409, 1.2829, 1.0571],
];

// A saved Fluid Systems Studio project carrying its pvt-1 block, for the PVT
// intake of the PVT tab: the Ahmed Example 11-3 fluid (35 degAPI, gas gravity
// 0.7, 175 degF, bubble point 1,500 psia) by Standing and Beggs-Robinson. The
// rows come from the Fluid Systems black-oil engine; the block is laid out as
// the contract documents it (docs/scope/ReportKit-DESIGN-AND-STATUS.md
// section 4, and the writer of the Fluid Systems round).
export const SAMPLE_FLUID_PROJECT_ID = 'fluid-ahmed-11-3';
export const SAMPLE_FLUID_LEGACY_ID = 'fluid-legacy-no-block';
export function sampleFluidBlock() {
  const fluid = { api: 35, gasGravity: 0.7, temp: 175, rsb: 0, salinity: 0, pb: null, correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' } };
  const pb = 1500;
  fluid.rsb = rsAt(pb, fluid);
  const pressures = [200, 500, 800, 1100, 1300, 1500, 2000, 2500, 3000, 3500, 3685, 4000];
  const table = pressures.map((p) => computePvtRow(p, fluid, pb));
  return {
    schema: 'pvt-1',
    source_app: 'Fluid Systems Studio',
    project_id: SAMPLE_FLUID_PROJECT_ID,
    project_name: 'Virginia Hills oil PVT',
    generated_at: '2026-10-01T14:30:00.000Z',
    app_build: 'Petrolord Suite harness',
    model: 'black-oil-correlations',
    units: { pressure: 'psia', temperature: 'degF', Rs: 'scf/STB', Bo: 'RB/STB', Bg: 'RB/scf', Z: 'dimensionless', mu_o: 'cP', mu_g: 'cP', co: '1/psi', Bw: 'RB/STB', mu_w: 'cP' },
    columns: ['pressure', 'Rs', 'Bo', 'Bg', 'Z', 'mu_o', 'mu_g', 'co'],
    standard_conditions: { pressure_psia: 14.7, temperature_degF: 60 },
    separator_conditions: [],
    methods: {
      pb: { method: 'Standing (1947)', kind: 'correlation' },
      rs: { method: 'Standing (1947)', kind: 'correlation' },
      bo: { method: 'Standing (1947)', kind: 'correlation' },
      co: { method: 'Vasquez-Beggs (1980)', kind: 'correlation' },
      mu_od: { method: 'Beggs-Robinson (1975)', kind: 'correlation' },
      mu_o: { method: 'Beggs-Robinson (1975)', kind: 'correlation' },
      mu_o_undersaturated: { method: 'Vasquez-Beggs (1980)', kind: 'correlation' },
      z: { method: 'Papay (1968) with Sutton pseudo-criticals', kind: 'correlation' },
      mu_g: { method: 'Lee-Gonzalez-Eakin (1966)', kind: 'correlation' },
      bg: { method: 'Real gas law from Z', kind: 'definition' },
      bw: { method: 'McCain (1990)', kind: 'correlation' },
      mu_w: { method: 'McCain (1991)', kind: 'correlation' },
    },
    basis: { kind: 'flash', text: 'Flash (single-stage separator) basis' },
    pb_source: 'entered',
    tuning: { status: 'none' },
    range_flags: [],
    inputs: { oil_gravity: 35, gas_gravity: 0.7, rsb: Number(fluid.rsb.toFixed(1)), temperature: 175, salinity: 0 },
    at_saturation: { pressure: pb },
    table,
  };
}

export const SAMPLE_CASE_IDS = Object.freeze({ ahmed: 'case-ahmed-11-3', dake: 'case-dake-9-2', pletcher: 'case-pletcher-gas' });

/** A fresh in-memory copy of the rb_* tables holding the three cases. */
export function seedSampleStore(now = new Date().toISOString()) {
  const t = now;
  const blank = { cum_water_inj_stb: 0, cum_gas_inj_scf: 0, z_factor: null, observed_we_rb: null };
  const cases = [
    {
      id: SAMPLE_CASE_IDS.ahmed, user_id: SAMPLE_USER.id, name: 'Ahmed Example 11-3 (depletion drive)', field_name: 'Ahmed REH Table 11-3', reservoir_name: null,
      fluid_system: 'oil', has_aquifer: false, has_gas_cap: false, initial_pressure_psia: 3685, reservoir_temperature_f: 175,
      initial_water_saturation: 0.24, bubble_point_psia: 1500, archived_at: null, created_at: t, updated_at: t,
      volumetric_ooip_stb: 270.6e6, volumetric_ogip_scf: null, volumetric_estimate_source: 'Ahmed, Example 11-3, volumetric estimate',
      description: 'Tarek Ahmed, Reservoir Engineering Handbook, Example 11-3. Published OOIP 257 MMSTB (graphical); 270.6 MMSTB volumetric.',
    },
    {
      id: SAMPLE_CASE_IDS.dake, user_id: SAMPLE_USER.id, name: 'Dake Exercise 9.2 (water drive)', field_name: 'Dake Exercise 9.2', reservoir_name: 'Wedge reservoir',
      fluid_system: 'oil', has_aquifer: true, has_gas_cap: false, initial_pressure_psia: 2740, reservoir_temperature_f: 200,
      initial_water_saturation: 0.05, bubble_point_psia: 2740, archived_at: null, created_at: t, updated_at: t,
      volumetric_ooip_stb: 312e6, volumetric_ogip_scf: null, volumetric_estimate_source: 'Dake (1978), Exercise 9.2, volumetric estimate',
      description: 'Dake, Fundamentals of Reservoir Engineering, Exercise 9.2. N = 312 MMSTB; wedge aquifer, 140 degrees, reD = 5.',
    },
    {
      id: SAMPLE_CASE_IDS.pletcher, user_id: SAMPLE_USER.id, name: 'Pletcher gas with pot aquifer', field_name: 'SPE 75354 two-cell model', reservoir_name: null,
      fluid_system: 'gas', has_aquifer: true, has_gas_cap: false, initial_pressure_psia: 6411, reservoir_temperature_f: 239,
      initial_water_saturation: 0.15, bubble_point_psia: null, archived_at: null, created_at: t, updated_at: t,
      volumetric_ooip_stb: null, volumetric_ogip_scf: 100.8e9, volumetric_estimate_source: 'Pletcher (2002), Table 1, simulation model volume',
      description: 'Pletcher, SPE 75354, Tables 1 to 3. True OGIP 100.8 Bscf; aquifer 74.5 MM rb.',
    },
  ];
  const production = [
    ...AHMED.map(([p, bo, np, wp], i) => ({
      id: `pd-a-${i}`, case_id: SAMPLE_CASE_IDS.ahmed, timestep_index: i, pressure_psia: p, observation_date: `20${10 + i}-01-01`,
      cum_oil_stb: np * 1000, cum_gas_scf: np * 1000 * 500, cum_water_stb: wp * 1000, ...blank,
      bo_rb_stb: bo, rs_scf_stb: 500, bg_rb_mscf: 1.0, bw_rb_stb: 1.0, created_at: t,
    })),
    ...DAKE.map(([yr, p, np, rp, bo, rs, bg], i) => ({
      id: `pd-d-${i}`, case_id: SAMPLE_CASE_IDS.dake, timestep_index: i, pressure_psia: p, observation_date: `${1980 + yr}-01-01`,
      cum_oil_stb: np * 1e6, cum_gas_scf: np * 1e6 * rp, cum_water_stb: 0, ...blank,
      bo_rb_stb: bo, rs_scf_stb: rs, bg_rb_mscf: Number((bg * 1000).toFixed(6)), bw_rb_stb: 1.0, created_at: t,
    })),
    ...PLETCHER.map(([yr, p, gp, wp, z, bg, bw], i) => ({
      id: `pd-p-${i}`, case_id: SAMPLE_CASE_IDS.pletcher, timestep_index: i, pressure_psia: p, observation_date: `${2000 + yr}-01-01`,
      cum_oil_stb: 0, cum_gas_scf: gp * 1e9, cum_water_stb: wp, ...blank,
      bo_rb_stb: null, rs_scf_stb: null, bg_rb_mscf: bg, bw_rb_stb: bw, z_factor: z, created_at: t,
    })),
  ];
  const cfg = (id, caseId, over) => ({
    id, case_id: caseId, user_id: SAMPLE_USER.id, is_scenario: false, name: 'Default Config', created_at: t, updated_at: t,
    oil_gravity_api: null, gas_specific_gravity: null, water_salinity_ppm: null,
    formation_compressibility_psi: 6e-6, water_compressibility_psi: 3e-6,
    aquifer_model: 'none', aquifer_params: null, gas_cap_ratio_m: null, pvt_source: 'lab_table',
    pvt_correlations: { ...DEFAULT_CORRELATIONS }, pvt_lab_table: null, excluded_timesteps: [], solver_method: 'havlena_odeh',
    ...over,
  });
  const configs = [
    cfg('cfg-ahmed', SAMPLE_CASE_IDS.ahmed, {
      oil_gravity_api: 35, gas_specific_gravity: 0.7, water_salinity_ppm: 0,
      formation_compressibility_psi: 4.95e-6, water_compressibility_psi: 3.62e-6, gas_cap_ratio_m: 0,
    }),
    cfg('cfg-dake', SAMPLE_CASE_IDS.dake, {
      oil_gravity_api: 35, gas_specific_gravity: 0.7,
      formation_compressibility_psi: 4e-6, water_compressibility_psi: 3e-6, gas_cap_ratio_m: 0,
      aquifer_model: 'carter_tracy',
      aquifer_params: {
        aquifer_radius_ft: 9200, radius_ratio: 5, aquifer_thickness_ft: 100, aquifer_permeability_md: 200,
        aquifer_porosity: 0.25, aquifer_water_viscosity_cp: 0.55, theta_degrees: 140, aquifer_total_compressibility_psi: 7e-6,
      },
    }),
    cfg('cfg-pletcher', SAMPLE_CASE_IDS.pletcher, {
      gas_specific_gravity: 0.65, formation_compressibility_psi: 6e-6, water_compressibility_psi: 3e-6,
      aquifer_model: 'pot', excluded_timesteps: [1], solver_method: 'pot_aquifer_plot',
    }),
  ];
  const fluidProjects = [
    {
      id: SAMPLE_FLUID_PROJECT_ID, user_id: SAMPLE_USER.id, project_name: 'Virginia Hills oil PVT', created_at: t, updated_at: '2026-10-01T14:30:00.000Z',
      inputs_data: { name: 'Virginia Hills oil PVT', schema: 2, inputs: {}, pvt: sampleFluidBlock() },
    },
    {
      // a project saved before the fluid study kept its PVT block
      id: SAMPLE_FLUID_LEGACY_ID, user_id: SAMPLE_USER.id, project_name: 'Older fluid project', created_at: t, updated_at: '2026-07-01T09:00:00.000Z',
      inputs_data: { name: 'Older fluid project', schema: 1, inputs: {} },
    },
  ];
  return {
    rb_cases: cases, rb_production_data: production, rb_run_configs: configs, rb_runs: [], rb_results: [],
    saved_fluid_studio_projects: fluidProjects,
  };
}

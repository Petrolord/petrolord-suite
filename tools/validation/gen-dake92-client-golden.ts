#!/usr/bin/env node
// MB2 golden generator — server Carter-Tracy We history on Dake Exercise 9.2
// ============================================================================
// Run:
//   npx tsx tools/validation/gen-dake92-client-golden.ts
//
// Emits packages/engines/test-data/aquifer/dake92-we.json: the SERVER engine's
// Carter-Tracy cumulative-We history (finite aquifer, reD = 5, tanh-blended
// pseudo-steady-state pD) on the Dake Exercise 9.2 pressure history, computed
// from the shared book-verified fixture (tools/validation/fixtures/dake-9-2.ts,
// the same data as harness CASE 2C).
//
// The committed golden is GATE B of the §4.1 hard gate: the CLIENT engine
// (src/utils/aquiferInfluxCalculations.js carterTracy with reD) must track
// this history within the tolerance stated in
// src/utils/__tests__/aquiferInfluxCalculations.dake.test.js. Method note:
// the client marches with the EXACT bounded-circle pD (Stehfest-inverted
// van Everdingen-Hurst solution) while the server uses the Lee-Wattenbarger
// infinite-acting polynomial blended to PSS with a tanh switch, so a small
// systematic difference is expected and quantified in the test file.

import { computeCarterTracyWe } from '../../supabase/functions/_shared/mbal-engine.ts';
import { DAKE_CT_RESERVOIR, DAKE_CT_PERFORMANCE } from './fixtures/dake-9-2.ts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const inputs = {
  initial_pressure_psia: DAKE_CT_RESERVOIR.initial_pressure_psia,
  reservoir_temperature_f: DAKE_CT_RESERVOIR.reservoir_temperature_f,
  water_compressibility_psi: DAKE_CT_RESERVOIR.water_compressibility_psi,
  formation_compressibility_psi: DAKE_CT_RESERVOIR.formation_compressibility_psi,
  aquifer_model: 'carter_tracy',
  aquifer_params: {
    aquifer_radius_ft: DAKE_CT_RESERVOIR.aquifer_radius_ft,
    radius_ratio: DAKE_CT_RESERVOIR.aquifer_dim_radius_ratio,
    aquifer_thickness_ft: DAKE_CT_RESERVOIR.aquifer_thickness_ft,
    aquifer_permeability_md: DAKE_CT_RESERVOIR.aquifer_permeability_md,
    aquifer_porosity: DAKE_CT_RESERVOIR.aquifer_porosity,
    aquifer_water_viscosity_cp: DAKE_CT_RESERVOIR.aquifer_water_viscosity_cp,
    theta_degrees: DAKE_CT_RESERVOIR.aquifer_encroachment_angle_deg,
    aquifer_total_compressibility_psi: DAKE_CT_RESERVOIR.aquifer_total_compressibility_psi,
  },
  production_data: DAKE_CT_PERFORMANCE.map((row, idx) => ({
    timestep_index: idx,
    pressure_psia: row.p,
  })),
} as any;

const deltas = DAKE_CT_PERFORMANCE.map((_, i) => (i === 0 ? 0 : 365));
const We = computeCarterTracyWe(inputs, deltas);

const golden = {
  source:
    'Server mbal-engine computeCarterTracyWe on Dake Exercise 9.2 (tools/validation/fixtures/dake-9-2.ts). Regenerate with: npx tsx tools/validation/gen-dake92-client-golden.ts',
  generated: 'MB2 2026-07-18',
  aquifer_params: inputs.aquifer_params,
  dake_final_we_hve_mmrb: DAKE_CT_RESERVOIR.dake_final_we_hve_mmrb,
  series: DAKE_CT_PERFORMANCE.map((row, i) => ({
    yr: row.yr,
    t_days: row.yr * 365,
    p_psia: row.p,
    We_rb: We[i],
  })),
};

// The golden is canonical in @petrolord/engines. This writes into the
// vendored subtree copy; a regenerated golden must then be PR'd to
// Petrolord/petrolord-engines (test-data/aquifer/) and subtree-pulled —
// never left as a Suite-only edit of packages/engines.
const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'packages', 'engines', 'test-data', 'aquifer', 'dake92-we.json',
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(golden, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(`Final server We: ${(We.at(-1)! / 1e6).toFixed(2)} MM rb (Dake HvE reD=5: 89.2)`);

/**
 * A pressure history that rises under injection is saved and balanced.
 *
 * The Data tab refused any row whose pressure was above the row before it
 * ("The engine needs pressures that do not rise"), which the engine never
 * asked for. A waterflood that replaces more than its voidage lifts the
 * average pressure, so the Ekene history carried on through the flood
 * (2023 to 2025, tools/demo-video/seed/mbal_assets.mjs) could not be saved.
 * These gates read that file through the real import door, check the rules,
 * and run the canonical engine through the edge function's own mapping:
 * the same 12,139,208 stb with the injection in F, and a larger tank
 * without it (the negative control).
 */
import { validateRows, pressureNotes } from '../DataHub';
import { readProductionTable } from '@/pages/apps/reservoir-balance/lib/productionImport';
import { computeMaterialBalance } from '../../../../packages/engines/engines/mbal/mbalEngine.ts';
import { buildEngineInputs } from '../../../../supabase/functions/_shared/mbal-run-mapping.ts';

const CSV = `date,pressure_psia,cum_oil_stb,cum_gas_scf,cum_water_stb,bo_rb_stb,rs_scf_stb,bw_rb_stb,cum_water_inj_stb
2020-01-01,3200.0000,0.0000,0.00,0.0000,1.200000,400.00,1.0200,0.0000
2020-07-01,3037.7388,38864.2339,15545693.55,0.0000,1.202337,400.00,1.0200,0.0000
2021-01-01,2782.9151,99594.7404,39837896.16,0.0000,1.206006,400.00,1.0200,0.0000
2021-07-01,2562.1429,151911.9687,60764787.47,0.0000,1.209185,400.00,1.0200,0.0000
2022-01-01,2377.7087,195407.5932,78163037.28,0.0000,1.211841,400.00,1.0200,0.0000
2022-07-01,2226.2456,230985.2371,92394094.84,0.0000,1.214022,400.00,1.0200,0.0000
2023-01-01,2096.0083,261475.0400,104590016.00,0.0000,1.215897,400.00,1.0200,0.0000
2023-02-01,2092.9733,266202.0743,106480829.73,0.0000,1.215941184,400.00,1.0200,4789.4312
2023-08-01,2091.2352,294306.7469,117722698.77,0.0000,1.215966213,400.00,1.0200,37809.4947
2024-02-01,2098.2629,327121.2144,130848485.76,0.0000,1.215865014,400.00,1.0200,78880.0822
2024-08-01,2105.4274,360421.1181,144168447.24,49.5122,1.215761845,400.00,1.0200,120610.2295
2025-02-01,2112.2529,391579.4294,156631771.74,647.6040,1.215663558,400.00,1.0200,160235.9682
2025-08-01,2118.5159,418804.3584,167521743.36,2725.7207,1.215573370,400.00,1.0200,196492.7119
`;

const CASE = {
  fluid_system: 'oil', has_gas_cap: false, initial_pressure_psia: 3200, reservoir_temperature_f: 180,
  initial_water_saturation: 0.35, bubble_point_psia: 2000,
};
const CONFIG = {
  aquifer_model: 'none', pvt_source: 'correlations', oil_gravity_api: 32, water_salinity_ppm: 35000,
  formation_compressibility_psi: 4e-6, water_compressibility_psi: 3e-6, pvt_correlations: {}, excluded_timesteps: [],
};
const KIT_OOIP = 12139208.107496837;

const read = () => {
  const r = readProductionTable(CSV);
  expect(r.ok).toBe(true);
  return r.rows;
};
const run = (rows) => computeMaterialBalance(buildEngineInputs(CASE, CONFIG, rows.map((r, i) => ({ ...r, timestep_index: i }))));

describe('Data tab: a pressure that rises under injection', () => {
  test('R-1 the flood-era file reads 13 rows with the injection column', () => {
    const rows = read();
    expect(rows).toHaveLength(13);
    expect(rows[12].cum_water_inj_stb).toBeCloseTo(196492.7119, 4);
    expect(rows[9].pressure_psia).toBeGreaterThan(rows[8].pressure_psia);
  });

  test('R-2 rising rows do not stop the save, and injected rises carry no note', () => {
    const rows = read();
    expect(validateRows(rows, CASE)).toEqual([]);
    expect(pressureNotes(rows, CASE)).toEqual([]);
  });

  test('R-3 a rise with no new injection is noted, never refused', () => {
    const rows = read().map((r) => ({ ...r, cum_water_inj_stb: 0 }));
    expect(validateRows(rows, CASE)).toEqual([]);
    const notes = pressureNotes(rows, CASE);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^The pressure rises at rows 9, 10, 11, 12 with no injection on those rows\./);
  });

  test('R-4 a row above the initial pressure is noted as left out of the fit', () => {
    const rows = read().slice(0, 3);
    rows[2] = { ...rows[2], pressure_psia: 3300 };
    expect(validateRows(rows, CASE)).toEqual([]);
    expect(pressureNotes(rows, CASE).join(' ')).toMatch(/Row 2 is above the initial pressure \(3,200\.0 psia\)/);
  });

  // The kit's own seven rows (Bo to six places) return 12,139,560 stb, 2.9e-5
  // from the kit's exact figure; the gate allows that rounding and no more.
  test('R-5 the engine balances the flood rows: the same OOIP as the kit, r2 to six places', () => {
    const res = run(read());
    expect(res.estimated_ooip_stb / KIT_OOIP - 1).toBeLessThan(5e-5);
    expect(res.estimated_ooip_stb / KIT_OOIP - 1).toBeGreaterThan(-5e-5);
    expect(res.r_squared).toBeGreaterThan(0.999999);
    expect(res.n_data_points).toBe(12);
  });

  test('R-6 negative control: the same rows without the injection make the tank larger', () => {
    const res = run(read().map((r) => ({ ...r, cum_water_inj_stb: 0 })));
    expect(res.estimated_ooip_stb).toBeGreaterThan(1.05 * KIT_OOIP);
  });

  test('R-7 the first rule still holds: the initial row has no cumulatives', () => {
    const rows = read();
    rows[0] = { ...rows[0], cum_water_inj_stb: 10 };
    expect(validateRows(rows, CASE).map((e) => e.message).join(' ')).toMatch(/must have no cumulative injected water/);
  });
});

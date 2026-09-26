// Dev-only harness (/dev/material-balance-studio, DEV builds only; senior
// test T1, 2026-09-26): Material Balance Studio on an in-memory copy of the
// rb_* tables, seeded with Tarek Ahmed Example 11-3 (depletion-drive oil,
// Table 11-3; published OOIP 257 MMSTB graphical, 270.6 volumetric), and a
// calculate-mbal stand-in that runs the canonical engine in the browser with
// the edge function's own row mapping (supabase/functions/calculate-mbal).
// Supabase is swapped while mounted and restored on unmount.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import ReservoirBalance from '../ReservoirBalance';
import { computeMaterialBalance, runHistoryMatch } from '../../../../../packages/engines/engines/mbal/mbalEngine';

const USER = { id: 'dev-user', email: 'harness@petrolord.dev' };
const NOW = () => new Date().toISOString();

// Ahmed Table 11-3: p (psia), Bo (rb/STB), Np (MSTB), Wp (MSTB); all above Pb 1500
const AHMED = [
  [3685, 1.3102, 0, 0], [3680, 1.3104, 20.481, 0], [3676, 1.3104, 34.75, 0],
  [3667, 1.3105, 78.557, 0], [3664, 1.3105, 101.846, 0], [3640, 1.3109, 215.681, 0],
  [3605, 1.3116, 364.613, 0], [3567, 1.3122, 542.985, 0.159], [3515, 1.3128, 841.591, 0.805],
  [3448, 1.313, 1273.53, 2.579], [3360, 1.315, 1691.887, 5.008], [3275, 1.316, 2127.077, 6.5],
  [3188, 1.317, 2575.33, 8.0],
];

function seed() {
  const caseId = 'case-ahmed-11-3';
  const t = NOW();
  return {
    rb_cases: [{
      id: caseId, user_id: USER.id, name: 'Ahmed Example 11-3 (depletion drive)', field_name: 'Ahmed REH Table 11-3', fluid_system: 'oil',
      has_aquifer: false, has_gas_cap: false, initial_pressure_psia: 3685, reservoir_temperature_f: 175,
      initial_water_saturation: 0.24, bubble_point_psia: 1500, archived_at: null, created_at: t, updated_at: t,
      description: 'Tarek Ahmed, Reservoir Engineering Handbook, Example 11-3. Published OOIP 257 MMSTB (graphical); 270.6 MMSTB volumetric.',
    }],
    rb_production_data: AHMED.map(([p, bo, np, wp], i) => ({
      id: `pd-${i}`, case_id: caseId, timestep_index: i, pressure_psia: p,
      observation_date: `20${10 + i}-01-01`,
      cum_oil_stb: np * 1000, cum_gas_scf: np * 1000 * 500, cum_water_stb: wp * 1000,
      cum_water_inj_stb: 0, cum_gas_inj_scf: 0, bo_rb_stb: bo, rs_scf_stb: 500, bg_rb_mscf: 1.0, bw_rb_stb: 1.0,
    })),
    rb_run_configs: [{
      id: 'cfg-ahmed', case_id: caseId, user_id: USER.id, is_scenario: false, name: 'Default Config', created_at: t, updated_at: t,
      oil_gravity_api: 35, gas_specific_gravity: 0.7, water_salinity_ppm: 0,
      formation_compressibility_psi: 4.95e-6, water_compressibility_psi: 3.62e-6,
      aquifer_model: 'none', aquifer_params: null, gas_cap_ratio_m: 0, pvt_source: 'lab_table',
      pvt_correlations: { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson', z_factor: 'hall_yarborough', water: 'mccain', gas_viscosity: 'lee_gonzalez_eakin' },
      pvt_lab_table: null, excluded_timesteps: [],
    }],
    rb_runs: [],
    rb_results: [],
  };
}

let DB = seed();
let seq = 0;
const newId = (p) => `${p}-${Date.now()}-${++seq}`;

// a small PostgREST-shaped query builder over DB
function query(table) {
  const st = { filters: [], order: null, limit: null, op: 'select', payload: null, returning: false, onConflict: null, join: false };
  const rows = () => (DB[table] || []);
  const match = (r) => st.filters.every(([k, op, v]) => (op === 'eq' ? r[k] === v : op === 'is' ? (r[k] ?? null) === v : op === 'in' ? v.includes(r[k]) : true));
  const run = () => {
    if (st.op === 'insert' || st.op === 'upsert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: r.id || newId(table), created_at: NOW(), updated_at: NOW(), ...r }));
      for (const r of list) {
        if (st.op === 'upsert' && st.onConflict) {
          const keys = st.onConflict.split(',');
          const i = rows().findIndex((x) => keys.every((k) => x[k] === r[k]));
          if (i >= 0) { DB[table][i] = { ...DB[table][i], ...r, id: DB[table][i].id }; continue; }
        }
        DB[table] = [...rows(), r];
      }
      return list;
    }
    if (st.op === 'update') {
      const out = [];
      DB[table] = rows().map((r) => (match(r) ? (out.push({ ...r, ...st.payload, updated_at: NOW() }), out[out.length - 1]) : r));
      return out;
    }
    if (st.op === 'delete') {
      const gone = rows().filter(match);
      DB[table] = rows().filter((r) => !match(r));
      return gone;
    }
    let out = rows().filter(match);
    if (st.order) {
      const [k, asc] = st.order;
      out = [...out].sort((a, b) => ((a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)));
    }
    if (st.limit != null) out = out.slice(0, st.limit);
    if (st.join && table === 'rb_runs') out = out.map((r) => ({ ...r, rb_results: (DB.rb_results || []).filter((x) => x.run_id === r.id) }));
    return out;
  };
  const q = {
    select(cols) { if (st.op !== 'select') st.returning = true; if (typeof cols === 'string' && cols.includes('rb_results(')) st.join = true; return q; },
    eq(k, v) { st.filters.push([k, 'eq', v]); return q; },
    is(k, v) { st.filters.push([k, 'is', v]); return q; },
    in(k, v) { st.filters.push([k, 'in', v]); return q; },
    neq() { return q; },
    order(k, o = {}) { st.order = [k, o.ascending !== false]; return q; },
    limit(n) { st.limit = n; return q; },
    insert(p) { st.op = 'insert'; st.payload = p; return q; },
    upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.onConflict = o.onConflict || null; return q; },
    update(p) { st.op = 'update'; st.payload = p; return q; },
    delete() { st.op = 'delete'; return q; },
    single() { const r = run(); return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }); },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] ?? null, error: null }); },
    then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
  };
  return q;
}

// calculate-mbal, as supabase/functions/calculate-mbal/index.ts maps it
async function calculateMbal(body) {
  const mode = body.mode ?? 'regression';
  const cfg = DB.rb_run_configs.find((r) => r.id === body.run_config_id);
  if (!cfg) return { data: null, error: { message: 'Run config not found or not accessible' } };
  const rbCase = DB.rb_cases.find((r) => r.id === cfg.case_id);
  const prod = DB.rb_production_data.filter((r) => r.case_id === cfg.case_id).sort((a, b) => a.timestep_index - b.timestep_index);
  if (prod.length < 2) return { data: null, error: { message: 'Insufficient production data' } };
  const started = Date.now();
  const run = { id: newId('run'), case_id: rbCase.id, run_config_id: cfg.id, status: 'running', started_at: NOW(), run_type: mode === 'history_match' ? 'history_match' : 'single', engine_version: 'harness' };
  DB.rb_runs = [...DB.rb_runs, run];
  const production_data = prod.map((r) => ({
    timestep_index: r.timestep_index, pressure_psia: r.pressure_psia, observation_date: r.observation_date ?? undefined,
    cum_oil_stb: r.cum_oil_stb ?? 0, cum_gas_scf: r.cum_gas_scf ?? 0, cum_water_stb: r.cum_water_stb ?? 0,
    cum_water_inj_stb: r.cum_water_inj_stb ?? 0, cum_gas_inj_scf: r.cum_gas_inj_scf ?? 0,
    bo_rb_stb: r.bo_rb_stb ?? undefined, rs_scf_stb: r.rs_scf_stb ?? undefined, bg_rb_mscf: r.bg_rb_mscf ?? undefined,
    bw_rb_stb: r.bw_rb_stb ?? undefined, z_factor: r.z_factor ?? undefined, observed_we_rb: r.observed_we_rb ?? undefined,
  }));
  const inputs = {
    fluid_system: rbCase.fluid_system, has_aquifer: rbCase.has_aquifer, has_gas_cap: rbCase.has_gas_cap,
    initial_pressure_psia: rbCase.initial_pressure_psia, reservoir_temperature_f: rbCase.reservoir_temperature_f,
    initial_water_saturation: rbCase.initial_water_saturation, bubble_point_psia: rbCase.bubble_point_psia ?? undefined,
    oil_gravity_api: cfg.oil_gravity_api ?? undefined, gas_specific_gravity: cfg.gas_specific_gravity ?? undefined,
    water_salinity_ppm: cfg.water_salinity_ppm ?? undefined, formation_compressibility_psi: cfg.formation_compressibility_psi,
    water_compressibility_psi: cfg.water_compressibility_psi, aquifer_model: cfg.aquifer_model ?? 'none',
    aquifer_params: cfg.aquifer_params ?? undefined, gas_cap_ratio_m: cfg.gas_cap_ratio_m ?? undefined,
    pvt_source: cfg.pvt_source, pvt_correlations: cfg.pvt_correlations, pvt_lab_table: cfg.pvt_lab_table ?? undefined,
    excluded_timesteps: cfg.excluded_timesteps ?? [], production_data,
  };
  let r; let hm = null;
  try {
    if (mode === 'history_match') { hm = runHistoryMatch(inputs, body.history_match || {}); r = hm.forward; } else r = computeMaterialBalance(inputs);
  } catch (e) {
    DB.rb_runs = DB.rb_runs.map((x) => (x.id === run.id ? { ...x, status: 'failed', error_message: e.message } : x));
    return { data: null, error: { message: 'Engine error', context: { json: async () => ({ error: 'Engine error', detail: e.message }) } } };
  }
  const ex = new Set(cfg.excluded_timesteps ?? []);
  const col = (f) => r.per_timestep.map(f);
  const plot_data = {
    timestep_index: col((p) => p.timestep_index), pressure: col((p) => p.pressure_psia), delta_p: col((p) => p.delta_p_psi),
    F: col((p) => p.F_rb), Et: col((p) => p.Et_rb), Eo: col((p) => p.Eo_rb_stb ?? null), Eg_rb_mscf: col((p) => p.Eg_rb_mscf ?? null),
    Eg_oil: col((p) => p.Eg_rb_stb ?? null), Bw: col((p) => p.bw_rb_stb ?? null), Efw: col((p) => p.Efw_rb), We: col((p) => p.We_rb ?? null),
    p_over_z: col((p) => p.p_over_z ?? null), ddi: col((p) => p.ddi ?? null), gdi: col((p) => p.gdi ?? null), wdi: col((p) => p.wdi ?? null),
    cdi: col((p) => p.cdi ?? null), sdi: col((p) => p.cdi ?? null), drive_index_sum: col((p) => p.drive_index_sum ?? null),
    cum_oil_stb: production_data.map((p) => p.cum_oil_stb ?? null), cum_gas_scf: production_data.map((p) => p.cum_gas_scf ?? null),
    cum_water_stb: production_data.map((p) => p.cum_water_stb ?? null),
    point_in_fit: col((p) => p.timestep_index > 0 && !ex.has(p.timestep_index)), solver_method_used: r.solver_method_used ?? null,
    history_match: hm ? {
      observed_pressure_psia: hm.observed_pressure_psia, simulated_pressure_psia: hm.simulated_pressure_psia, residual_psi: hm.residual_psi,
      point_in_fit: hm.point_in_fit, rms_error_psi: hm.rms_error_psi, max_abs_error_psi: hm.max_abs_error_psi, ssr_psi2: hm.ssr_psi2,
      iterations: hm.iterations, converged: hm.converged, matched_parameters: hm.matched_parameters, validation_tier: hm.validation_tier,
      validation_reference: hm.validation_reference ?? null, observation_date: production_data.map((p) => p.observation_date ?? null),
    } : null,
  };
  const result = {
    id: newId('res'), run_id: run.id, case_id: rbCase.id,
    estimated_ooip_stb: hm ? hm.matched_ooip_stb ?? null : r.estimated_ooip_stb ?? null,
    estimated_ogip_scf: hm ? hm.matched_ogip_scf ?? null : r.estimated_ogip_scf ?? null,
    r_squared: r.r_squared, regression_slope: r.regression_slope, regression_intercept: r.regression_intercept, n_data_points: r.n_data_points,
    aquifer_owip_rb: r.aquifer_owip_rb ?? null, aquifer_cumulative_we_rb: r.aquifer_cumulative_we_rb ?? null, aquifer_fit_quality: r.aquifer_fit_quality ?? null,
    final_ddi: r.final_ddi ?? null, final_gdi: r.final_gdi ?? null, final_wdi: r.final_wdi ?? null, final_sdi: r.final_cdi ?? null, final_cdi: r.final_cdi ?? null,
    final_drive_index_sum: r.final_drive_index_sum ?? null, drive_mechanism: r.drive_mechanism, aquifer_strength: r.aquifer_strength,
    warnings: hm ? [...hm.warnings, ...r.warnings] : r.warnings, plot_data, created_at: NOW(),
  };
  DB.rb_results = [...DB.rb_results, result];
  DB.rb_runs = DB.rb_runs.map((x) => (x.id === run.id ? { ...x, status: 'completed', completed_at: NOW(), duration_ms: Date.now() - started } : x));
  return {
    data: {
      run_id: run.id, result_id: result.id, duration_ms: Date.now() - started,
      summary: { estimated_ooip_stb: result.estimated_ooip_stb, estimated_ogip_scf: result.estimated_ogip_scf, r_squared: r.r_squared, drive_mechanism: r.drive_mechanism, aquifer_strength: r.aquifer_strength, final_drive_index_sum: r.final_drive_index_sum, warnings: result.warnings, history_match: hm ? { matched_parameters: hm.matched_parameters, rms_error_psi: hm.rms_error_psi, iterations: hm.iterations, converged: hm.converged } : null },
    },
    error: null,
  };
}

export default function MbalHarness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // DB is seeded once per page load, so moving between the case list and a
    // case (a remount) keeps the runs made so far
    const saved = { from: supabase.from, getUser: supabase.auth.getUser };
    supabase.from = (t) => query(t);
    // supabase.functions is a getter that builds a new client on every read,
    // so patching .invoke on it does nothing: shadow the getter instead
    const fakeFunctions = {
      invoke: async (name, opts = {}) => (name === 'calculate-mbal'
        ? calculateMbal(opts.body || {})
        : { data: null, error: { message: `${name} is not available on the harness` } }),
    };
    Object.defineProperty(supabase, 'functions', { configurable: true, get: () => fakeFunctions });
    supabase.auth.getUser = async () => ({ data: { user: USER }, error: null });
    setReady(true);
    return () => {
      supabase.from = saved.from;
      delete supabase.functions; // back to the prototype getter
      supabase.auth.getUser = saved.getUser;
    };
  }, []);
  return ready ? <div data-testid="mbal-harness"><ReservoirBalance /></div> : null;
}

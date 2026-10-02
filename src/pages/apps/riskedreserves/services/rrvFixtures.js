// ReservoirCalc Pro prospect rows for the Risked Reserves harness and its
// tests: what Prospect Risking saves today (unit, basis and the source of
// the volumes), and one row as it was saved before units and the basis were
// recorded (PL5: an old saved state must still open).

const source = (reservoirName, inPlace, seed) => ({
  schema: 'rcp-source-1', app: 'ReservoirCalc Pro', projectId: 'project-ekene', projectName: 'Ekene Block', reservoirName,
  method: 'Hybrid (top surface + constant gross thickness, cut by the contacts)', fluidType: 'oil', unitSystem: 'field',
  volumesFrom: 'monte-carlo', volumesEdited: false,
  run: { ranAt: '2026-10-01T11:00:00.000Z', seed, iterations: 10000, grvMode: 'structural', signature: `sig-${seed}` },
  inPlace: { stream: 'STOIIP', unit: 'MMbbl', ...inPlace },
  recovery: { input: 25, effectiveMean: 0.25, distributed: false },
});

export const RRV_SEED_PROSPECTS = [
  {
    name: 'Ekene North', updated_at: '2026-10-02T14:05:00.000Z', app_build: 'harness',
    pg_factors: { trap: 0.8, reservoir: 0.8, charge: 0.5, seal: 1 },
    inputs: { mean: 38, p90: 12, p50: 30, p10: 75, unit: 'MMbbl', basis: 'recoverable', source: source('D-07 sand', { p90: 48, p50: 120, p10: 300, mean: 152 }, 123) },
    risked: { pg: 0.32, risked_mean: 12.2, success: { p90: 12, p50: 30, p10: 75, mean: 38 } },
  },
  {
    name: 'Ekene Deep', updated_at: '2026-10-02T14:20:00.000Z', app_build: 'harness',
    pg_factors: { trap: 0.6, reservoir: 0.6, charge: 0.5, seal: 1 },
    inputs: { mean: 118, p90: 40, p50: 95, p10: 230, unit: 'MMbbl', basis: 'recoverable', source: source('E-02 sand', { p90: 160, p50: 380, p10: 920, mean: 472 }, 456) },
    risked: { pg: 0.18, risked_mean: 21.2, success: { p90: 40, p50: 95, p10: 230, mean: 118 } },
  },
];

/** As the G5 release saved it: no unit, no basis, no source. */
export const RRV_LEGACY_PROSPECT = {
  name: 'Ekene Legacy',
  pg_factors: { trap: 0.7, reservoir: 0.6, charge: 0.6, seal: 0.8 },
  inputs: { mean: 52, p90: 20, p50: 45, p10: 96 },
  risked: { pg: 0.2016, risked_mean: 10.5, success: { p90: 20, p50: 45, p10: 96, mean: 52 } },
};

/** The browser list as the T1 build (2026-09-26) wrote it under rrv.prospects.v1. */
export const RRV_T1_BROWSER_LIST = [
  { id: 'rcp-prospect-1', source: 'rcp', rcpId: 'prospect-1', name: 'Ekene North', pg: 0.32, p90: 12, p50: 30, p10: 75, volumeNote: 'saved before the basis was recorded: these may be in-place volumes, check before valuing', basis: null, chargeNote: '', mefs: 15, unitValue: 9.5, devCost: 100, wellCost: 25 },
  { id: 'own-1758880000000-2', source: 'own', name: 'Typed lead', pg: 0.25, p90: 10, p50: 25, p10: 60, mefs: 10, unitValue: 8, devCost: 100, wellCost: 25 },
];

/**
 * What ReservoirCalc Pro hands its Prospect Risking panel after a Monte
 * Carlo run (the chain harness): recoverable success-case volumes in MMSTB,
 * and the source block of the project, reservoir and run behind them.
 */
export const CHAIN_RUN = {
  unrisked: { mean: 44, p90: 18, p50: 39, p10: 82, unit: 'MMbbl', basis: 'recoverable' },
  source: {
    schema: 'rcp-source-1', app: 'ReservoirCalc Pro', build: 'harness', projectId: 'project-chain', projectName: 'Chain Block', reservoirId: 'reservoir-1', reservoirName: 'C-01 sand',
    method: 'Surfaces (top and base surfaces, cut by the contacts)', fluidType: 'oil', unitSystem: 'field',
    run: { ranAt: '2026-10-02T09:30:00.000Z', seed: 777, iterations: 20000, grvMode: 'structural', signature: 'sig-777', correlations: [{ a: 'porosity', b: 'sw', rho: -0.8 }] },
    inPlace: { stream: 'STOIIP', unit: 'MMbbl', p90: 64, p50: 139, p10: 293, mean: 157 },
    recovery: { input: 28, effectiveMean: 0.28, distributed: false },
  },
};

/**
 * Petroleum Economics Studio runs for the harness and the tests, in the
 * shape that app saves (an epe_runs row, its case name, the KPIs of its
 * epe_results row and its run configuration). The numbers are harness
 * figures for a development of about 45 MMboe; the sender is also tested
 * on a run the cash-flow engine itself computed (epe/__tests__/epeUnitValue).
 */
export const RRV_EPE_RUNS = [
  {
    run: { id: 'epe-run-1', case_id: 'epe-case-1', user_id: 'dev', run_name: 'Base deck, 10%', run_config_id: 'epe-cfg-1', created_at: '2026-10-01T09:00:00.000Z' },
    caseName: 'Ekene North development',
    resultsAt: '2026-10-01T09:00:07.000Z',
    config: { id: 'epe-cfg-1', config_name: 'Corporate base 2026', oil_price_usd_bbl: 72, gas_price_usd_mscf: 3.5, condensate_price_usd_bbl: 68 },
    kpis: {
      engine_version: '3.12.0', npv: 250e6, total_boe: 45e6, pv_capex: 320e6, dpi: 250 / 320, discount_rate_applied_pct: 10, pv_basis: 'real',
      discounting_convention: 'end_year', fiscal_regime: 'PIA', fiscal_framework: 'pia_only_then_nta_2025', working_interest_pct: 100,
    },
  },
  {
    run: { id: 'epe-run-2', case_id: 'epe-case-1', user_id: 'dev', run_name: 'Low deck, 12%', run_config_id: 'epe-cfg-2', created_at: '2026-10-01T09:30:00.000Z' },
    caseName: 'Ekene North development',
    resultsAt: '2026-10-01T09:30:06.000Z',
    config: { id: 'epe-cfg-2', config_name: 'Low case 2026', oil_price_usd_bbl: 55, gas_price_usd_mscf: 3, condensate_price_usd_bbl: 52 },
    kpis: {
      engine_version: '3.12.0', npv: 96e6, total_boe: 45e6, pv_capex: 310e6, dpi: 96 / 310, discount_rate_applied_pct: 12, pv_basis: 'real',
      discounting_convention: 'end_year', fiscal_regime: 'PIA', fiscal_framework: 'pia_only_then_nta_2025', working_interest_pct: 100,
    },
  },
  {
    run: { id: 'epe-run-3', case_id: 'epe-case-1', user_id: 'dev', run_name: 'Draft, not finished', run_config_id: 'epe-cfg-1', created_at: '2026-10-01T10:00:00.000Z' },
    caseName: 'Ekene North development', resultsAt: null, config: null, kpis: null,
  },
];

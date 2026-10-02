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

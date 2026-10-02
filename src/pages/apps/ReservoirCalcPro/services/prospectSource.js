// Where a prospect's volumes came from (RL re-check, 2026-10-02; reviewer
// lens RL11, and the first of the three things the "Re-run prospect"
// follow-up needs: docs/upgrade/ReservoirCalcPro-UPGRADE.md, owner item 3).
// A prospect row used to carry volumes with a unit and a basis and nothing
// on the project, the reservoir or the Monte Carlo run behind them, so
// Risked Reserves Valuation could state "from ReservoirCalc Pro" and no
// more. This block is saved in the row's `inputs.source` and read there.
// Pure.

import { buildLabel } from '@/lib/platformBuild';
import { runVolumeUnit } from './prospectVolumes';

const METHOD = {
  simple: 'Simple (area x gross thickness)',
  hybrid: 'Hybrid (top surface + constant gross thickness, cut by the contacts)',
  surfaces: 'Surfaces (top and base surfaces, cut by the contacts)',
  areadepth: 'Area/depth table',
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const sig = (v) => (finite(v) ? Number(v.toPrecision(6)) : null);

/**
 * @param {object} state the ReservoirCalc Pro workspace state
 * @param {{build?: string}} [o]
 * @returns {object} the source block, with `run` and `inPlace` null when no
 *   Monte Carlo run is in the workspace
 */
export function prospectSourceFromState(state, { build = buildLabel() } = {}) {
  const pr = state?.probResults;
  const m = pr?.meta || null;
  const stats = pr?.stats || null;
  const fluidType = m?.fluidType || state?.inputs?.fluidType || 'oil';
  const unitSystem = m?.unitSystem || state?.unitSystem || 'field';
  const gas = fluidType === 'gas';
  const stream = gas ? stats?.giip : stats?.stooip;
  const rec = gas ? stats?.recoverableGas : stats?.recoverableOil;
  const scale = gas ? 1e-9 : 1e-6;
  const hasRun = !!(stats && finite(stream?.mean) && stream.mean > 0);
  const rfKey = gas ? 'recoveryGas' : 'recovery';
  const rfInput = Number(state?.inputs?.[rfKey]);
  return {
    schema: 'rcp-source-1',
    app: 'ReservoirCalc Pro',
    build,
    projectId: state?.project?.id || null,
    projectName: state?.currentProjectMeta?.name || state?.project?.name || null,
    reservoirId: state?.activeReservoirId || null,
    reservoirName: state?.reservoirName || null,
    method: METHOD[state?.inputMethod] || state?.inputMethod || null,
    fluidType,
    unitSystem,
    run: hasRun && m ? {
      ranAt: m.ranAt || null, seed: finite(m.seed) ? m.seed : null, iterations: m.iterations || stats.iterations || null,
      grvMode: m.grvMode || null, signature: m.signature || null, correlations: Array.isArray(m.correlations) ? m.correlations : null,
    } : null,
    // the in-place volumes the recoverable ones were made from, in the unit
    // the inventory uses for this fluid (the oil leg for oil with a gas cap)
    inPlace: hasRun ? {
      stream: gas ? 'GIIP' : 'STOIIP', unit: runVolumeUnit(gas ? 'gas' : 'oil', unitSystem),
      p90: sig(stream.p90 * scale), p50: sig(stream.p50 * scale), p10: sig(stream.p10 * scale), mean: sig(stream.mean * scale),
    } : null,
    recovery: {
      input: Number.isFinite(rfInput) ? rfInput : null,
      effectiveMean: hasRun && finite(rec?.mean) && stream.mean > 0 ? sig(rec.mean / stream.mean) : null,
      distributed: !!m?.inputs?.[rfKey]?.variable,
    },
  };
}

/**
 * The block as saved with one prospect: whether its volumes are the run's
 * or were typed, and whether the run's were edited before saving.
 * @param {?object} source prospectSourceFromState(...)
 * @param {{seeded: ?object, vol: object}} a `seeded` is what the run put in
 *   the volume fields (null when the user typed them), `vol` what they hold now
 */
export function sourceForProspect(source, { seeded, vol }) {
  if (!source) return null;
  const fromRun = !!seeded;
  const edited = fromRun && ['mean', 'p90', 'p50', 'p10'].some((k) => String(vol?.[k] ?? '') !== String(seeded[k] ?? ''));
  const out = { ...source, volumesFrom: fromRun ? 'monte-carlo' : 'entered', volumesEdited: edited, savedAt: new Date().toISOString() };
  // volumes typed by hand were not made from the workspace's run
  if (!fromRun) { out.run = null; out.inPlace = null; out.recovery = { ...source.recovery, effectiveMean: null }; }
  return out;
}

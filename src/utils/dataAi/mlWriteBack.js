// ML Workbench (Data & AI D2): a predicted curve written back to a well.
//
// The prediction becomes a NEW curve in the wells registry, through the
// registry's own write path (wellsRegistry.saveLog, the one every Suite app
// that publishes a computed curve uses). A measured curve is never
// overwritten: saveLog only inserts, and the mnemonic must differ from every
// curve the well already has, so the target keeps its own name and the
// prediction carries a suffix (DT_ML by default).
//
// Provenance travels with the curve: the method, the features and their
// transforms, the training wells and rows, the validation scheme and its
// pooled scores, and the engine version, so anyone reading the curve later
// can see it is a model output and how good the model was on held-out wells.
import { ENGINE_VERSION, ENGINE_COMMIT } from '@/utils/dataAi/mlWorkflows';
import { baseName } from '@/utils/dataAi/mlData';

export const DEFAULT_SUFFIX = '_ML';

/** The first free mnemonic target_ML, target_ML2, ... on a well. */
export function suggestMnemonic(target, existing = []) {
  const taken = new Set(existing.map(baseName));
  const stem = `${baseName(target)}${DEFAULT_SUFFIX}`;
  if (!taken.has(stem)) return stem;
  for (let k = 2; k < 1000; k += 1) if (!taken.has(`${stem}${k}`)) return `${stem}${k}`;
  return `${stem}${Date.now()}`;
}

/** null when the mnemonic can be written, else the reason it cannot. */
export function mnemonicProblem(mnemonic, target, existing = []) {
  const m = String(mnemonic ?? '').trim();
  if (!m) return 'Give the predicted curve a mnemonic.';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(m)) return 'A mnemonic starts with a letter and uses only letters, digits and underscores.';
  if (baseName(m) === baseName(target)) return `The prediction cannot be named ${baseName(target)}: that is the measured curve's name. Keep a suffix such as ${DEFAULT_SUFFIX}.`;
  if (existing.map(baseName).includes(baseName(m))) return `This well already has a curve named ${baseName(m)}. Choose another name; the workbench never overwrites a stored curve.`;
  return null;
}

/** The provenance stored with a predicted curve. */
export function mlProvenance({
  design, parsed, evaluation, final, target, table, wellName, projectName,
}) {
  const pooled = evaluation?.pooled && !evaluation.pooled.error ? evaluation.pooled : null;
  return {
    computed: true,
    engine: 'ml-workbench',
    operation: 'missing-log-prediction',
    engine_version: ENGINE_VERSION,
    engine_commit: ENGINE_COMMIT,
    method: parsed.model.kind,
    lambda: parsed.model.kind === 'ridge' ? parsed.model.lambda : undefined,
    standardised: parsed.standardise,
    scaling: parsed.standardise ? 'z-score, population SD, fitted on the training rows' : 'none',
    target,
    features: design.features.map((f) => (f.log ? `log10(${f.name})` : f.name)),
    coefficients: final?.fit?.coefficients,
    coefficient_names: final?.fit?.names,
    scaler: final?.scaler ? { centre: final.scaler.centre, scale: final.scaler.scale } : null,
    training_wells: design.wells.map((w) => w.name),
    training_rows: design.X.length,
    source_label: table?.label,
    validation: evaluation ? {
      scheme: evaluation.scheme === 'kfold' ? `group k-fold, k = ${evaluation.k}` : `group split, test fraction ${evaluation.testFraction}`,
      seed: evaluation.seed,
      pooled_rmse: pooled?.rmse,
      pooled_mae: pooled?.mae,
      pooled_r2: pooled?.r2,
      held_out_rows: evaluation.tested?.length,
    } : null,
    predicted_well: wellName,
    run_name: projectName || null,
    created_at: new Date().toISOString(),
  };
}

/**
 * The prepared log (the shape wellsRegistry.saveLog takes) for a predicted
 * curve: one value per depth sample of the well, NaN (the registry's null)
 * where a feature was missing so no prediction was made.
 */
export function buildPredictedLog({
  block, values, at, mnemonic, unit, description, provenance,
}) {
  const data = new Float32Array(block.n).fill(NaN);
  at.forEach((row, j) => { data[row] = values[j]; });
  let nullCount = 0;
  for (let i = 0; i < data.length; i += 1) if (!Number.isFinite(data[i])) nullCount += 1;
  return {
    mnemonic: String(mnemonic).trim(),
    description,
    unit: unit || '',
    data,
    startMdM: block.grid.startMdM,
    stopMdM: block.grid.stopMdM,
    stepM: block.grid.stepM,
    nSamples: data.length,
    nullCount,
    provenance: { ...provenance, input_log_ids: Object.values(block.logIds), depth_log_id: block.depthLogId },
  };
}

// Timesteps the analyst leaves out of the fit, with a reason (MBAL-U2-003).
//
// The engine has always read `excluded_timesteps` from the run config
// (packages/engines/engines/mbal/mbalEngine.ts: every regression skips them)
// and no screen set them. They are picked here from the regression plot and
// from the data table, each with the reason the analyst gives.
//
// Where it is kept:
//   - the list is the engine input `excluded_timesteps` of the case default
//     config (rb_run_configs), which a run copies; so a change of the list
//     makes the stored run stale (lib/runStaleness.js compares it);
//   - the reasons are a record of the study (lib/studyMeta.js, key
//     `exclusions`), never handed to the engine; so a change of a reason
//     alone leaves the run current (reviewer lens RL8).
//
// Pure: no React, no I/O.
import { EMPTY_VALUE } from '@/lib/emptyValue';

const finiteInt = (v) => Number.isInteger(v) && v >= 0;

/** The excluded timesteps of a config, sorted and unique. */
export function excludedOf(cfg) {
  const list = Array.isArray(cfg?.excluded_timesteps) ? cfg.excluded_timesteps : [];
  return [...new Set(list.map(Number).filter(finiteInt))].sort((a, b) => a - b);
}

/**
 * The new list and reasons after the analyst excludes or restores one timestep.
 * @param {{excluded: number[], reasons: Object<string,string>, steps: number[]}} state
 *   steps: the timestep indices of the data table
 * @param {number} step
 * @param {{exclude: boolean, reason?: string}} change
 * @returns {{excluded: number[], reasons: Object<string,string>}|{error: string}}
 */
export function applyExclusion(state, step, { exclude, reason = '' }) {
  const steps = new Set(state.steps ?? []);
  if (!steps.has(step)) return { error: `Timestep ${step} is not in the data table of this case.` };
  if (step === 0) return { error: 'The initial state is never in the fit: it has no production, so there is nothing to exclude.' };
  const excluded = new Set(state.excluded ?? []);
  const reasons = { ...(state.reasons ?? {}) };
  if (exclude) {
    const why = String(reason ?? '').trim();
    if (!why) return { error: 'Give the reason this point is left out. The report prints it beside the point.' };
    excluded.add(step);
    reasons[String(step)] = why.slice(0, 300);
  } else {
    excluded.delete(step);
    delete reasons[String(step)];
  }
  const list = [...excluded].sort((a, b) => a - b);
  const fit = (state.steps ?? []).filter((s) => s !== 0 && !excluded.has(s));
  if (fit.length < 2) return { error: 'At least two timesteps after the initial state must stay in the fit.' };
  return { excluded: list, reasons };
}

/** The reasons as the study record keeps them: only for timesteps that are excluded. */
export function cleanReasons(reasons, excluded) {
  const keep = new Set((excluded ?? []).map(String));
  const out = {};
  for (const [k, v] of Object.entries(reasons ?? {})) {
    const t = String(v ?? '').trim();
    if (keep.has(k) && t) out[k] = t.slice(0, 300);
  }
  return out;
}

/**
 * The excluded timesteps of a run, for the report: step, date, pressure and reason.
 * @param {number[]} excluded the run's list (its config)
 * @param {Array<object>} rows the run rows (lib/mbalSeries buildRunRows)
 * @param {Object<string,string>} reasons from the study record
 */
export function exclusionRows(excluded, rows, reasons) {
  const byStep = new Map((rows ?? []).map((r) => [r.timestep_index, r]));
  return (excluded ?? []).map((s) => {
    const r = byStep.get(s) ?? {};
    return {
      timestep_index: s,
      date: r.date ? String(r.date).slice(0, 10) : EMPTY_VALUE,
      pressure: r.pressure ?? null,
      reason: reasons?.[String(s)] || 'No reason recorded (excluded before reasons were kept)',
    };
  });
}

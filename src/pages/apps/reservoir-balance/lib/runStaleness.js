// Is the stored run still the run of today's inputs? (H4)
//
// The studio shows the last completed run of a case, loaded from rb_results
// when the case opens. Nothing used to check that the PVT, rock, aquifer,
// case conditions and production data still were the ones that run was made
// on, so the report could print today's inputs beside an older answer and
// still say "converged". This module decides, from what is stored, whether
// the run is stale. It mirrors the Well Test rule (a regression result
// describes the match only while the inputs it ran on are unchanged).
//
// Three kinds of evidence, strongest first:
//   1. The run's own config row (rb_run_configs, is_scenario = true) is a
//      snapshot of the PVT, rock and aquifer inputs. It is compared field
//      by field with what the next run would send.
//   2. The result echoes the pressures and the produced cumulatives it ran
//      on (plot_data). They are compared with the rows on the Data tab.
//   3. The case conditions and the columns the result does not echo
//      (injection, per-row lab PVT, observed influx, dates). Since MBAL-U1 a
//      run keeps a snapshot of both with its config (the seven case fields
//      and a digest of the data rows, under one key of pvt_correlations the
//      engine is not handed), and they are compared like the rest. A run
//      made before that has no snapshot, so a time stamp decides: the case
//      is stamped when one of them is saved (lib/api.js), and a stamp later
//      than the run start makes the run stale.
//
// Why the snapshot. Production has a trigger that sets rb_cases.updated_at on
// EVERY update of the row (update_rb_cases_updated_at, read from the live
// catalog 2026-10-02), so with the time stamp alone a rename, or any field
// that only the report prints, withdrew a valid result. A claim is withdrawn
// by a change the analysis reads and by nothing else (reviewer lens RL8).
import {
  DEFAULT_CORRELATIONS, RUN_SNAPSHOT_KEY, dataDigest, engineSideCorrelations,
} from './studyMeta';

/** The case fields the engine reads (supabase/functions/calculate-mbal). */
export const CASE_RUN_INPUT_FIELDS = [
  'fluid_system', 'has_aquifer', 'has_gas_cap', 'initial_pressure_psia',
  'reservoir_temperature_f', 'initial_water_saturation', 'bubble_point_psia',
];

/** The words the screen uses for them. */
export const CASE_INPUT_LABELS = {
  fluid_system: 'fluid system',
  has_aquifer: 'aquifer flag',
  has_gas_cap: 'gas cap flag',
  initial_pressure_psia: 'initial pressure',
  reservoir_temperature_f: 'reservoir temperature',
  initial_water_saturation: 'initial water saturation',
  bubble_point_psia: 'bubble point',
};

/** The run config fields the engine reads, with the words the screen uses. */
export const RUN_CONFIG_INPUT_LABELS = {
  oil_gravity_api: 'oil gravity',
  gas_specific_gravity: 'gas gravity',
  water_salinity_ppm: 'water salinity',
  pvt_source: 'PVT source',
  pvt_correlations: 'PVT correlations',
  pvt_lab_table: 'PVT table',
  formation_compressibility_psi: 'formation compressibility',
  water_compressibility_psi: 'water compressibility',
  aquifer_model: 'aquifer model',
  aquifer_params: 'aquifer parameters',
  gas_cap_ratio_m: 'gas cap ratio m',
  excluded_timesteps: 'excluded timesteps',
};

/**
 * The engine inputs a run inherits from the case default config, as the Run
 * tab sends them. One function builds them for the run and for the stale
 * check, so the two cannot drift apart.
 */
/** The values the Run tab fills in when the PVT and Aquifer tabs hold none. */
export const RUN_INPUT_DEFAULTS = Object.freeze({
  gas_specific_gravity_gas: 0.65,
  gas_specific_gravity_oil: 0.7,
  formation_compressibility_psi: 6e-6,
  water_compressibility_psi: 3e-6,
  pvt_source: 'correlated',
});

/**
 * What a run was made on that its config row does not hold: the case
 * conditions, a digest of the data, and which inputs were filled by a
 * default (so the report can print them as assumptions, RL1).
 */
export function runSnapshotOf(caseData, defaults = []) {
  const fields = {};
  for (const key of CASE_RUN_INPUT_FIELDS) fields[key] = caseData?.[key] ?? null;
  return { v: 1, case: fields, data: dataDigest(caseData?.production_data), defaults };
}

export function buildRunConfigInput(caseData, defaultCfg) {
  const isGas = caseData?.fluid_system === 'gas';
  const aquiferModel = defaultCfg?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none');
  const defaults = [];
  const orDefault = (key, fallback) => {
    if (defaultCfg?.[key] != null) return defaultCfg[key];
    defaults.push(key);
    return fallback;
  };
  const gasGravity = orDefault('gas_specific_gravity', isGas ? RUN_INPUT_DEFAULTS.gas_specific_gravity_gas : RUN_INPUT_DEFAULTS.gas_specific_gravity_oil);
  const cf = orDefault('formation_compressibility_psi', RUN_INPUT_DEFAULTS.formation_compressibility_psi);
  const cw = orDefault('water_compressibility_psi', RUN_INPUT_DEFAULTS.water_compressibility_psi);
  const pvtSource = orDefault('pvt_source', RUN_INPUT_DEFAULTS.pvt_source);
  if (defaultCfg?.aquifer_model == null) defaults.push('aquifer_model');
  if (!defaultCfg?.pvt_correlations) defaults.push('pvt_correlations');
  // The correlation choices and the origin of a generated table go to the
  // run; the study record (identification, datum, input sources) stays on
  // the default config, where the report reads the current one.
  const correlations = {
    ...(engineSideCorrelations(defaultCfg?.pvt_correlations) ?? DEFAULT_CORRELATIONS),
    [RUN_SNAPSHOT_KEY]: runSnapshotOf(caseData, defaults),
  };
  return {
    // PVT
    oil_gravity_api: defaultCfg?.oil_gravity_api ?? null,
    gas_specific_gravity: gasGravity,
    water_salinity_ppm: defaultCfg?.water_salinity_ppm ?? null,
    pvt_source: pvtSource,
    pvt_correlations: correlations,
    pvt_lab_table: defaultCfg?.pvt_lab_table ?? null,
    // Rock
    formation_compressibility_psi: cf,
    water_compressibility_psi: cw,
    // Aquifer
    aquifer_model: aquiferModel,
    aquifer_params: defaultCfg?.aquifer_params ?? null,
    // Gas cap ratio and the excluded points. Both are read by the engine
    // from the run's config row. They were saved on the default config and
    // never copied to the run, so a typed m did not reach a regression run.
    gas_cap_ratio_m: defaultCfg?.gas_cap_ratio_m ?? null,
    excluded_timesteps: defaultCfg?.excluded_timesteps ?? [],
    // Record of intent only: the engine derives the regression from the
    // fluid system and the aquifer model and reports it back as
    // solver_method_used (engines #168). The pot plot is the only
    // alternative to Havlena-Odeh, and it follows the aquifer model.
    solver_method: defaultCfg?.solver_method ?? (aquiferModel === 'pot' ? 'pot_aquifer_plot' : 'havlena_odeh'),
  };
}

// Canonical text of a value: object keys sorted, null and undefined alike,
// numbers by value (so 0.70 and 0.7, or "35" and 35 from a form, compare equal).
function canon(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') {
    const n = v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(n) ? String(n) : JSON.stringify(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined && v[k] !== null)
      .map((k) => `${k}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const numEq = (a, b) => {
  const x = a == null ? 0 : Number(a);
  const y = b == null ? 0 : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return x === y;
  return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
};

const ms = (t) => {
  const v = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(v) ? v : null;
};

/** Config fields that differ between the stored run and what would run now. */
export function changedConfigFields(caseData, defaultCfg, runConfig) {
  if (!runConfig) return [];
  const next = buildRunConfigInput(caseData, defaultCfg);
  return Object.keys(RUN_CONFIG_INPUT_LABELS).filter((key) => {
    if (key === 'pvt_correlations') {
      // the records of the study and the run's own snapshot are not inputs
      return canon(engineSideCorrelations(next[key])) !== canon(engineSideCorrelations(runConfig[key] ?? DEFAULT_CORRELATIONS));
    }
    const stored = key === 'excluded_timesteps' ? (runConfig[key] ?? []) : runConfig[key];
    return canon(next[key]) !== canon(stored);
  });
}

/** Does the Data tab still hold the pressures and cumulatives the run echoed? */
export function dataMatchesRun(productionData, plotData) {
  const idx = plotData?.timestep_index;
  if (!Array.isArray(idx)) return null; // an old result with no echo: cannot tell
  const rows = [...(productionData ?? [])].sort((a, b) => a.timestep_index - b.timestep_index);
  if (rows.length !== idx.length) return false;
  const cols = [
    ['pressure', 'pressure_psia'], ['cum_oil_stb', 'cum_oil_stb'],
    ['cum_gas_scf', 'cum_gas_scf'], ['cum_water_stb', 'cum_water_stb'],
  ];
  return rows.every((row, i) => row.timestep_index === idx[i]
    && cols.every(([echo, col]) => !Array.isArray(plotData[echo]) || numEq(plotData[echo][i], row[col])));
}

/**
 * @returns {{ stale: boolean, reasons: string[] }} stale is false when there
 *   is no result at all (nothing to be stale).
 */
export function assessRunStaleness({ caseData, defaultCfg, run, runConfig, result } = {}) {
  if (!result) return { stale: false, reasons: [] };
  const reasons = [];

  if (!run || !runConfig) {
    reasons.push('The inputs this run was made on could not be read back.');
  } else {
    const changed = changedConfigFields(caseData, defaultCfg, runConfig);
    if (changed.length) {
      reasons.push(`Changed since the run: ${changed.map((k) => RUN_CONFIG_INPUT_LABELS[k]).join(', ')}.`);
    }
  }

  const dataSame = dataMatchesRun(caseData?.production_data, result.plot_data);
  if (dataSame === false) {
    reasons.push('The pressure and production table differs from the one the run used.');
  }

  const snapshot = runConfig?.pvt_correlations?.[RUN_SNAPSHOT_KEY];
  if (snapshot && typeof snapshot === 'object') {
    // The run kept what it was made on: compare it, and let no clock decide.
    const moved = CASE_RUN_INPUT_FIELDS.filter((k) => canon(snapshot.case?.[k]) !== canon(caseData?.[k]));
    if (moved.length) {
      reasons.push(`Changed on the case since the run: ${moved.map((k) => CASE_INPUT_LABELS[k]).join(', ')}.`);
    }
    if (dataSame !== false && snapshot.data && snapshot.data !== dataDigest(caseData?.production_data)) {
      reasons.push('The data table was changed after the run (dates, injection, per-row PVT or observed influx).');
    }
    return { stale: reasons.length > 0, reasons };
  }

  // A run made before the snapshot existed: the time stamp on the case.
  const started = ms(run?.started_at);
  if (started != null) {
    const caseStamp = ms(caseData?.updated_at);
    const rowStamp = Math.max(0, ...(caseData?.production_data ?? []).map((r) => ms(r.created_at) ?? 0));
    if (dataSame !== false && rowStamp > started) {
      reasons.push('Production data rows were added after the run.');
    } else if (caseStamp != null && caseStamp > started && dataSame !== false) {
      reasons.push('The case was saved after the run, and this run kept no record of the case conditions it used.');
    }
  }

  return { stale: reasons.length > 0, reasons };
}

/** One sentence for a banner or a refused export. */
export function staleRunMessage(staleness) {
  if (!staleness?.stale) return null;
  return `These results are from an earlier run and do not describe the current inputs. ${staleness.reasons.join(' ')} Run the engine again.`;
}

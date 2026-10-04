// What a Recovery Factor Estimator project says about recovery, for the apps
// that read it (RF-U2-001, contract `rf-1`).
//
// The sender out of the Recovery Factor Estimator. Its first reader is
// ReservoirCalc Pro, which types its recovery factors (oil and gas) as a
// percent: it can now take the estimate by id with its method, basis and
// source, keep the record with its project, say when the value was edited
// after the intake, and say when the estimate at the source changed since.
// ReservoirCalc Pro's numbers do not move unless the user takes the value.
// Risked Reserves gets it through ReservoirCalc Pro.
//
// The estimator's results are a pure function of its inputs (deriveRf), so
// every save writes the rf-1 record of the estimate on screen into the
// project (payload key `rf`), and a reader opened with `?rfProject=<id>`
// reads it by id from the saved row. Row level security and the record
// sharing rules decide who can read the row.
//
// Contract rf-1, every field:
//   contract        'rf-1'
//   app             'Recovery Factor Estimator'
//   project         { id, name, field, reservoir, analyst }
//   phase           'oil' | 'gas'
//   recovery_factor { value (fraction of OOIP or OGIP, stock-tank conditions) | null,
//                     method (code), method_label, basis (words), withheld (reason | null),
//                     validation (words: how far the method is validated in the build) }
//   range           { low, typical, high (fractions), drive_code, drive_label,
//                     kind 'analog range edges', validated false, source (words) } | null
//   in_place        { quantity ('OOIP' | 'OGIP'), value, unit ('STB' | 'scf'), source (words) }
//   recoverable     { value, unit, basis (words) }
//   distribution    { rf: {p90, p50, p10, mean}, in_place: {...}, recoverable: {...},
//                     seed, realisations, rejected, convention (words) } | null  (RF-U2-002)
//   case_data       'sample' | 'sample-edited' | 'entered'
//   flags           [words]
//   engine_version  RF engine version string
//   computed_at     ISO time the record was built (the save)
// Oilfield units (STB, scf); a reader converts for display and says so.
//
// Pure apart from `readRfProject`, which takes the Supabase client.

export const RF_CONTRACT = 'rf-1';
export const RF_APP = 'Recovery Factor Estimator';
export const RF_PROJECT_PARAM = 'rfProject';
export const RF_TABLE = 'saved_rf_projects';
export const RF_ROUTE = '/dashboard/apps/reservoir/recovery-factor-estimator';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const orNull = (v) => (finite(v) ? v : null);
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : null);

/**
 * The rf-1 record of the estimate the estimator holds now.
 * @param {{inputs: object, derived: object, identification?: object, inPlaceIntake?: ?object,
 *   uncertainty?: ?object}} s
 * @param {{projectId?: ?string, projectName?: ?string, methodLabel: function(string): string,
 *   validation?: object, basis?: object, rangeSource?: string, now?: string}} o
 * @returns {?object} null when there is nothing to send
 */
export function buildRfRecord(s, {
  projectId = null, projectName = null, methodLabel = (m) => m, validation = {}, rangeSource = '', now = new Date().toISOString(),
} = {}) {
  const derived = s?.derived;
  const inputs = s?.inputs;
  if (!derived?.result || !inputs) return null;
  const r = derived.result;
  const gas = derived.phase === 'gas';
  const ip = gas ? 'OGIP' : 'OOIP';
  const unit = gas ? 'scf' : 'STB';
  const id = s.identification || {};
  const intake = s.inPlaceIntake || null;
  const ipSource = derived.direct
    ? (intake ? `${intake.quantity} taken from ${intake.app}${intake.recordName ? ` ("${intake.recordName}")` : ''}${intake.method ? `, ${intake.method}` : ''}` : `${ip} entered directly`)
    : `${ip} volumetric, from area, thickness, net-to-gross, porosity, saturation and ${gas ? 'Bgi' : 'Boi'}`;
  const u0 = s.uncertainty ?? derived.uncertainty;
  const dist = u0 && u0.ok ? u0 : null;
  const pick = (st) => (st ? { p90: orNull(st.p90), p50: orNull(st.p50), p10: orNull(st.p10), mean: orNull(st.mean) } : null);
  return {
    contract: RF_CONTRACT,
    app: RF_APP,
    project: {
      id: projectId,
      name: text(projectName),
      field: text(id.field),
      reservoir: text(id.reservoir),
      analyst: text(id.analyst),
    },
    phase: gas ? 'gas' : 'oil',
    recovery_factor: {
      value: orNull(r.rf),
      method: r.method,
      method_label: methodLabel(r.method),
      basis: `Fraction of ${ip} at stock-tank (standard) conditions; technically recoverable, no economic limit applied`,
      withheld: r.withheld || null,
      validation: validation[r.method] || null,
    },
    range: r.analog ? {
      low: r.analog.low,
      typical: r.analog.typical,
      high: r.analog.high,
      drive_code: r.analog.code,
      drive_label: r.analog.label,
      kind: 'analog range edges',
      validated: false,
      source: rangeSource || null,
    } : null,
    in_place: { quantity: ip, value: orNull(derived.inPlace), unit, source: ipSource },
    recoverable: { value: orNull(r.reserves), unit, basis: `RF x ${ip}; technically recoverable, no economic limit, not a PRMS reserves class` },
    distribution: dist ? {
      rf: pick(dist.stats?.rf),
      in_place: pick(dist.stats?.inPlace),
      recoverable: pick(dist.stats?.recoverable),
      seed: dist.seed,
      realisations: dist.accepted,
      rejected: dist.rejected,
      convention: dist.convention || null,
    } : null,
    case_data: ['sample', 'sample-edited'].includes(inputs.origin) ? inputs.origin : 'entered',
    flags: (derived.flags || []).map((f) => f.text),
    engine_version: r.engineVersion || null,
    computed_at: now,
  };
}

/** The block of a saved payload, or null. */
export function rfContractOf(payload) {
  const b = payload?.contract === RF_CONTRACT ? payload : payload?.rf;
  return b && b.contract === RF_CONTRACT ? b : null;
}

/** What a reader may rely on: { ok, errors }. */
export function validateRfContract(b) {
  const errors = [];
  if (!b || b.contract !== RF_CONTRACT) errors.push('Not an rf-1 block.');
  else {
    if (!['oil', 'gas'].includes(b.phase)) errors.push('No phase.');
    if (!b.recovery_factor || !('value' in b.recovery_factor)) errors.push('No recovery factor block.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Read a saved Recovery Factor project by id and return its rf-1 block.
 * @param {object} supabase the client
 * @param {string} projectId
 * @returns {Promise<{ok: boolean, contract: ?object, projectName: ?string, updatedAt: ?string, reason: ?string}>}
 */
export async function readRfProject(supabase, projectId) {
  const none = (reason, extra = {}) => ({ ok: false, contract: null, projectName: null, updatedAt: null, reason, ...extra });
  if (!projectId) return none(`No ${RF_APP} project was named.`);
  let data;
  try {
    const res = await supabase.from(RF_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) return none(`The ${RF_APP} project could not be read: ${res.error.message}`);
    data = res.data;
  } catch (e) {
    return none(`The ${RF_APP} project could not be read: ${e?.message || e}`);
  }
  if (!data) return none(`The ${RF_APP} project was not found, or it is not yours to read.`);
  const projectName = data.project_name || data.inputs_data?.name || null;
  const contract = rfContractOf(data.inputs_data);
  if (!contract) {
    return none(`This ${RF_APP} project was saved before it carried its estimate (rf-1). Open it in the ${RF_APP} and save it once.`, { projectName, updatedAt: data.updated_at || null });
  }
  const check = validateRfContract(contract);
  if (!check.ok) return none(`The estimate block of the project is incomplete: ${check.errors.join(' ')}`, { projectName, updatedAt: data.updated_at || null });
  return { ok: true, contract, projectName, updatedAt: data.updated_at || null, reason: null };
}

// ---- the ReservoirCalc Pro side --------------------------------------------

const pct1 = (f) => (finite(f) ? `${(f * 100).toFixed(1)} percent` : 'n/a');

/**
 * Which ReservoirCalc Pro recovery field a record fills, and the percent to
 * put there. RCP types percent; rf-1 carries a fraction.
 * @returns {{ok: true, field: 'recovery'|'recoveryGas', percent: number}|{ok: false, error: string}}
 */
export function rcpRecoveryTarget(record, rcpFluidType = 'oil') {
  if (!record || record.contract !== RF_CONTRACT) return { ok: false, error: 'No rf-1 record was read.' };
  const v = record.recovery_factor?.value;
  if (!finite(v)) return { ok: false, error: record.recovery_factor?.withheld || 'The estimate has no recovery factor to take.' };
  const field = record.phase === 'gas' ? 'recoveryGas' : 'recovery';
  const fluid = rcpFluidType || 'oil';
  const fits = record.phase === 'gas' ? ['gas', 'oil_gas'].includes(fluid) : ['oil', 'oil_gas'].includes(fluid);
  if (!fits) return { ok: false, error: `The estimate is for ${record.phase} and this project is a ${fluid.replace('_', ' and ')} case, so there is no ${record.phase} recovery factor to fill. Switch the fluid type first.` };
  return { ok: true, field, percent: +(v * 100).toFixed(6) };
}

/**
 * The record ReservoirCalc Pro keeps with its project when the value is taken.
 */
export function rcpRfIntake(record, { projectId, projectName = null, updatedAt = null, field, percent, now = new Date().toISOString() }) {
  return {
    contract: RF_CONTRACT,
    project_id: projectId,
    project_name: projectName ?? record.project?.name ?? null,
    phase: record.phase,
    field,
    percent,
    method: record.recovery_factor.method,
    method_label: record.recovery_factor.method_label,
    basis: record.recovery_factor.basis,
    range: record.range ? { low: record.range.low, high: record.range.high, drive_label: record.range.drive_label } : null,
    distribution: record.distribution?.rf ? { ...record.distribution.rf, seed: record.distribution.seed, realisations: record.distribution.realisations } : null,
    computed_at: record.computed_at,
    source_updated_at: updatedAt,
    taken_at: now,
  };
}

/** The lines a reader prints for the record: what it is and where it came from. */
export function rfProvenanceLines(record, { projectName = null } = {}) {
  const r = record;
  const name = projectName || r.project?.name;
  const lines = [
    `Recovery factor ${pct1(r.recovery_factor.value)} of ${r.in_place?.quantity || (r.phase === 'gas' ? 'OGIP' : 'OOIP')}, ${r.recovery_factor.method_label}, from ${r.app} project "${name || 'unnamed'}"${r.project?.field ? ` (field ${r.project.field})` : ''}, saved ${String(r.computed_at || '').slice(0, 16).replace('T', ' ')} UTC.`,
    `Basis: ${r.recovery_factor.basis}.`,
  ];
  if (r.range) lines.push(`Analog range of ${r.range.drive_label}: ${pct1(r.range.low)} to ${pct1(r.range.high)} (range edges, not validated against a published table).`);
  if (r.distribution?.rf) lines.push(`Uncertainty at the source: P90 ${pct1(r.distribution.rf.p90)}, P50 ${pct1(r.distribution.rf.p50)}, P10 ${pct1(r.distribution.rf.p10)} (P90 the low case), ${r.distribution.realisations} realisations, seed ${r.distribution.seed}.`);
  if (r.case_data === 'sample') lines.push('The estimate is the sample case of the app, not a field case.');
  if (r.recovery_factor.withheld) lines.push(r.recovery_factor.withheld);
  return lines;
}

/**
 * What ReservoirCalc Pro says about a taken value: edited after the intake,
 * and the source changed since (read again by id).
 * @param {object} intake rcpRfIntake(...)
 * @param {object} rcpInputs the RCP inputs now
 * @param {?object} latest the rf-1 record read again, or null when not readable
 * @returns {{edited: ?string, changed: ?string}}
 */
export function rcpRfIntakeStatus(intake, rcpInputs, latest = null) {
  if (!intake) return { edited: null, changed: null };
  const now = Number(rcpInputs?.[intake.field]);
  const edited = Number.isFinite(now) && Math.abs(now - intake.percent) > 1e-6
    ? `The ${intake.field === 'recoveryGas' ? 'gas' : 'oil'} recovery factor was edited here after the intake: it is ${now} percent, and ${intake.percent.toFixed(1)} percent was received.`
    : null;
  let changed = null;
  if (latest && latest.contract === RF_CONTRACT) {
    const v = latest.recovery_factor?.value;
    const moved = finite(v) ? Math.abs(v * 100 - intake.percent) > 1e-6 : true;
    const resaved = latest.computed_at && intake.computed_at && latest.computed_at !== intake.computed_at;
    if (moved) changed = `The source changed after the intake: the estimate now reads ${pct1(v)} (${latest.recovery_factor.method_label}). Take it again to use it.`;
    else if (resaved && latest.recovery_factor.method !== intake.method) changed = `The source changed after the intake: the method is now ${latest.recovery_factor.method_label}. Take it again to use it.`;
  }
  return { edited, changed };
}

/**
 * The lines ReservoirCalc Pro carries with its results (warnings, report)
 * when a recovery factor was taken from the estimator: where it came from,
 * and whether it was edited here since. No line when nothing was taken.
 */
export function rcpRfResultLines(rcpInputs) {
  const intake = rcpInputs?.rfIntake;
  if (!intake || intake.contract !== RF_CONTRACT) return [];
  const which = intake.field === 'recoveryGas' ? 'Gas' : 'Oil';
  const lines = [`${which} recovery factor from the ${RF_APP}: ${intake.percent.toFixed(1)} percent, ${intake.method_label}, project "${intake.project_name || intake.project_id}", taken ${String(intake.taken_at || '').slice(0, 10)}; ${intake.basis}.`];
  const { edited } = rcpRfIntakeStatus(intake, rcpInputs, null);
  if (edited) lines.push(edited);
  return lines;
}

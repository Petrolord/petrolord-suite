// What a Material Balance case says about its reservoir, for the apps that
// read it (MBAL-U2-004, contract `mbal-1`).
//
// A sender out of Material Balance Studio. The first reader is ReservoirCalc
// Pro, which prints the material balance in-place volume beside its own
// volumetric one (the cross-check every reserves reviewer asks for). The
// record is read BY ID from the saved case and its last completed run, never
// typed and never carried in a URL: `?mbalCase=<rb_cases id>` names it, and
// the reader goes to the database, so what it prints is what the case holds.
//
// Contract mbal-1, every field:
//   contract       'mbal-1'
//   app            'Material Balance Studio'
//   case           { id, name, field, reservoir, fluid_system }
//   run            { id, ran_at, engine_version, solver_method, run_type ('single' | 'history_match'),
//                    validation_tier, validation_reference }
//   in_place       { quantity ('OOIP' | 'OGIP'), value, unit ('STB' | 'scf'), method (words),
//                    r_squared, points, ci95: [low, high] | null }
//   drive          { mechanism, aquifer_strength, aquifer_model, indices: { ddi, gdi, cdi, wdi, winj_di, ginj_di }, sum }
//   pressure       { initial_psia, last_psia, last_date, last_timestep, basis: 'absolute, as entered (no datum correction)',
//                    series: [{ timestep_index, date, pressure_psia, cum_oil_stb, cum_gas_scf }] }
//                  the forecastable pressure: the last measured average pressure and the history a
//                  forecast starts from
//   aquifer        { model ('none' | 'pot' | 'fetkovich' | 'carter_tracy'), values: { the aquifer numbers the
//                    run used: W_rb, J_rb_d_psi, ct_psi, k_md, h_ft, phi, theta_deg, r_R_ft, reD, muw_cp },
//                    sources: { the same keys: 'entered' | 'fitted' | 'derived ...' | 'correlation ...' } }
//                  (SIM-U2-004: Reservoir Simulation Studio builds an analytical aquifer from it)
//   status         'current' (the run is the run of the case's inputs) | 'earlier_run'
//   read_at        ISO time the record was read
// Oilfield units throughout (psia, STB, scf), as the rb_* tables hold them.
// A reader converts for display and says so.
//
// Pure apart from `readMbalCase`, which takes the Supabase client.

export const MBAL_CONTRACT = 'mbal-1';
export const MBAL_APP = 'Material Balance Studio';
export const MBAL_ROUTE = '/dashboard/apps/reservoir/reservoir-balance';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const at = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : null);

/** Words for the method of the headline in-place volume. */
function methodWords(result) {
  const pd = result?.plot_data ?? {};
  if (pd.history_match) return 'Pressure history match (Levenberg-Marquardt on the tank model)';
  if (pd.solver_method_used === 'pot_aquifer_plot') return 'Pot aquifer plot, intercept (Pletcher 2002)';
  return 'Havlena-Odeh regression, slope';
}

const AQ_HM_KEYS = Object.freeze({
  initial_aquifer_water_in_place_rb: 'aquifer_w_rb', aquifer_pi_rb_d_psi: 'aquifer_j_rb_d_psi',
  aquifer_permeability_md: 'aquifer_permeability_md', aquifer_radius_ft: 'aquifer_radius_ft',
});

/**
 * SIM-U2-004: the aquifer numbers the run used, with where each came from:
 * the value the pressure history match fitted over the entered one; the
 * engine's own defaults where nothing was entered (r_R from the reservoir
 * area or the legacy 2,980 ft, ct = cf + cw, the McCain water viscosity
 * the run printed). Mirrors the MBAL report's aquifer rows.
 */
export function aquiferUsed({ caseData, result, runConfig }) {
  const model = runConfig?.aquifer_model ?? (caseData?.has_aquifer ? 'pot' : 'none');
  const p = runConfig?.aquifer_params && typeof runConfig.aquifer_params === 'object' ? runConfig.aquifer_params : {};
  const hm = result?.plot_data?.history_match ?? null;
  const values = {};
  const sources = {};
  const take = (out, key) => {
    const m = hm?.matched_parameters?.find((x) => x.key === AQ_HM_KEYS[key]);
    if (m && finite(m.matched_value)) { values[out] = m.matched_value; sources[out] = `fitted by the pressure history match (start value ${m.initial_value})`; return; }
    if (finite(Number(p[key])) && p[key] !== null && p[key] !== '') { values[out] = Number(p[key]); sources[out] = 'entered on the case'; }
  };
  const cfcw = finite(runConfig?.formation_compressibility_psi) && finite(runConfig?.water_compressibility_psi) ? runConfig.formation_compressibility_psi + runConfig.water_compressibility_psi : null;
  const ctOf = () => {
    if (finite(Number(p.aquifer_total_compressibility_psi)) && p.aquifer_total_compressibility_psi !== null) { values.ct_psi = Number(p.aquifer_total_compressibility_psi); sources.ct_psi = 'entered on the case'; } else if (finite(cfcw)) { values.ct_psi = cfcw; sources.ct_psi = 'ct = cf + cw of the case (no aquifer value entered), as the engine takes it'; }
  };
  if (model === 'fetkovich') {
    take('W_rb', 'initial_aquifer_water_in_place_rb');
    take('J_rb_d_psi', 'aquifer_pi_rb_d_psi');
    ctOf();
  } else if (model === 'carter_tracy') {
    take('k_md', 'aquifer_permeability_md');
    take('r_R_ft', 'aquifer_radius_ft');
    if (finite(Number(p.aquifer_thickness_ft))) { values.h_ft = Number(p.aquifer_thickness_ft); sources.h_ft = 'entered on the case'; }
    if (finite(Number(p.aquifer_porosity))) { values.phi = Number(p.aquifer_porosity); sources.phi = 'entered on the case'; }
    values.theta_deg = finite(Number(p.theta_degrees)) && p.theta_degrees !== null ? Number(p.theta_degrees) : 360;
    sources.theta_deg = finite(Number(p.theta_degrees)) && p.theta_degrees !== null ? 'entered on the case' : 'not entered: 360 degrees, a full circle, as the engine takes it';
    if (finite(Number(p.radius_ratio)) && p.radius_ratio !== null) { values.reD = Number(p.radius_ratio); sources.reD = 'entered on the case'; } else { values.reD = null; sources.reD = 'not entered: infinite acting, as the engine takes it'; }
    if (values.r_R_ft == null) {
      const area = Number(p.reservoir_area_acres);
      if (finite(area) && area > 0) { values.r_R_ft = Math.sqrt((area * 43560) / (Math.PI * (values.theta_deg / 360))); sources.r_R_ft = 'derived by the engine from the reservoir area and the encroachment angle'; } else { values.r_R_ft = 2980; sources.r_R_ft = 'not entered: the engine\'s legacy 2,980 ft (a 640 acre cell)'; }
    }
    if (finite(Number(p.aquifer_water_viscosity_cp)) && p.aquifer_water_viscosity_cp !== null) { values.muw_cp = Number(p.aquifer_water_viscosity_cp); sources.muw_cp = 'entered on the case'; } else {
      const note = (result?.warnings ?? []).find((w) => /water viscosity defaulted to ([\d.]+)/i.test(w));
      if (note) { values.muw_cp = Number(/defaulted to ([\d.]+)/i.exec(note)[1]); sources.muw_cp = 'McCain (1991) correlation, as the run printed it'; }
    }
    ctOf();
  }
  return { model, values, sources };
}

/**
 * The mbal-1 record of a case and its last completed run.
 * @param {{caseData: object, result: object, run?: object, runConfig?: object, stale?: boolean, now?: string}} a
 * @returns {{record: ?object, error: ?string}} error when there is nothing a reader may rely on
 */
export function buildMbalRecord({ caseData, result, run = null, runConfig = null, stale = false, now = new Date().toISOString() }) {
  if (!caseData?.id) return { record: null, error: 'No Material Balance case was found under that id, or it is not shared with you.' };
  const pd = result?.plot_data;
  if (!pd?.timestep_index?.length) return { record: null, error: `The case "${caseData.name ?? caseData.id}" has no completed run, so it has no in-place volume to send. Run it in ${MBAL_APP} first.` };
  const isGas = caseData.fluid_system === 'gas';
  const value = isGas ? result.estimated_ogip_scf : result.estimated_ooip_stb;
  if (!finite(value) || value <= 0) return { record: null, error: `The last run of "${caseData.name}" has no usable in-place volume (${finite(value) ? 'not above zero' : 'none stored'}).` };
  const hm = pd.history_match ?? null;
  const hmIp = hm?.matched_parameters?.find((p) => p.key === (isGas ? 'ogip_scf' : 'stoiip_stb'));
  const n = pd.timestep_index.length;
  const last = n - 1;
  const series = pd.timestep_index.map((t, i) => ({
    timestep_index: t,
    date: at(pd.observation_date, i),
    pressure_psia: at(pd.pressure, i),
    cum_oil_stb: at(pd.cum_oil_stb, i),
    cum_gas_scf: at(pd.cum_gas_scf, i),
  }));
  const pick = (k) => (finite(result?.[k]) ? result[k] : (finite(pd[k]) ? pd[k] : null));
  return {
    error: null,
    record: {
      contract: MBAL_CONTRACT,
      app: MBAL_APP,
      case: {
        id: caseData.id, name: caseData.name ?? null, field: caseData.field_name ?? null,
        reservoir: caseData.reservoir_name ?? null, fluid_system: caseData.fluid_system ?? null,
      },
      run: {
        id: run?.id ?? result.run_id ?? null,
        ran_at: run?.completed_at ?? run?.started_at ?? result.created_at ?? null,
        engine_version: pd.engine_version ?? null,
        solver_method: pd.solver_method_used ?? null,
        run_type: hm ? 'history_match' : 'single',
        validation_tier: pd.validation_tier ?? null,
        validation_reference: pd.validation_reference ?? null,
      },
      in_place: {
        quantity: isGas ? 'OGIP' : 'OOIP',
        value,
        unit: isGas ? 'scf' : 'STB',
        method: methodWords(result),
        r_squared: finite(result.r_squared) ? result.r_squared : null,
        points: finite(result.n_data_points) ? result.n_data_points : null,
        ci95: hmIp && finite(hmIp.ci95_low) && finite(hmIp.ci95_high) ? [hmIp.ci95_low, hmIp.ci95_high] : null,
      },
      drive: {
        mechanism: result.drive_mechanism ?? null,
        aquifer_strength: result.aquifer_strength ?? null,
        aquifer_model: runConfig?.aquifer_model ?? null,
        indices: {
          ddi: pick('final_ddi'), gdi: pick('final_gdi'), cdi: pick('final_cdi') ?? pick('final_sdi'), wdi: pick('final_wdi'),
          winj_di: pick('final_winj_di'), ginj_di: pick('final_ginj_di'),
        },
        sum: pick('final_drive_index_sum'),
      },
      pressure: {
        initial_psia: caseData.initial_pressure_psia ?? at(pd.pressure, 0),
        last_psia: at(pd.pressure, last),
        last_date: at(pd.observation_date, last),
        last_timestep: at(pd.timestep_index, last),
        basis: 'absolute, as entered (no datum correction)',
        series,
      },
      aquifer: aquiferUsed({ caseData, result, runConfig }),
      status: stale ? 'earlier_run' : 'current',
      read_at: now,
    },
  };
}

/**
 * Read a case by id with its last completed run and build its mbal-1 record.
 * Row level security decides what the reader sees: the user's own cases and
 * those shared with the organisation.
 * @param {object} supabase the client
 * @param {string} caseId
 * @param {{assessStale?: function(object): boolean}} [o] the studio's stale rule, when the reader has it
 */
export async function readMbalCase(supabase, caseId, { assessStale = null } = {}) {
  if (!caseId) return { record: null, error: 'No case id was given.' };
  try {
    const { data: rbCase, error: caseErr } = await supabase.from('rb_cases').select('*').eq('id', caseId).maybeSingle();
    if (caseErr) return { record: null, error: `The case could not be read: ${caseErr.message}` };
    if (!rbCase) return buildMbalRecord({ caseData: null });
    const { data: runs } = await supabase.from('rb_runs').select('*').eq('case_id', caseId).order('started_at', { ascending: false });
    const run = (runs ?? []).find((r) => r.status === 'completed') ?? null;
    if (!run) return buildMbalRecord({ caseData: rbCase, result: null });
    const [{ data: result }, { data: runConfig }] = await Promise.all([
      supabase.from('rb_results').select('*').eq('run_id', run.id).maybeSingle(),
      supabase.from('rb_run_configs').select('*').eq('id', run.run_config_id).maybeSingle(),
    ]);
    const stale = assessStale ? Boolean(assessStale({ caseData: rbCase, run, runConfig, result })) : false;
    return buildMbalRecord({ caseData: rbCase, result, run, runConfig, stale });
  } catch (e) {
    return { record: null, error: `The case could not be read: ${e.message}` };
  }
}

// ---- the volumetric cross-check, as a reader prints it -----------------------

export const STB_TO_M3 = 0.158987294928;   // 42 US gal x 3.785411784 L
export const SCF_TO_M3 = 0.028316846592;   // (0.3048 m)^3

/**
 * The material balance volume beside a volumetric one, in the reader's unit.
 * @param {object} record mbal-1
 * @param {{value: number, unitSystem: 'field'|'metric', fluid: 'oil'|'gas'}} volumetric the reader's
 *   deterministic in-place volume (STB or scf in field units, sm3 in metric)
 * @returns {{mbal: number, volumetric: number, unit: string, differencePct: ?number, sameFluid: boolean}}
 */
export function crossCheck(record, volumetric) {
  const metric = volumetric?.unitSystem === 'metric';
  const gas = record.in_place.unit === 'scf';
  const mbal = metric ? record.in_place.value * (gas ? SCF_TO_M3 : STB_TO_M3) : record.in_place.value;
  const unit = metric ? 'sm3' : (gas ? 'scf' : 'STB');
  const v = Number(volumetric?.value);
  const sameFluid = (volumetric?.fluid === 'gas') === gas;
  return {
    mbal, volumetric: finite(v) ? v : null, unit, sameFluid,
    differencePct: finite(v) && v > 0 && sameFluid ? ((mbal - v) / v) * 100 : null,
  };
}

/** The lines a reader prints for the record: where it came from, what it says. */
export function provenanceLines(record) {
  const r = record;
  const ran = r.run.ran_at ? String(r.run.ran_at).slice(0, 16).replace('T', ' ') : 'time not recorded';
  const lines = [
    `${r.in_place.quantity} by material balance, from ${r.app} case "${r.case.name}"${r.case.field ? ` (field ${r.case.field})` : ''}, run of ${ran} UTC, engine ${r.run.engine_version ?? 'version not recorded'}.`,
    `Method: ${r.in_place.method}${finite(r.in_place.r_squared) ? `, r2 ${r.in_place.r_squared.toFixed(4)}` : ''}${finite(r.in_place.points) ? ` on ${r.in_place.points} points` : ''}. Drive: ${r.drive.mechanism ? r.drive.mechanism.replace(/_/g, ' ') : 'not classified'}.`,
  ];
  if (finite(r.pressure.last_psia)) lines.push(`Last average pressure ${Math.round(r.pressure.last_psia).toLocaleString('en-US')} psia${r.pressure.last_date ? ` on ${String(r.pressure.last_date).slice(0, 10)}` : ''}, absolute, as entered.`);
  if (r.status === 'earlier_run') lines.push('The case was changed after this run: its in-place volume is from an earlier run.');
  return lines;
}

// The Material Balance report as rows (MBAL-U1). One model, two printers:
// the Report tab shows these rows on screen and the PDF prints them
// (reviewer lens RL12). Nothing here draws and nothing recalculates what
// the engine calculated; every number is read from the stored result, the
// config the run was made on, and the case.
//
// A reviewer who was not in the room has to be able to reproduce the answer
// or reject it from the pages. So the model carries, in this order:
//   identification (RL4), every engine input with unit and source (RL1),
//   the data the analysis used and what it left out (RL5), the results with
//   the regression statement (RL8), the drive indices with their convention
//   and closure (RL3, RL7), the expansion terms that make up Et (RL2), the
//   in-place volume by each method (RL8), and the limits of the method (RL9).
//
// Pure: no React, no I/O.
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  sourceText, assumedDefaultText, computedText, NOT_PROVIDED, isStated,
} from '@/lib/inputProvenance';
import { describePvtSource, MBAL_CORRELATION_LABELS, tableOrigin } from './pvtSource';
import { RUN_SNAPSHOT_KEY, DEPTH_REFERENCES, PRESSURE_BASES } from './studyMeta';
import { RUN_INPUT_DEFAULTS } from './runStaleness';
import {
  buildMbalSeries, driveIndexDefs, inPlaceOf, POINT_STATUS,
} from './mbalSeries';
import { OILFIELD_UNITS } from './mbalUnits';
import tierMatrix from './tierMatrix.json';

export const REPORT_TITLE = 'Material Balance Report';
export const REPORT_APP_NAME = 'Petrolord Material Balance Studio';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---- number formats ---------------------------------------------------------
const group = (v, digits) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Fixed decimals with thousands separators; EMPTY_VALUE for a missing value. */
export const fmt = (v, digits = 2) => (finite(v) ? group(v, digits) : EMPTY_VALUE);
/** Significant figures, written out in full (never 3.80e+3). */
export const sigFmt = (v, n = 4) => {
  if (!finite(v)) return EMPTY_VALUE;
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-3) return v.toExponential(Math.max(0, n - 1));
  const digits = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
  return group(Number(v.toPrecision(n)), Math.min(digits, 8));
};
const pressureDigits = (unit) => ({ psi: 1, kPa: 0, bar: 2, MPa: 3 }[unit] ?? 1);
/** r2 to four decimals, or to six when four would round a fit that is not perfect up to 1.0000. */
export const r2Text = (v) => (finite(v) ? (v > 0.99995 && v < 1 ? v.toFixed(6) : v.toFixed(4)) : EMPTY_VALUE);
// a volume in its base unit (STB, RB, scf, m3) prints whole; a multiple of it prints decimals
const BASE_UNITS = new Set(['STB', 'RB', 'scf', 'm3']);
const volFmt = (scale, v, digits = 3) => fmt(scale.to(v), BASE_UNITS.has(scale.unit) ? 0 : digits);

/**
 * The reference of a validation tier, cut to what a report prints: the
 * benchmark and how closely it was matched. The engine's full text goes on
 * with its own change history, which belongs in the engine notes.
 */
export function shortReference(text, max = 420) {
  if (!text) return null;
  const cut = String(text).split(/ (?:These figures were|RE-MEASURED|\(The figures|Scope note:|Implementation corrections|The CT math is shared|For Carter-Tracy the index sum)/)[0].trim();
  if (cut.length <= max) return cut;
  // the last full stop or comma before the limit that is not inside a number
  const head = cut.slice(0, max);
  const stop = Math.max(head.search(/\.\s(?!.*\.\s)/), -1);
  if (stop > max * 0.5) return head.slice(0, stop + 1);
  const comma = head.lastIndexOf(', ');
  return `${head.slice(0, comma > 0 ? comma : max).trim()}.`;
}

export const TIER_LABELS = Object.freeze({
  benchmark_verified: 'Benchmark verified',
  published_method: 'Published method',
  engineering_basis: 'Engineering basis',
});

export const FLUID_LABELS = Object.freeze({
  oil: 'Oil',
  gas: 'Gas',
  oil_with_gas_cap: 'Oil with gas cap',
});

export const AQUIFER_LABELS = Object.freeze({
  none: 'None (closed tank)',
  pot: 'Pot aquifer',
  fetkovich: 'Fetkovich',
  carter_tracy: 'Carter-Tracy',
});

const DRIVE_WORDS = (s) => (s ? String(s).replace(/_/g, ' ') : EMPTY_VALUE);

/** The validation tier of the engine path of a run: stored with the result, or read from the engine's own matrix. */
export function validationTierOf({ result, caseData, runConfig }) {
  const pd = result?.plot_data ?? {};
  const hm = pd.history_match;
  if (pd.validation_tier) return { tier: pd.validation_tier, reference: pd.validation_reference ?? null, tolerancePct: pd.validation_tolerance_pct ?? null, from: 'run' };
  if (hm?.validation_tier) return { tier: hm.validation_tier, reference: hm.validation_reference ?? null, tolerancePct: null, from: 'run' };
  if (result?.validation_tier) return { tier: result.validation_tier, reference: result.validation_reference ?? null, tolerancePct: result.validation_tolerance_pct ?? null, from: 'run' };
  const fluid = caseData?.fluid_system === 'gas' ? 'gas' : 'oil';
  const aquifer = runConfig?.aquifer_model ?? 'none';
  const cap = fluid === 'oil' && Number(runConfig?.gas_cap_ratio_m) > 0 ? 'with_gas_cap' : 'no_gas_cap';
  const cell = tierMatrix?.matrix?.[fluid]?.[aquifer]?.[cap];
  return cell ? { tier: cell.tier, reference: cell.reference ?? null, tolerancePct: cell.tolerance_pct ?? null, from: 'matrix' } : { tier: null, reference: null, tolerancePct: null, from: 'none' };
}

// ---- identification (RL4) ---------------------------------------------------

const analysisTypeText = ({ series, isHistoryMatch }) => {
  const v = series.regression.variant;
  const fluid = v.isGas ? 'gas' : 'oil';
  const fit = v.kind === 'pot' ? 'pot aquifer plot' : (v.kind === 'net' ? 'Havlena-Odeh regression with aquifer influx' : 'Havlena-Odeh regression');
  return `Material balance, ${fluid}, ${fit}${isHistoryMatch ? ', with pressure history match' : ''}`;
};

/** The first and the last observation date of the rows, as text. */
export function dataDatesText(rows) {
  const dated = rows.filter((r) => r.date);
  if (!dated.length) return 'Not dated (timestep order)';
  const first = dated[0].date;
  const last = dated[dated.length - 1].date;
  const note = dated.length < rows.length ? `, ${rows.length - dated.length} of ${rows.length} rows undated` : '';
  return `${String(first).slice(0, 10)} to ${String(last).slice(0, 10)}${note}`;
}

/**
 * Label and value pairs of the header block.
 * @param {object} a see collectMbalReportArgs
 */
export function identificationPairs(a) {
  const { caseData, study, organizationName, series, run, build } = a;
  const id = study?.identification ?? {};
  const isHistoryMatch = Boolean(a.result?.plot_data?.history_match);
  const ranAt = run?.completed_at || run?.started_at;
  return [
    ['Case', caseData?.name],
    ['Company', id.company || organizationName],
    ['Field', caseData?.field_name],
    ['Licence or block', id.licence],
    ['Reservoir', caseData?.reservoir_name],
    ['Zone or sand', id.zone],
    ['Fluid system', FLUID_LABELS[caseData?.fluid_system] ?? caseData?.fluid_system],
    ['Analysis type', analysisTypeText({ series, isHistoryMatch })],
    ['Data dates', dataDatesText(series.rows)],
    ['Analyst', id.analyst],
    ['Engine run', ranAt && !Number.isNaN(Date.parse(ranAt)) ? `${new Date(ranAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null],
    ['Build', build],
  ];
}

// ---- inputs (RL1) -----------------------------------------------------------

const CT_KEYS = ['aquifer_permeability_md', 'aquifer_thickness_ft', 'aquifer_porosity', 'theta_degrees', 'radius_ratio', 'aquifer_radius_ft', 'reservoir_area_acres', 'aquifer_water_viscosity_cp', 'water_salinity_ppm', 'aquifer_total_compressibility_psi'];
const FETKOVICH_KEYS = ['initial_aquifer_water_in_place_rb', 'aquifer_pi_rb_d_psi', 'aquifer_total_compressibility_psi'];
/** Every key the engine reads out of aquifer_params (its AQUIFER_PARAM_KEYS). */
export const AQUIFER_ENGINE_KEYS = Object.freeze([
  'initial_aquifer_water_in_place_rb', 'aquifer_pi_rb_d_psi', 'aquifer_total_compressibility_psi', 'radius_ratio',
  'aquifer_thickness_ft', 'aquifer_porosity', 'aquifer_permeability_md', 'theta_degrees', 'aquifer_radius_ft',
  'aquifer_water_viscosity_cp', 'reservoir_area_acres', 'water_salinity_ppm',
]);

const AQUIFER_PARAM_WORDS = Object.freeze({
  initial_aquifer_water_in_place_rb: 'water in place W',
  aquifer_pi_rb_d_psi: 'productivity index J',
  aquifer_total_compressibility_psi: 'total compressibility ct',
  radius_ratio: 'radius ratio reD',
  aquifer_thickness_ft: 'thickness h',
  aquifer_porosity: 'porosity',
  aquifer_permeability_md: 'permeability k',
  theta_degrees: 'encroachment angle',
  aquifer_radius_ft: 'reservoir radius r_R',
  aquifer_water_viscosity_cp: 'water viscosity',
  reservoir_area_acres: 'reservoir area',
  water_salinity_ppm: 'aquifer water salinity',
});

/**
 * Every input the engine was handed, as rows of the inputs table: name,
 * value, unit in the display system, and where it came from. A row names the
 * engine inputs it covers (`engineKeys`), which is what the completeness
 * test holds against the object the engine is called with.
 * @returns {Array<{key: string, engineKeys: string[], group: string, label: string, value: string, unit: string, source: string, calc: boolean}>}
 */
export function mbalInputRows(a) {
  const { caseData, runConfig, study, result } = a;
  const u = a.units ?? OILFIELD_UNITS;
  const cfg = runConfig ?? {};
  const meta = study?.inputMeta ?? {};
  const handoffs = study?.handoffs ?? {};
  const isGas = caseData?.fluid_system === 'gas';
  const snapshot = cfg.pvt_correlations?.[RUN_SNAPSHOT_KEY] ?? null;
  const defaulted = new Set(snapshot?.defaults ?? []);
  const hm = result?.plot_data?.history_match ?? null;
  const matched = (key) => hm?.matched_parameters?.find((p) => p.key === key) ?? null;
  const aquifer = cfg.aquifer_model ?? 'none';
  const params = cfg.aquifer_params && typeof cfg.aquifer_params === 'object' ? cfg.aquifer_params : {};
  const warnings = result?.warnings ?? [];
  const rows = [];
  const row = (group, key, engineKeys, label, value, unit, source, calc = true) => rows.push({
    key, engineKeys, group, label, value: value == null || value === '' ? EMPTY_VALUE : value, unit: unit || '', source, calc,
  });
  // a value handed over from another app, and whether it is still that value
  const handoffSource = (key, current, unitLabel) => {
    const h = handoffs[key];
    if (!h?.app) return null;
    const same = finite(h.value) && finite(current) && Math.abs(h.value - current) <= 1e-6 * Math.max(1, Math.abs(h.value));
    const said = `${h.text || `Handed over from ${h.app}`}${h.record ? `, ${h.record}` : ''}${h.at ? ` (${String(h.at).slice(0, 10)})` : ''}`;
    return same ? said : `Edited in this app after the handoff (received ${fmt(h.value, 1)} ${unitLabel}). The handoff said: ${said}`;
  };
  const src = (key, auto = null) => sourceText(meta[key], auto);

  // ── the case ──
  row('Case', 'fluid_system', ['fluid_system'], 'Fluid system', FLUID_LABELS[caseData?.fluid_system] ?? caseData?.fluid_system, '', 'Case definition');
  const pi = numOrNull(caseData?.initial_pressure_psia);
  row('Case', 'initial_pressure_psia', ['initial_pressure_psia'], 'Initial reservoir pressure pi', fmt(u.to('pressure', pi), pressureDigits(u.unit('pressure'))), u.label('pressure'),
    src('initial_pressure_psia', handoffSource('initial_pressure_psia', pi, 'psia')));
  row('Case', 'reservoir_temperature_f', ['reservoir_temperature_f'], 'Reservoir temperature', fmt(u.to('temperature', numOrNull(caseData?.reservoir_temperature_f)), 1), u.label('temperature'), src('reservoir_temperature_f'));
  row('Case', 'initial_water_saturation', ['initial_water_saturation'], 'Initial water saturation Swi', fmt(numOrNull(caseData?.initial_water_saturation), 3), 'fraction', src('initial_water_saturation'));
  const pb = numOrNull(caseData?.bubble_point_psia);
  if (isGas) {
    row('Case', 'bubble_point_psia', ['bubble_point_psia'], 'Bubble point pressure', null, '', 'Does not apply to a gas case', false);
  } else {
    row('Case', 'bubble_point_psia', ['bubble_point_psia'], 'Bubble point pressure pb', fmt(u.to('pressure', pb), pressureDigits(u.unit('pressure'))), u.label('pressure'),
      pb == null ? 'Not provided: the engine takes the bubble point as the initial pressure' : src('bubble_point_psia'));
  }

  // ── fluid and PVT ──
  const pvtWords = describePvtSource(cfg);
  row('Fluid and PVT', 'pvt_source', ['pvt_source'], 'PVT source', cfg.pvt_source === 'correlated' ? 'Correlations' : (cfg.pvt_source ? 'Table and per-row values' : null), '',
    defaulted.has('pvt_source') ? `${assumedDefaultText('correlations')}. ${pvtWords}` : pvtWords);
  const table = Array.isArray(cfg.pvt_lab_table) ? cfg.pvt_lab_table : [];
  const pressures = table.map((r) => Number(r.pressure_psia)).filter(Number.isFinite);
  const origin = tableOrigin(cfg);
  row('Fluid and PVT', 'pvt_table', ['pvt_lab_table'], 'PVT table',
    table.length ? `${table.length} rows, ${fmt(u.to('pressure', Math.min(...pressures)), 0)} to ${fmt(u.to('pressure', Math.max(...pressures)), 0)}` : 'none',
    table.length ? u.label('pressure') : '',
    table.length
      ? src('pvt_table', origin ? pvtWords : null)
      : 'No table: PVT comes from the Data tab rows where they carry it, and from the correlations elsewhere');
  const api = numOrNull(cfg.oil_gravity_api);
  if (isGas) row('Fluid and PVT', 'oil_gravity_api', ['oil_gravity_api'], 'Oil gravity', null, '', 'Not read for a gas case', false);
  else row('Fluid and PVT', 'oil_gravity_api', ['oil_gravity_api'], 'Oil gravity', api == null ? '35' : fmt(api, 1), 'degAPI', api == null ? assumedDefaultText('35 degAPI') : src('oil_gravity_api'));
  const sg = numOrNull(cfg.gas_specific_gravity);
  row('Fluid and PVT', 'gas_specific_gravity', ['gas_specific_gravity'], 'Gas specific gravity', fmt(sg, 3), 'air = 1',
    defaulted.has('gas_specific_gravity') ? assumedDefaultText(String(isGas ? RUN_INPUT_DEFAULTS.gas_specific_gravity_gas : RUN_INPUT_DEFAULTS.gas_specific_gravity_oil)) : src('gas_specific_gravity'));
  const sal = numOrNull(cfg.water_salinity_ppm);
  row('Fluid and PVT', 'water_salinity_ppm', ['water_salinity_ppm'], 'Formation water salinity', sal == null ? null : fmt(sal, 0), 'ppm',
    sal == null ? `${NOT_PROVIDED}: fresh water (0 ppm) where the engine needs a salinity` : src('water_salinity_ppm'));
  const corr = cfg.pvt_correlations ?? {};
  const name = (k) => MBAL_CORRELATION_LABELS[k] ?? (k ? String(k).replace(/_/g, ' ') : null);
  const corrNote = cfg.pvt_source === 'correlated' ? 'Selected on the PVT tab' : 'Selected on the PVT tab; used only where the table or a data row gives no value';
  const corrSource = defaulted.has('pvt_correlations') ? `${assumedDefaultText('the engine default')}` : corrNote;
  if (isGas) row('Fluid and PVT', 'corr_pb_rs_bo', ['pvt_correlations.pb_rs_bo'], 'Pb, Rs and Bo correlation', null, '', 'Not read for a gas case', false);
  else row('Fluid and PVT', 'corr_pb_rs_bo', ['pvt_correlations.pb_rs_bo'], 'Pb, Rs and Bo correlation', name(corr.pb_rs_bo) ?? 'Standing', '', corr.pb_rs_bo ? corrSource : assumedDefaultText('Standing'));
  row('Fluid and PVT', 'corr_z', ['pvt_correlations.z_factor'], 'Gas deviation factor Z correlation', name(corr.z_factor) ?? 'Hall-Yarborough', '', corr.z_factor ? corrSource : assumedDefaultText('Hall-Yarborough'));
  row('Fluid and PVT', 'corr_water', ['pvt_correlations.water'], 'Water formation volume factor correlation', name(corr.water) ?? 'McCain', '', corr.water ? corrSource : assumedDefaultText('McCain'));
  row('Fluid and PVT', 'corr_viscosity', ['pvt_correlations.oil_viscosity', 'pvt_correlations.gas_viscosity'], 'Oil and gas viscosity correlations',
    [name(corr.oil_viscosity), name(corr.gas_viscosity)].filter(Boolean).join('; ') || null, '',
    'Recorded for the reader: viscosity does not enter the material balance', false);

  // ── rock ──
  const cf = numOrNull(cfg.formation_compressibility_psi);
  const cw = numOrNull(cfg.water_compressibility_psi);
  const cUnit = u.label('compressibility');
  row('Rock and water', 'formation_compressibility_psi', ['formation_compressibility_psi'], 'Formation compressibility cf', sigFmt(u.to('compressibility', cf), 3), cUnit,
    defaulted.has('formation_compressibility_psi') ? assumedDefaultText(`${RUN_INPUT_DEFAULTS.formation_compressibility_psi} 1/psi`) : src('formation_compressibility_psi'));
  row('Rock and water', 'water_compressibility_psi', ['water_compressibility_psi'], 'Water compressibility cw', sigFmt(u.to('compressibility', cw), 3), cUnit,
    defaulted.has('water_compressibility_psi') ? assumedDefaultText(`${RUN_INPUT_DEFAULTS.water_compressibility_psi} 1/psi`) : src('water_compressibility_psi'));

  // ── gas cap ──
  const m = numOrNull(cfg.gas_cap_ratio_m);
  const mMatch = matched('gas_cap_m');
  if (isGas) {
    row('Gas cap', 'gas_cap_ratio_m', ['has_gas_cap', 'gas_cap_ratio_m'], 'Gas cap ratio m', null, '', 'Does not apply to a gas case', false);
  } else if (mMatch) {
    row('Gas cap', 'gas_cap_ratio_m', ['has_gas_cap', 'gas_cap_ratio_m'], 'Gas cap ratio m', sigFmt(mMatch.matched_value, 4), 'fraction',
      `Fitted by the pressure history match from a start value of ${sigFmt(mMatch.initial_value, 3)}`);
  } else if (caseData?.has_gas_cap && !(m > 0)) {
    row('Gas cap', 'gas_cap_ratio_m', ['has_gas_cap', 'gas_cap_ratio_m'], 'Gas cap ratio m', '0', 'fraction',
      `${NOT_PROVIDED}: the case is flagged as having a gas cap and no ratio was entered, so the run used m = 0, the balance without a gas cap`);
  } else if (m > 0) {
    row('Gas cap', 'gas_cap_ratio_m', ['has_gas_cap', 'gas_cap_ratio_m'], 'Gas cap ratio m', sigFmt(m, 4), 'fraction', src('gas_cap_ratio_m'));
  } else {
    row('Gas cap', 'gas_cap_ratio_m', ['has_gas_cap', 'gas_cap_ratio_m'], 'Gas cap ratio m', '0', 'fraction', 'No gas cap on this case');
  }

  // ── aquifer ──
  row('Aquifer', 'aquifer_model', ['aquifer_model', 'has_aquifer'], 'Aquifer model', AQUIFER_LABELS[aquifer] ?? aquifer, '',
    defaulted.has('aquifer_model')
      ? assumedDefaultText(aquifer === 'pot' ? 'the pot aquifer, from the aquifer flag of the case' : 'no aquifer')
      : (isStated(meta.aquifer) ? src('aquifer') : 'Selected on the Aquifer tab'));
  // one statement of source covers the aquifer description: its model and its parameters
  const aqSrc = () => src('aquifer');
  const pnum = (k) => numOrNull(params[k]);
  const covered = new Set();
  const prow = (key, label, value, unit, source) => { covered.add(key); row('Aquifer', `aquifer_${key}`, [`aquifer_params.${key}`], label, value, unit, source); };
  const engineNote = (re) => warnings.find((w) => re.test(w)) ?? null;
  if (aquifer === 'pot') {
    const w = pnum('initial_aquifer_water_in_place_rb');
    const wMatch = matched('aquifer_w_rb');
    const scale = u.scaled('resVolume', w ?? wMatch?.matched_value ?? 0);
    prow('initial_aquifer_water_in_place_rb', 'Aquifer water in place W (start value)', w == null ? null : fmt(scale.to(w), 2), w == null ? '' : scale.label,
      hm ? (w == null ? 'No start value entered: the history match started from the regression estimate' : 'Start value of the pressure history match')
        : 'Not an input of the regression: W is a result of the pot aquifer plot (see the results)');
  } else if (aquifer === 'fetkovich') {
    const w = pnum('initial_aquifer_water_in_place_rb');
    const wMatch = matched('aquifer_w_rb');
    const wUsed = wMatch ? wMatch.matched_value : w;
    const scale = u.scaled('resVolume', wUsed ?? 0);
    prow('initial_aquifer_water_in_place_rb', 'Aquifer water in place W', fmt(scale.to(wUsed), 2), scale.label,
      wMatch ? `Fitted by the pressure history match from a start value of ${fmt(scale.to(wMatch.initial_value), 2)} ${scale.label}` : aqSrc());
    const j = pnum('aquifer_pi_rb_d_psi');
    const jMatch = matched('aquifer_j_rb_d_psi');
    const jUsed = jMatch ? jMatch.matched_value : j;
    prow('aquifer_pi_rb_d_psi', 'Aquifer productivity index J', sigFmt(u.to('aquiferIndex', jUsed), 4), u.label('aquiferIndex'),
      jMatch ? `Fitted by the pressure history match from a start value of ${sigFmt(u.to('aquiferIndex', jMatch.initial_value), 4)} ${u.label('aquiferIndex')}` : aqSrc());
    const ct = pnum('aquifer_total_compressibility_psi');
    prow('aquifer_total_compressibility_psi', 'Aquifer total compressibility ct', sigFmt(u.to('compressibility', ct ?? (cf ?? 0) + (cw ?? 0)), 3), cUnit,
      ct == null ? computedText('ct = cf + cw (no value entered)') : aqSrc());
  } else if (aquifer === 'carter_tracy') {
    const kMatch = matched('aquifer_permeability_md');
    const k = kMatch ? kMatch.matched_value : pnum('aquifer_permeability_md');
    prow('aquifer_permeability_md', 'Aquifer permeability k', sigFmt(k, 4), 'mD', kMatch ? `Fitted by the pressure history match from a start value of ${sigFmt(kMatch.initial_value, 4)} mD` : aqSrc());
    prow('aquifer_thickness_ft', 'Aquifer thickness h', fmt(u.to('depth', pnum('aquifer_thickness_ft')), 1), u.label('depth'), aqSrc());
    prow('aquifer_porosity', 'Aquifer porosity', fmt(pnum('aquifer_porosity'), 3), 'fraction', aqSrc());
    const theta = pnum('theta_degrees');
    prow('theta_degrees', 'Encroachment angle', fmt(theta ?? 360, 0), 'degrees', theta == null ? assumedDefaultText('360 degrees, a full circle') : aqSrc());
    const red = pnum('radius_ratio');
    prow('radius_ratio', 'Aquifer to reservoir radius ratio reD', red == null ? 'infinite' : sigFmt(red, 4), '', red == null ? assumedDefaultText('an infinite-acting aquifer') : aqSrc());
    const rMatch = matched('aquifer_radius_ft');
    const rr = rMatch ? rMatch.matched_value : pnum('aquifer_radius_ft');
    const area = pnum('reservoir_area_acres');
    if (rr != null) {
      prow('aquifer_radius_ft', 'Reservoir radius at the contact r_R', fmt(u.to('depth', rr), 0), u.label('depth'),
        rMatch ? `Fitted by the pressure history match from a start value of ${fmt(u.to('depth', rMatch.initial_value), 0)} ${u.label('depth')}` : aqSrc());
    } else {
      const derived = area != null && area > 0 ? Math.sqrt((area * 43560) / (Math.PI * ((theta ?? 360) / 360))) : 2980;
      prow('aquifer_radius_ft', 'Reservoir radius at the contact r_R', fmt(u.to('depth', derived), 0), u.label('depth'),
        area != null && area > 0 ? computedText('r_R from the reservoir area and the encroachment angle (no radius entered)') : assumedDefaultText('2,980 ft, the radius of a 640 acre cell'));
    }
    prow('reservoir_area_acres', 'Reservoir area', area == null ? null : fmt(u.to('area', area), 2), area == null ? '' : u.label('area'),
      area == null ? NOT_PROVIDED : (rr != null ? 'Entered; not used, because a radius is entered' : aqSrc()));
    const mu = pnum('aquifer_water_viscosity_cp');
    const muNote = engineNote(/water viscosity defaulted to ([\d.]+)/i);
    const muDefault = muNote ? Number(/defaulted to ([\d.]+)/i.exec(muNote)[1]) : null;
    prow('aquifer_water_viscosity_cp', 'Aquifer water viscosity', sigFmt(u.to('viscosity', mu ?? muDefault), 3), u.label('viscosity'),
      mu == null ? 'Correlation: McCain (1991), at the initial pressure and the reservoir temperature (no value entered)' : aqSrc());
    const asal = pnum('water_salinity_ppm');
    prow('water_salinity_ppm', 'Aquifer water salinity', asal == null ? null : fmt(asal, 0), asal == null ? '' : 'ppm',
      asal == null ? `${NOT_PROVIDED}: the formation water salinity above is used` : (mu != null ? 'Entered; not used, because a water viscosity is entered' : aqSrc()));
    const ct = pnum('aquifer_total_compressibility_psi');
    prow('aquifer_total_compressibility_psi', 'Aquifer total compressibility ct', sigFmt(u.to('compressibility', ct ?? (cf ?? 0) + (cw ?? 0)), 3), cUnit,
      ct == null ? computedText('ct = cf + cw (no value entered)') : aqSrc());
  }
  // what the selected model does not read, and anything the engine does not know
  const rest = AQUIFER_ENGINE_KEYS.filter((k) => !covered.has(k));
  const unknown = Object.keys(params).filter((k) => !AQUIFER_ENGINE_KEYS.includes(k) && params[k] != null);
  const held = rest.filter((k) => params[k] != null);
  if (rest.length || unknown.length) {
    const say = [];
    if (held.length) say.push(`Held on the case and not read by this model: ${held.map((k) => AQUIFER_PARAM_WORDS[k]).join(', ')}`);
    if (unknown.length) say.push(`Not a parameter the engine knows, so ignored: ${unknown.join(', ')}`);
    // 'aquifer_params' itself is the leaf the engine is handed when the case holds no parameters at all
    row('Aquifer', 'aquifer_other', ['aquifer_params', ...rest.map((k) => `aquifer_params.${k}`), ...unknown.map((k) => `aquifer_params.${k}`)],
      aquifer === 'none' ? 'Aquifer parameters' : 'Other aquifer parameters', held.length || unknown.length ? `${held.length + unknown.length} held` : 'none', '',
      say.join('. ') || (aquifer === 'none' ? 'None read: the tank is closed' : 'None held'), false);
  }

  // ── the fit and the data ──
  const excluded = (cfg.excluded_timesteps ?? []).slice().sort((x, y) => x - y);
  row('Fit and data', 'excluded_timesteps', ['excluded_timesteps'], 'Timesteps excluded from the fit by the analyst', excluded.length ? excluded.join(', ') : 'none', '',
    excluded.length ? 'Set on the Data tab; listed with the reason in the data table' : 'Every timestep after the initial state is offered to the fit');
  const nRows = result?.plot_data?.timestep_index?.length ?? caseData?.production_data?.length ?? 0;
  row('Fit and data', 'production_data', ['production_data'], 'Pressure and production table', `${nRows} rows`, '', src('production_data', null));
  return rows;
}

/** The lines of the pressure datum block: stated inputs, and what the app does with them. */
export function datumRows(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const d = a.study?.datum ?? {};
  const ref = d.reference && DEPTH_REFERENCES[d.reference] ? d.reference : 'TVDSS';
  const depthUnit = `${u.label('depth')} ${ref}`;
  return [
    { key: 'datum_depth', label: 'Pressure datum depth', value: finite(d.datum_depth_ft) ? fmt(u.to('depth', d.datum_depth_ft), 1) : EMPTY_VALUE, unit: finite(d.datum_depth_ft) ? depthUnit : '', source: finite(d.datum_depth_ft) ? 'Entered on the Report tab' : NOT_PROVIDED },
    { key: 'gauge_depth', label: 'Gauge or survey depth', value: finite(d.gauge_depth_ft) ? fmt(u.to('depth', d.gauge_depth_ft), 1) : EMPTY_VALUE, unit: finite(d.gauge_depth_ft) ? depthUnit : '', source: finite(d.gauge_depth_ft) ? 'Entered on the Report tab' : NOT_PROVIDED },
    { key: 'pressure_basis', label: 'Pressures on the Data tab are', value: PRESSURE_BASES[d.basis ?? ''] ?? PRESSURE_BASES[''], unit: '', source: d.note ? d.note : (d.basis ? 'Stated by the analyst' : NOT_PROVIDED) },
  ];
}

export const DATUM_NOTE = 'All pressures are absolute. This app applies no correction to datum: the pressures of the data table enter the balance as they were entered. Where the surveys were taken away from the datum, correct them to the datum with the fluid gradient before entering them.';

export const INPUTS_NOTE = 'Rows marked "Recorded for the reader" or "Does not apply" did not enter the calculation; every other row did. A default the app applied is printed as an assumption with its value.';

// ---- data summary (RL5) -----------------------------------------------------

/** The reason a timestep is not in the fit, in words. */
const statusWords = (status) => (status === 'fit' ? 'In the fit' : POINT_STATUS[status]);

/**
 * The data the analysis used: one row per timestep with its date, pressure
 * and cumulative volumes, and whether it entered the fit.
 */
export function dataSummary(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { series } = a;
  const { rows, isGas } = series;
  const status = new Map(series.regression.points.map((p) => [p.timestep_index, p.status]));
  const max = (f) => rows.reduce((mx, r) => Math.max(mx, Math.abs(f(r) ?? 0)), 0);
  const oil = u.scaled('stockVolume', max((r) => r.cum_oil_stb));
  const gas = u.scaled('gasVolume', max((r) => r.cum_gas_scf));
  const water = u.scaled('stockVolume', max((r) => r.cum_water_stb));
  const winj = u.scaled('stockVolume', max((r) => r.cum_water_inj_stb));
  const ginj = u.scaled('gasVolume', max((r) => r.cum_gas_inj_scf));
  const we = u.scaled('resVolume', max((r) => r.We));
  const anyWinj = rows.some((r) => (r.cum_water_inj_stb ?? 0) > 0);
  const anyGinj = rows.some((r) => (r.cum_gas_inj_scf ?? 0) > 0);
  const pDigits = pressureDigits(u.unit('pressure'));
  const head = ['Step', 'Date', `p (${u.label('pressure')})`];
  if (!isGas) head.push(`Np (${oil.label})`);
  head.push(`Gp (${gas.label})`, `Wp (${water.label})`);
  if (anyWinj) head.push(`Winj (${winj.label})`);
  if (anyGinj) head.push(`Ginj (${ginj.label})`);
  head.push(`We (${we.label})`, 'Fit');
  const body = rows.map((r) => {
    const cells = [String(r.timestep_index), r.date ? String(r.date).slice(0, 10) : EMPTY_VALUE, fmt(u.to('pressure', r.pressure), pDigits)];
    if (!isGas) cells.push(volFmt(oil, r.cum_oil_stb));
    cells.push(volFmt(gas, r.cum_gas_scf), volFmt(water, r.cum_water_stb));
    if (anyWinj) cells.push(volFmt(winj, r.cum_water_inj_stb));
    if (anyGinj) cells.push(volFmt(ginj, r.cum_gas_inj_scf));
    cells.push(volFmt(we, r.We), statusWords(status.get(r.timestep_index) ?? 'excluded'));
    return cells;
  });
  const counts = series.regression.counts;
  const last = rows[rows.length - 1];
  const first = rows[0];
  const dated = rows.filter((r) => r.date);
  const totals = [
    ['Timesteps in the table', String(rows.length)],
    ['In the fit', String(counts.fit)],
    ['Left out of the fit', `${rows.length - counts.fit}: initial state ${counts.initial}, excluded by the analyst ${counts.excluded}, no expansion above zero ${counts.no_expansion}`],
    ['Points the engine reports in the fit', finite(series.regression.n) ? String(series.regression.n) : EMPTY_VALUE],
    ['Data cut-off', last?.date ? String(last.date).slice(0, 10) : `Timestep ${last?.timestep_index ?? EMPTY_VALUE} (no dates)`],
    ['Period covered', dated.length >= 2 ? `${String(dated[0].date).slice(0, 10)} to ${String(dated[dated.length - 1].date).slice(0, 10)}, ${fmt((dated[dated.length - 1].t_ms - dated[0].t_ms) / (365.25 * 86400000), 2)} years` : 'Not dated'],
    [`Pressure, first to last (${u.label('pressure')})`, `${fmt(u.to('pressure', first?.pressure), pDigits)} to ${fmt(u.to('pressure', last?.pressure), pDigits)}`],
  ];
  if (!isGas) totals.push([`Cumulative oil at the cut-off (${oil.label})`, volFmt(oil, last?.cum_oil_stb)]);
  totals.push([`Cumulative gas at the cut-off (${gas.label})`, volFmt(gas, last?.cum_gas_scf)]);
  totals.push([`Cumulative water produced at the cut-off (${water.label})`, volFmt(water, last?.cum_water_stb)]);
  if (anyWinj) totals.push([`Cumulative water injected at the cut-off (${winj.label})`, volFmt(winj, last?.cum_water_inj_stb)]);
  if (anyGinj) totals.push([`Cumulative gas injected at the cut-off (${ginj.label})`, volFmt(ginj, last?.cum_gas_inj_scf)]);
  const notes = ['Volumes are cumulative from the initial state. Np, Wp and injected water are stock-tank volumes; We is a reservoir volume.'];
  if (anyWinj || anyGinj) notes.push(INJECTION_NOTE);
  return { head, body, totals, note: notes.join(' '), injection: anyWinj || anyGinj, counts };
}

export const INJECTION_NOTE = 'Injected volumes are on the data table and are NOT in this balance: the withdrawal term F of this engine version has no injection term. A reservoir under water or gas injection will read a larger in-place volume than it holds until injection is netted out of the produced volumes.';

// ---- results ----------------------------------------------------------------

/** The in-place volume the regression of the run gives (on a history match the headline is the matched one). */
export function regressionInPlace(a) {
  const pd = a.result?.plot_data ?? {};
  const stored = a.series.isGas ? pd.regression_ogip_scf : pd.regression_ooip_stb;
  if (finite(stored)) return stored;
  return a.series.regression.inPlace;
}

const inPlaceText = (u, value, isGas, digits = 2) => {
  const s = u.scaled(isGas ? 'gasVolume' : 'stockVolume', value ?? 0);
  return finite(value) ? `${fmt(s.to(value), digits)} ${s.label}` : EMPTY_VALUE;
};

/** The words of the regression statement: method, points, slope, intercept and r2. */
export function regressionStatement(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { regression, isGas } = a.series;
  const v = regression.variant;
  const n = finite(regression.n) ? regression.n : regression.counts.fit;
  const r2 = r2Text(regression.r2);
  const symbol = isGas ? 'G' : 'N';
  const value = inPlaceText(u, regressionInPlace(a), isGas, 3);
  const parts = [v.method, `${n} points entered the fit; r2 = ${r2}.`];
  if (v.inPlaceFrom === 'slope') {
    parts.push(`${symbol} = slope = ${value}. The fitted intercept is ${sigFmt(u.to('resVolume', regression.intercept), 4)} ${u.label('resVolume')}; theory puts the line through the origin, so an intercept that is large beside F points at a drive the model leaves out or at the data.`);
  } else {
    parts.push(`${symbol} = intercept = ${value}.`);
  }
  return parts.join(' ');
}

/** Headline results as label and value rows. */
export function headlineRows(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { result, series, caseData, runConfig } = a;
  const { isGas } = series;
  const hm = result?.plot_data?.history_match ?? null;
  const headline = inPlaceOf(result, isGas);
  const tier = validationTierOf({ result, caseData, runConfig });
  const rows = [];
  rows.push([isGas ? 'Gas initially in place (OGIP)' : 'Oil initially in place (OOIP)', inPlaceText(u, headline, isGas, 2)]);
  rows.push(['Headline value from', hm ? 'The pressure history match (matched value)' : (series.regression.variant.inPlaceFrom === 'intercept' ? 'The intercept of the pot aquifer plot' : 'The slope of the Havlena-Odeh regression')]);
  if (hm) rows.push([isGas ? 'OGIP by the regression of this run' : 'OOIP by the regression of this run', inPlaceText(u, regressionInPlace(a), isGas, 2)]);
  rows.push(['Regression r2', r2Text(result?.r_squared)]);
  rows.push(['Points in the fit', finite(result?.n_data_points) ? String(result.n_data_points) : EMPTY_VALUE]);
  rows.push(['Drive mechanism (classified at the last timestep)', DRIVE_WORDS(result?.drive_mechanism)]);
  rows.push(['Aquifer strength (from the water drive index)', DRIVE_WORDS(result?.aquifer_strength)]);
  const aquifer = runConfig?.aquifer_model ?? 'none';
  if (aquifer !== 'none') {
    if (aquifer === 'pot' || aquifer === 'fetkovich') {
      const w = result?.aquifer_owip_rb;
      const ws = u.scaled('resVolume', w ?? 0);
      rows.push([aquifer === 'pot' ? 'Aquifer water in place W (from the slope)' : 'Aquifer water in place W (as entered)', finite(w) ? `${fmt(ws.to(w), 2)} ${ws.label}` : EMPTY_VALUE]);
    }
    const we = result?.aquifer_cumulative_we_rb;
    const wes = u.scaled('resVolume', we ?? 0);
    rows.push(['Cumulative water influx We at the last timestep', finite(we) ? `${fmt(wes.to(we), 3)} ${wes.label}` : EMPTY_VALUE]);
  }
  rows.push(['Engine path validation', tier.tier ? `${TIER_LABELS[tier.tier] ?? tier.tier}${finite(tier.tolerancePct) ? ` (${tier.tolerancePct} percent against the reference)` : ''}` : EMPTY_VALUE]);
  return { rows, tier };
}

/** The matched parameters of a history match, with their 95 percent intervals. */
export function historyMatchBlock(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const hm = a.result?.plot_data?.history_match ?? null;
  if (!hm) return null;
  const conv = (p, v) => {
    if (!finite(v)) return null;
    switch (p.key) {
      case 'stoiip_stb': return { s: u.scaled('stockVolume', p.matched_value), q: 'stockVolume' };
      case 'ogip_scf': return { s: u.scaled('gasVolume', p.matched_value), q: 'gasVolume' };
      case 'aquifer_w_rb': return { s: u.scaled('resVolume', p.matched_value), q: 'resVolume' };
      default: return null;
    }
  };
  const rows = (hm.matched_parameters ?? []).map((p) => {
    const c = conv(p, p.matched_value);
    let unit = p.unit;
    let f = (v) => (finite(v) ? sigFmt(v, 4) : EMPTY_VALUE);
    if (c) { unit = c.s.label; f = (v) => (finite(v) ? fmt(c.s.to(v), 3) : EMPTY_VALUE); }
    else if (p.key === 'aquifer_j_rb_d_psi') { unit = u.label('aquiferIndex'); f = (v) => (finite(v) ? sigFmt(u.to('aquiferIndex', v), 4) : EMPTY_VALUE); }
    else if (p.key === 'aquifer_radius_ft') { unit = u.label('depth'); f = (v) => (finite(v) ? fmt(u.to('depth', v), 0) : EMPTY_VALUE); }
    else if (p.key === 'aquifer_permeability_md') unit = 'mD';
    return [
      `${p.label} (${unit})${p.at_bound ? ' [at bound]' : ''}`,
      f(p.initial_value), f(p.matched_value),
      finite(p.ci95_low) && finite(p.ci95_high) ? `${f(p.ci95_low)} to ${f(p.ci95_high)}` : EMPTY_VALUE,
    ];
  });
  const fitPoints = (hm.point_in_fit ?? []).filter(Boolean).length;
  const title = `Pressure history match${hm.converged ? ` (converged in ${hm.iterations} iterations)` : ` (stopped at the iteration cap, ${hm.iterations})`}`;
  const note = `Levenberg-Marquardt on the logarithm of each parameter, minimising measured minus simulated pressure over ${fitPoints} points: RMS error ${fmt(u.to('dp', hm.rms_error_psi), 2)} ${u.label('dp')}, largest miss ${fmt(u.to('dp', hm.max_abs_error_psi), 2)} ${u.label('dp')}. The intervals are 95 percent confidence from the fit covariance. The drive indices and the regression line below belong to the forward run at the matched aquifer parameters, whose own in-place volume is printed in the headline table.`;
  return { title, head: ['Parameter', 'Start', 'Matched', '95% confidence'], rows, note, converged: Boolean(hm.converged) };
}

// ---- drive indices (RL3, RL7) -----------------------------------------------

export const DRIVE_CONVENTION = Object.freeze({
  oil: 'Convention: each index is its energy term over the hydrocarbon voidage A = F - Wp Bw = Np [Bt + (Rp - Rsi) Bg] (Ahmed, Reservoir Engineering Handbook, Example 11-1). Water produced is netted inside the water drive index, WDI = (We - Wp Bw) / A. CDI is the rock and connate water expansion (Ahmed calls it EDI); GDI is the gas cap (Ahmed calls it SDI).',
  gas: 'Convention: each index is its energy term over the hydrocarbon voidage Gp Bg (Pletcher, SPE 75354, Eqs. 8 to 10). Water produced is netted inside the water drive index, WDI = (We - Wp Bw) / (Gp Bg). CDI is the rock and connate water expansion (Pletcher calls it ICD).',
});

/**
 * The drive indices of the last timestep, split, with their closure.
 * The parts close on the printed sum; the sum closes on 1 exactly when the
 * fitted in-place volume reproduces that timestep, since
 * sum - 1 = (N Et + We - F) / A.
 */
export function driveIndexBlock(a) {
  const { result, series } = a;
  const { isGas } = series;
  const defs = driveIndexDefs(isGas);
  const value = (key) => {
    const v = key === 'cdi' ? (result?.final_cdi ?? result?.final_sdi) : result?.[`final_${key}`];
    return finite(v) ? v : null;
  };
  const parts = defs.map((d) => ({ ...d, value: value(d.key) }));
  const sum = finite(result?.final_drive_index_sum) ? result.final_drive_index_sum : null;
  const partSum = parts.reduce((s, p) => s + (p.value ?? 0), 0);
  const closes = sum != null && Math.abs(partSum - sum) < 5e-7;
  const rows = parts.map((p) => [p.label, p.numerator, fmt(p.value, 4)]);
  rows.push(['Sum', isGas ? '(G Et + We - Wp Bw)' : '(N Et + We - Wp Bw)', fmt(sum, 4)]);
  const hm = result?.plot_data?.history_match ?? null;
  const lines = [DRIVE_CONVENTION[isGas ? 'gas' : 'oil']];
  if (sum != null) {
    const off = sum - 1;
    lines.push(Math.abs(off) < 5e-5
      ? 'The indices sum to 1.0000: the fitted in-place volume reproduces the withdrawal at the last timestep.'
      : `The indices sum to ${fmt(sum, 4)}. The departure from 1 is the misfit of the fitted in-place volume at this one timestep, (${isGas ? 'G' : 'N'} Et + We - F) over the hydrocarbon voidage: ${off > 0 ? 'the fitted line lies above' : 'the fitted line lies below'} the last point by ${fmt(Math.abs(off) * 100, 2)} percent of the voidage.`);
  }
  if (hm) lines.push('On a history match these indices use the in-place volume of the forward regression at the matched aquifer parameters.');
  return { head: ['Drive', 'Energy term', 'Index'], rows, parts, sum, partSum, closes, note: lines.join(' ') };
}

/** Drive indices of every timestep, as a table. */
export function driveIndexTable(a) {
  const { drive } = a.series;
  const head = ['Step', 'Date', ...drive.defs.map((d) => d.key.toUpperCase()), 'Sum'];
  const body = drive.steps.map((s) => [
    String(s.timestep_index), s.date ? String(s.date).slice(0, 10) : EMPTY_VALUE,
    ...drive.defs.map((d) => fmt(s[d.key], 3)), fmt(s.sum, 3),
  ]);
  return { head, body };
}

// ---- expansion terms (RL2) --------------------------------------------------

/**
 * The terms the fit is made of, per timestep: F, the parts of Et and Et
 * itself, so a reader can check that Et is the sum of its parts.
 */
export function expansionTable(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { series } = a;
  const { rows, isGas, regression } = series;
  const m = regression.variant.m;
  const f = u.scaled('resVolume', rows.reduce((mx, r) => Math.max(mx, Math.abs(r.F ?? 0)), 0));
  if (isGas) {
    const eUnit = u.label('expansionGas');
    const head = ['Step', `F (${f.label})`, `Eg (${eUnit})`, `Efw (${eUnit})`, `Et (${eUnit})`];
    const body = rows.map((r) => [
      String(r.timestep_index), fmt(f.to(r.F), 4),
      sigFmt(u.to('expansionGas', finite(r.Eg_rb_mscf) ? r.Eg_rb_mscf / 1000 : null), 4),
      sigFmt(u.to('expansionGas', r.Efw), 4), sigFmt(u.to('expansionGas', r.Et), 4),
    ]);
    return {
      head, body, m,
      formula: 'Et = Eg + Efw, with Eg = Bg - Bgi and Efw = Bgi (Swi cw + cf) (pi - p) / (1 - Swi). F = Gp Bg + Wp Bw.',
      closure: rows.map((r) => (finite(r.Et) && finite(r.Eg_rb_mscf) && finite(r.Efw) ? r.Et - (r.Eg_rb_mscf / 1000 + r.Efw) : null)),
    };
  }
  const eUnit = u.label('fvfOil');
  const withCap = m > 0;
  const head = ['Step', `F (${f.label})`, `Eo (${eUnit})`];
  if (withCap) head.push(`Eg (${eUnit})`);
  head.push(`Efw (${eUnit})`, `Et (${eUnit})`);
  const body = rows.map((r) => {
    const cells = [String(r.timestep_index), fmt(f.to(r.F), 4), sigFmt(u.to('fvfOil', r.Eo), 4)];
    if (withCap) cells.push(sigFmt(u.to('fvfOil', r.Eg_oil), 4));
    cells.push(sigFmt(u.to('fvfOil', r.Efw), 4), sigFmt(u.to('fvfOil', r.Et), 4));
    return cells;
  });
  return {
    head, body, m,
    formula: `Et = Eo + m Eg + Efw${withCap ? `, with m = ${sigFmt(m, 4)}` : ' (m = 0, so the gas cap term is absent)'}. Eo = Bt - Bti, Eg = Bti (Bg / Bgi - 1), Efw = Bti (1 + m) (Swi cw + cf) (pi - p) / (1 - Swi). F = Np [Bt + (Rp - Rsi) Bg] + Wp Bw.`,
    closure: rows.map((r) => (finite(r.Et) && finite(r.Eo) && finite(r.Efw) ? r.Et - (r.Eo + m * (finite(r.Eg_oil) ? r.Eg_oil : 0) + r.Efw) : null)),
  };
}

/** The PVT the engine used at each timestep, when the run stored it. */
export function pvtUsedTable(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { rows, isGas } = a.series;
  const has = (k) => rows.some((r) => finite(r[k]));
  if (!has('Bo') && !has('Bg_rb_mscf') && !has('z')) {
    return { stored: false, statement: 'The engine build that made this run did not store the PVT it used at each timestep. Run the engine again on the current build to print it.' };
  }
  const pDigits = pressureDigits(u.unit('pressure'));
  const cols = [['pressure', `p (${u.label('pressure')})`, (r) => fmt(u.to('pressure', r.pressure), pDigits)]];
  if (!isGas && has('Bo')) cols.push(['Bo', `Bo (${u.label('fvfOil')})`, (r) => fmt(u.to('fvfOil', r.Bo), 4)]);
  if (!isGas && has('Rs')) cols.push(['Rs', `Rs (${u.label('gor')})`, (r) => fmt(u.to('gor', r.Rs), 1)]);
  // an oil run holds Bg only where free gas exists (a gas cap, or below the bubble point); elsewhere the engine stores 0
  if (has('Bg_rb_mscf')) cols.push(['Bg', `Bg (${u.label('fvfGas')})`, (r) => (r.Bg_rb_mscf > 0 ? sigFmt(u.to('fvfGas', r.Bg_rb_mscf), 4) : EMPTY_VALUE)]);
  if (isGas && has('z')) cols.push(['z', 'Z', (r) => fmt(r.z, 4)]);
  if (has('Bw')) cols.push(['Bw', `Bw (${u.label('fvfOil')})`, (r) => fmt(u.to('fvfOil', r.Bw), 4)]);
  return {
    stored: true,
    head: ['Step', ...cols.map((c) => c[1])],
    body: rows.map((r) => [String(r.timestep_index), ...cols.map((c) => c[2](r))]),
    note: `The values the engine used at each timestep pressure: a value on the data row first, then the PVT table, then the correlation. Bo and Bw are reservoir volume per stock-tank volume; Bg is reservoir volume per standard volume of gas${isGas ? '' : ', and is printed only where the run has free gas (a gas cap, or a pressure below the bubble point)'}.`,
  };
}

/** The PVT table of the run config, as entered or generated, capped for the page. */
export function pvtTableAsEntered(a, { maxRows = 40 } = {}) {
  const u = a.units ?? OILFIELD_UNITS;
  const table = Array.isArray(a.runConfig?.pvt_lab_table) ? a.runConfig.pvt_lab_table : [];
  if (!table.length) return null;
  const num = (v) => numOrNull(v);
  const has = (k) => table.some((r) => num(r[k]) != null);
  const pDigits = pressureDigits(u.unit('pressure'));
  const cols = [['pressure_psia', `p (${u.label('pressure')})`, (v) => fmt(u.to('pressure', v), pDigits)]];
  if (has('bo_rb_stb')) cols.push(['bo_rb_stb', `Bo (${u.label('fvfOil')})`, (v) => fmt(u.to('fvfOil', v), 4)]);
  if (has('rs_scf_stb')) cols.push(['rs_scf_stb', `Rs (${u.label('gor')})`, (v) => fmt(u.to('gor', v), 1)]);
  if (has('bg_rb_mscf')) cols.push(['bg_rb_mscf', `Bg (${u.label('fvfGas')})`, (v) => sigFmt(u.to('fvfGas', v), 4)]);
  if (has('z_factor')) cols.push(['z_factor', 'Z', (v) => fmt(v, 4)]);
  if (has('bw_rb_stb')) cols.push(['bw_rb_stb', `Bw (${u.label('fvfOil')})`, (v) => fmt(u.to('fvfOil', v), 4)]);
  if (has('oil_viscosity_cp')) cols.push(['oil_viscosity_cp', `Oil viscosity (${u.label('viscosity')})`, (v) => sigFmt(u.to('viscosity', v), 3)]);
  if (has('gas_viscosity_cp')) cols.push(['gas_viscosity_cp', `Gas viscosity (${u.label('viscosity')})`, (v) => sigFmt(u.to('viscosity', v), 3)]);
  const sorted = [...table].sort((x, y) => Number(x.pressure_psia) - Number(y.pressure_psia));
  const shown = sorted.slice(0, maxRows);
  return {
    head: cols.map((c) => c[1]),
    body: shown.map((r) => cols.map((c) => c[2](num(r[c[0]])))),
    note: `${describePvtSource(a.runConfig)}.${sorted.length > shown.length ? ` First ${shown.length} of ${sorted.length} rows.` : ''} The engine interpolates in this table at each timestep pressure.`.replace('..', '.'),
  };
}

// ---- cross-check of methods (RL8) -------------------------------------------

/**
 * The in-place volume by each method the studio has, side by side, so a
 * reviewer sees whether they agree. [method, value, difference, basis].
 */
export function crossCheckRows(a) {
  const u = a.units ?? OILFIELD_UNITS;
  const { result, series, caseData } = a;
  const { isGas, regression } = series;
  const headline = inPlaceOf(result, isGas);
  const hm = result?.plot_data?.history_match ?? null;
  const rows = [];
  const diff = (v) => (finite(v) && finite(headline) && headline !== 0 ? `${v >= headline ? '+' : ''}${fmt(((v - headline) / headline) * 100, 1)}%` : EMPTY_VALUE);
  const add = (method, value, basis, isHeadline = false) => rows.push({
    method, value, text: inPlaceText(u, value, isGas, 2), difference: isHeadline ? 'headline' : diff(value), basis,
  });
  const reg = regressionInPlace(a);
  add(regression.variant.kind === 'pot' ? 'Pot aquifer plot (intercept)' : (regression.variant.kind === 'net' ? 'Havlena-Odeh, F - We against Et (slope)' : 'Havlena-Odeh, F against Et (slope)'),
    reg, `Least squares on ${finite(regression.n) ? regression.n : regression.counts.fit} points, r2 ${r2Text(regression.r2)}`, !hm);
  if (hm) {
    const p = hm.matched_parameters?.find((x) => x.key === (isGas ? 'ogip_scf' : 'stoiip_stb'));
    add('Pressure history match', headline,
      p ? `Fitted, 95% confidence ${inPlaceText(u, p.ci95_low, isGas, 2)} to ${inPlaceText(u, p.ci95_high, isGas, 2)}${hm.converged ? '' : '; the search stopped at the iteration cap'}` : 'Held at its start value while other parameters were fitted', true);
  }
  if (isGas && series.pz) {
    if (finite(series.pz.apparentOgip)) add('p/z straight line to p/z = 0', series.pz.apparentOgip, `Apparent value: no aquifer or compaction term, r2 ${r2Text(series.pz.fit?.r2)}`);
    if (finite(series.pz.ramagostOgip)) add('p/z corrected for rock and water (Ramagost-Farshad)', series.pz.ramagostOgip, 'Compressibility corrected; no aquifer term');
  }
  if (!isGas && series.campbell?.points.length) {
    const lastPt = series.campbell.points[series.campbell.points.length - 1];
    add('F/Et at the last timestep (Campbell level)', lastPt.y, 'Apparent value: equals N only when no water influx supports the pressure');
  }
  const vol = isGas ? numOrNull(caseData?.volumetric_ogip_scf) : numOrNull(caseData?.volumetric_ooip_stb);
  if (vol != null && vol > 0) add('Volumetric estimate', vol, caseData?.volumetric_estimate_source ? `Entered on the case: ${caseData.volumetric_estimate_source}` : 'Entered on the case, source not stated');
  return rows;
}

export const CROSS_CHECK_NOTE = 'Independent routes to the same in-place volume. Agreement supports the tank model; an apparent value above the regression value is the signature of pressure support the simpler method leaves out. No volumetric estimate is printed unless one is entered on the case.';

// ---- limits (RL9) -----------------------------------------------------------

const RANGE_ROWS = Object.freeze({
  standing: ['Standing (1947), Pb, Rs and Bo', 'California crudes; no range is checked by the engine'],
  vasquez_beggs: ['Vasquez-Beggs (1980), Rs and Bo', 'Pressure to 5,250 psia; 75 to 294 degF; 15.3 to 59.5 degAPI; gas gravity 0.511 to 1.351'],
  glaso: ['Glaso (1980), Pb, Rs and Bo', '150 to 7,127 psia; 80 to 280 degF; 22.3 to 48.1 degAPI; gas gravity 0.65 to 1.276'],
  hall_yarborough: ['Hall-Yarborough (1973), Z', 'Pseudo-reduced temperature 1.2 and above'],
  dranchuk_abou_kassem: ['Dranchuk-Abou-Kassem (1975), Z', 'Pseudo-reduced temperature 1.0 to 3.0; pseudo-reduced pressure to 30'],
  mccain: ['McCain (1990), water formation volume factor', 'Used as published; no range is checked by the engine'],
});

const AQUIFER_LIMITS = Object.freeze({
  none: 'No aquifer: the tank is closed. Pressure support from water that the data shows will be read as extra hydrocarbon in place.',
  pot: 'Pot aquifer: the aquifer is small enough to follow the reservoir pressure at once, so influx is proportional to the pressure drop and carries no time. It understates the lag of a large aquifer.',
  fetkovich: 'Fetkovich aquifer: a finite aquifer in pseudo-steady state with a constant productivity index. Early transient influx is not modelled, and the result depends on W and J as entered.',
  carter_tracy: 'Carter-Tracy aquifer: an approximation of the van Everdingen-Hurst unsteady-state solution for a radial aquifer, exact at late time and up to about 17 percent low at the first timestep on the Dake Exercise 9.2 benchmark. The influx depends on the aquifer geometry and properties as entered.',
});

/** True for an engine warning that reports a correlation used outside its range. */
export const isRangeFlag = (w) => /correlation/i.test(w) && /(outside|exceeds|below the|upper bound|lower bound|training range)/i.test(w);

/** The limits block: what the method assumes, the ranges of the correlations in use, and what is outside one. */
export function limitsBlock(a) {
  const { result, runConfig, series, study } = a;
  const { isGas } = series;
  const aquifer = runConfig?.aquifer_model ?? 'none';
  const corr = runConfig?.pvt_correlations ?? {};
  const assumptions = [
    'Tank model: the reservoir is one cell at one average pressure, in equilibrium, with PVT read at that pressure. It does not see compartments, pressure gradients or a moving contact.',
    'The measured pressures are taken as the average reservoir pressure at each date. A survey that had not built up, or that was not referred to the datum, enters as it was typed.',
    AQUIFER_LIMITS[aquifer] ?? AQUIFER_LIMITS.none,
    'The regression is ordinary least squares with a free intercept. It weights every point of the fit equally and gives no confidence interval; the pressure history match does.',
    isGas
      ? 'Gas case: dry gas, one phase in the reservoir. Condensate drop-out and water vapour are not modelled.'
      : 'Oil case: black-oil PVT with the formation and connate water compressibilities held constant; the gas cap ratio m is fixed over the history.',
    'Injected water and gas are not in the withdrawal term of this engine version.',
    `Pressure datum: ${Number.isFinite(study?.datum?.datum_depth_ft) ? 'stated in the inputs' : 'not stated'}. No correction to datum is applied.`,
  ];
  const used = [];
  if (!isGas) used.push(corr.pb_rs_bo || 'standing');
  used.push(corr.z_factor || 'hall_yarborough', corr.water || 'mccain');
  const ranges = {
    head: ['Correlation', 'Published range, as the engine checks it'],
    body: [...new Set(used)].map((k) => RANGE_ROWS[k]).filter(Boolean),
    note: runConfig?.pvt_source === 'correlated'
      ? 'The correlations compute the PVT of this run.'
      : 'The correlations are used only where the PVT table or a data row gives no value.',
  };
  const flags = (result?.warnings ?? []).filter(isRangeFlag);
  return { assumptions, ranges, flags, noFlagsText: 'The engine flagged no input outside the published range of a correlation in use.' };
}

/** Engine warnings that are not range flags (those go in the limits block). */
export const otherWarnings = (result) => (result?.warnings ?? []).filter((w) => !isRangeFlag(w));

// ---- the whole model --------------------------------------------------------

/**
 * Everything the report prints, from what the studio context holds.
 * @param {{caseData: object, result: object, runConfig: object, run?: object, study?: object,
 *   organizationName?: string, build?: string, units?: object}} ctx
 *   `runConfig` is the config snapshot of the run being reported; `study` is
 *   the current study record (identification, datum, input sources).
 */
export function collectMbalReportArgs(ctx) {
  const units = ctx.units ?? OILFIELD_UNITS;
  const series = buildMbalSeries({ result: ctx.result, runConfig: ctx.runConfig, caseData: ctx.caseData });
  const a = { ...ctx, units, series };
  return {
    ...a,
    identification: identificationPairs(a),
    inputs: mbalInputRows(a),
    datum: datumRows(a),
    data: dataSummary(a),
    headline: headlineRows(a),
    regressionText: regressionStatement(a),
    historyMatch: historyMatchBlock(a),
    drive: driveIndexBlock(a),
    driveTable: driveIndexTable(a),
    expansion: expansionTable(a),
    pvtUsed: pvtUsedTable(a),
    pvtTable: pvtTableAsEntered(a),
    crossCheck: crossCheckRows(a),
    limits: limitsBlock(a),
    warnings: otherWarnings(ctx.result),
  };
}

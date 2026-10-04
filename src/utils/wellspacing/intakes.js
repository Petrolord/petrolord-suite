/**
 * Intakes of the Well Spacing Optimizer (WS-U1, reviewer lens RL11): values
 * read BY ID from saved records of five upstream sources, never typed across
 * and never carried in router state, each kept with the project with its
 * source, time and method, so the report prints where every value came from.
 *
 *   pvt-1            Fluid Systems Studio    Bo and oil viscosity read from the
 *                                            project's own table at the stated
 *                                            reservoir pressure (or the bubble
 *                                            point; never extrapolated), the
 *                                            solution GOR at the bubble point,
 *                                            oil and gas gravity, temperature
 *   wta-1            Well Test Analysis      permeability, total skin, the
 *                                            average pressure
 *   mbal-1           Material Balance        OOIP, for the in-place cross-check
 *   dca-forecast-1   Decline Curve Analysis  one well's EUR (oil), for the
 *                                            EUR-implied drainage area
 *   geo_wells        the wells registry      well names and surface locations,
 *                                            for the map and the spacing the
 *                                            wells already have
 *
 * Each intake stores { kind, from: {app, recordId, recordName, at, takenAt,
 * schema}, values, fields, methods, fingerprint }. The fingerprint is the
 * content the values came from, so a card can say "source changed since".
 *
 * Values in oilfield units (the stored units of the app). Pure.
 */
import { pvtContractOf, pvtContractSummary, pvtContractSourceText, PVT_PRODUCER } from '@/lib/inputProvenance/pvtContract';
import { WTA_APP } from '@/lib/wellTestSource';
import { MBAL_APP } from '@/lib/mbalCaseSource';
import { DCA_APP, DCA_FORECAST_SCHEMA, dcaSourceLine } from '@/utils/declineCurve/dcaForecastContract';
import { tableAt } from '@/utils/eor/intakes';

export { intakeCardModel, intakeSourceText } from '@/utils/eor/intakes';
export const REGISTRY_APP = 'Wells registry (Well Data Manager)';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const g5 = (v) => String(parseFloat(Number(v).toPrecision(5)));

/** The fields the shared PVT card shows. */
export const PVT_FIELDS = Object.freeze([
  { key: 'oilFvf', property: 'bo_at_pb', label: 'Oil FVF Bo (RB/STB)' },
  { key: 'oilViscosity', property: 'mu_o_at_pb', label: 'Oil viscosity (cp)' },
  { key: 'initialSolutionGOR', property: 'rsb', label: 'Solution GOR (scf/STB)' },
  { key: 'oilGravity', property: 'oil_gravity', label: 'Oil gravity (degAPI)' },
  { key: 'gasGravity', property: 'gas_gravity', label: 'Gas gravity (air = 1)' },
  { key: 'reservoirTemperature', property: 'inlet_temperature', label: 'Reservoir temperature (degF)' },
]);

/**
 * @param {object} contract the pvt-1 block (with project_id and project_name)
 * @param {{pressurePsia?: ?number, at?: string}} [o]
 */
export function wsPvtIntake(contract, { pressurePsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, errors: ['No pvt-1 block: the Fluid Systems Studio project carries no PVT.'] };
  const pb = b.at_saturation?.pressure;
  const stated = finite(pressurePsia);
  const p = stated ? pressurePsia : pb;
  if (!finite(p)) return { ok: false, errors: ['The block states no bubble point; state the average reservoir pressure.'] };
  const bo = tableAt(b.table, 'Bo', p);
  const mu = tableAt(b.table, 'mu_o', p);
  if (!finite(bo) || !finite(mu)) {
    const ps = (b.table || []).map((r) => r.pressure).filter(finite);
    return { ok: false, errors: [`The pressure ${g5(p)} psia is outside the PVT table of the project (${ps.length ? `${Math.min(...ps)} to ${Math.max(...ps)} psia` : 'no table'}). Values are not extrapolated.`] };
  }
  const origin = `${b.source_app || PVT_PRODUCER}${b.project_name ? `, project "${b.project_name}"` : ''}`;
  const above = finite(pb) && p > pb + 1e-9;
  const where = stated ? `at ${g5(p)} psia, the stated average reservoir pressure (${above ? 'undersaturated' : 'saturated'})` : `at the bubble point, ${g5(p)} psia (no reservoir pressure stated)`;
  const values = { oilFvf: g5(bo), oilViscosity: g5(mu) };
  const methods = {
    oilFvf: `${pvtContractSourceText(b, 'bo', { where })}. Read from the project's PVT table, linear between rows`,
    oilViscosity: `${pvtContractSourceText(b, above ? 'mu_o_undersaturated' : 'mu_o', { where })}. Read from the project's PVT table, linear between rows`,
  };
  const rsb = finite(b.inputs?.rsb) ? b.inputs.rsb : b.at_saturation?.Rs;
  if (finite(rsb)) { values.initialSolutionGOR = g5(rsb); methods.initialSolutionGOR = `Solution GOR at the bubble point (${finite(b.inputs?.rsb) ? 'input of the fluid model' : 'from the table'}), ${origin}`; }
  if (finite(b.inputs?.oil_gravity)) { values.oilGravity = g5(b.inputs.oil_gravity); methods.oilGravity = `Input of the fluid model, ${origin}`; }
  if (finite(b.inputs?.gas_gravity)) { values.gasGravity = g5(b.inputs.gas_gravity); methods.gasGravity = `Input of the fluid model, ${origin}`; }
  if (finite(b.inputs?.temperature)) { values.reservoirTemperature = g5(b.inputs.temperature); methods.reservoirTemperature = `Input of the fluid model (the PVT temperature), ${origin}`; }
  return {
    ok: true,
    errors: [],
    patch: { ...values },
    context: {},
    intake: {
      kind: 'pvt',
      from: { app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null, at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema },
      pressure_psia: p,
      pressure_from: stated ? 'stated' : 'the bubble point of the block',
      values,
      fields: Object.keys(values),
      methods,
      contract: pvtContractSummary(b),
    },
  };
}

export const wtaFingerprint = (b) => (b ? { k: b.permeability?.value ?? null, kMethod: b.permeability?.method ?? null, s: b.skin?.total ?? null, p: b.pressure?.average_psia ?? null } : null);

/** @param {object} block wta-1 */
export function wsWtaIntake(block, { recordId = null, recordName = null, updatedAt = null, at: takenAt = new Date().toISOString() } = {}) {
  if (!block || block.contract !== 'wta-1') return { ok: false, errors: ['No wta-1 block: the Well Test project carries no results. Open it in Well Test Analysis Studio and save it once.'] };
  const k = block.permeability?.value;
  if (!finite(k) || !(k > 0)) return { ok: false, errors: ['The Well Test project states no permeability.'] };
  const name = recordName || block.project?.name || null;
  const origin = `${WTA_APP}${name ? `, project "${name}"` : ''}${block.project?.well ? `, well ${block.project.well}` : ''}`;
  const ci = Array.isArray(block.permeability.ci95) ? ` (95% interval ${g5(block.permeability.ci95[0])} to ${g5(block.permeability.ci95[1])} md)` : '';
  const win = block.permeability.window ? `, window ${g5(block.permeability.window.from_hr)} to ${g5(block.permeability.window.to_hr)} hr of ${block.permeability.window.basis}` : '';
  const values = { permeability: g5(k) };
  const methods = { permeability: `${block.permeability.method || 'Method not stated'}${win}${ci}. Well test permeability is the average over the tested interval and the radius of investigation, ${origin}` };
  const s = block.skin?.total;
  if (finite(s) && !block.skin?.withheld) {
    values.skin = g5(s);
    const parts = finite(block.skin.mechanical) && finite(block.skin.partial_penetration) ? ` (mechanical ${g5(block.skin.mechanical)}, partial penetration ${g5(block.skin.partial_penetration)})` : '';
    methods.skin = `Total skin${parts}, ${block.skin.method || 'method not stated'}${block.skin.apparent ? ', apparent (includes rate-dependent skin)' : ''}, ${origin}`;
  }
  const pAvg = block.pressure?.average_psia;
  if (finite(pAvg)) {
    values.reservoirPressure = g5(pAvg);
    methods.reservoirPressure = `${block.pressure.average_method || 'Average pressure.'}${block.pressure.basis ? ` Basis: ${block.pressure.basis}` : ''}, ${origin}`;
  }
  return {
    ok: true,
    errors: [],
    patch: { ...values },
    context: {},
    intake: {
      kind: 'wta',
      from: { app: WTA_APP, recordId: recordId ?? block.project?.id ?? null, recordName: name, at: block.computed_at ?? updatedAt ?? null, takenAt, schema: 'wta-1' },
      values,
      fields: Object.keys(values),
      methods,
      fingerprint: wtaFingerprint(block),
    },
  };
}

export const mbalFingerprint = (r) => (r ? { n: r.in_place?.value ?? null, q: r.in_place?.quantity ?? null, run: r.run?.id ?? null } : null);

/** @param {object} record mbal-1 */
export function wsMbalIntake(record, { at: takenAt = new Date().toISOString() } = {}) {
  if (!record || record.contract !== 'mbal-1') return { ok: false, errors: ['No mbal-1 record.'] };
  if (record.in_place?.quantity !== 'OOIP' || !finite(record.in_place.value)) return { ok: false, errors: [`The case "${record.case?.name}" is a gas case or has no OOIP to take.`] };
  const origin = `${MBAL_APP}, case "${record.case?.name ?? record.case?.id}"${record.run?.ran_at ? `, run of ${String(record.run.ran_at).slice(0, 16).replace('T', ' ')} UTC` : ''}`;
  const values = { ooipStb: String(Math.round(record.in_place.value)) };
  const methods = { ooipStb: `${record.in_place.method}${finite(record.in_place.r_squared) ? `, r2 ${record.in_place.r_squared.toFixed(3)}` : ''}${record.status === 'earlier_run' ? ' (from an earlier run: the case changed after it)' : ''}, ${origin}` };
  return {
    ok: true,
    errors: [],
    patch: {},
    context: values,
    intake: {
      kind: 'mbal',
      from: { app: MBAL_APP, recordId: record.case?.id ?? null, recordName: record.case?.name ?? null, at: record.run?.ran_at ?? null, takenAt, schema: 'mbal-1' },
      values,
      fields: Object.keys(values),
      methods,
      fingerprint: mbalFingerprint(record),
    },
  };
}

export const dcaFingerprint = (c) => (c ? { eur: c.forecast?.eur ?? null, fp: c.fingerprint ?? null } : null);

/** @param {object} contract dca-forecast-1 (one well, one stream) */
export function wsDcaIntake(contract, { at: takenAt = new Date().toISOString() } = {}) {
  if (!contract || contract.schema !== DCA_FORECAST_SCHEMA) return { ok: false, errors: ['Not a Decline Curve Analysis forecast.'] };
  if (contract.stream !== 'oil') return { ok: false, errors: [`This is a ${contract.stream} forecast; the spacing check takes an oil EUR.`] };
  const eur = contract.forecast?.eur;
  if (!finite(eur) || !(eur > 0)) return { ok: false, errors: ['The forecast states no EUR.'] };
  const values = { dcaEurStb: String(Math.round(eur)) };
  const methods = {
    dcaEurStb: `EUR of ${dcaSourceLine(contract)}: produced ${Math.round(contract.forecast.produced ?? 0).toLocaleString('en-US')} STB to the cut-off plus the forecast to ${contract.forecast.endReason === 'economic-limit' ? 'the economic limit' : 'the forecast horizon'}${contract.source?.sample ? ' (a sample well)' : ''}`,
  };
  return {
    ok: true,
    errors: [],
    patch: {},
    context: values,
    intake: {
      kind: 'dca',
      from: { app: DCA_APP, recordId: contract.projectId ?? null, recordName: contract.projectName ?? null, at: contract.projectSavedAt ?? null, takenAt, schema: DCA_FORECAST_SCHEMA, wellId: contract.source?.wellId ?? null, wellName: contract.source?.wellName ?? null, stream: 'oil' },
      values,
      fields: Object.keys(values),
      methods,
      fingerprint: dcaFingerprint(contract),
    },
  };
}

/**
 * Wells from the registry: names and surface locations, one coordinate
 * unit and one CRS, or refused with the reason.
 * @param {object[]} wells geo_wells rows
 */
export function wsWellsIntake(wells, { at: takenAt = new Date().toISOString() } = {}) {
  const rows = (wells || []).filter((w) => finite(w?.surface_x) && finite(w?.surface_y));
  if (rows.length < 2) return { ok: false, errors: ['Choose at least two wells with surface coordinates.'] };
  const unit = (w) => (w.xy_unit || 'm');
  const units = [...new Set(rows.map(unit))];
  if (units.length > 1) return { ok: false, errors: [`The wells hold coordinates in different units (${units.join(', ')}); convert them to one in Well Data Manager first.`] };
  const crss = [...new Set(rows.map((w) => w.crs || '').filter(Boolean))];
  if (crss.length > 1) return { ok: false, errors: [`The wells are in different coordinate systems (${crss.join(', ')}); distances between them would be meaningless.`] };
  const list = rows.map((w) => ({ id: w.id, name: w.name, x: w.surface_x, y: w.surface_y }));
  return {
    ok: true,
    errors: [],
    patch: {},
    context: {},
    intake: {
      kind: 'wells',
      from: { app: REGISTRY_APP, recordId: null, recordName: `${list.length} wells`, at: null, takenAt, schema: 'geo_wells' },
      xyUnit: units[0],
      crs: crss[0] || null,
      wells: list,
      values: {},
      fields: [],
      methods: {},
      fingerprint: { wells: list.map((w) => `${w.id}:${w.x}:${w.y}`).join('|') },
    },
  };
}

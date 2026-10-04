/**
 * Intakes of EOR Screening (EOR-U1, reviewer lens RL11): screening inputs
 * read BY ID from saved projects of three upstream apps, never typed across
 * and never carried in router state, each kept with the project with its
 * source, time and method so the report prints where every value came from.
 *
 *   pvt-1  Fluid Systems Studio   oil gravity (input of the fluid model),
 *                                 oil viscosity at reservoir conditions (the
 *                                 project's own table at the stated reservoir
 *                                 pressure, or at the bubble point when none
 *                                 is stated; never extrapolated), reservoir
 *                                 temperature (input of the fluid model), and
 *                                 the bubble point for context
 *   wta-1  Well Test Analysis     permeability (with its method, window and
 *                                 95% interval), and the average pressure for
 *                                 context
 *   mbal-1 Material Balance       OOIP and the last average pressure, for
 *                                 context (Taber 1997 screens neither)
 *
 * What each intake stores: { from: {app, recordId, recordName, at, takenAt,
 * schema}, values: {key: string}, methods: {key: words}, fingerprint }.
 * The fingerprint is the content the values came from, so the card can say
 * "source changed since" when the source is saved again with different
 * content (a re-save with the same content is no change: SCAL-U1-023).
 *
 * All values in oilfield units (the stored units of the app). Pure.
 */
import { pvtContractOf, pvtContractSummary, pvtContractSourceText, PVT_PRODUCER } from '@/lib/inputProvenance/pvtContract';
import { WTA_APP } from '@/lib/wellTestSource';
import { MBAL_APP } from '@/lib/mbalCaseSource';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const g4 = (v) => String(parseFloat(Number(v).toPrecision(4)));

/** Linear interpolation of a table column at a pressure; null outside the table. */
export function tableAt(rows, key, p) {
  const pts = (rows || []).filter((r) => finite(r.pressure) && finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  if (!pts.length || !finite(p) || p < pts[0].pressure - 1e-9 || p > pts[pts.length - 1].pressure + 1e-9) return null;
  for (let i = 1; i < pts.length; i += 1) {
    if (p <= pts[i].pressure) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[key] + ((b[key] - a[key]) * (p - a.pressure)) / (b.pressure - a.pressure);
    }
  }
  return pts[pts.length - 1][key];
}

/** The fields of the shared PVT card, in the app's words. */
export const PVT_FIELDS = Object.freeze([
  { key: 'gravityApi', property: 'oil_gravity', label: 'Oil gravity (degAPI)' },
  { key: 'viscosityCp', property: 'mu_o_at_pb', label: 'Oil viscosity at reservoir conditions (cp)' },
  { key: 'temperatureF', property: 'inlet_temperature', label: 'Reservoir temperature (degF)' },
]);

/**
 * @param {object} contract the pvt-1 block (with project_id and project_name)
 * @param {{pressurePsia?: ?number, at?: string}} [o]
 */
export function eorPvtIntake(contract, { pressurePsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const b = pvtContractOf(contract);
  if (!b) return { ok: false, errors: ['No pvt-1 block: the Fluid Systems Studio project carries no PVT.'] };
  const pb = b.at_saturation?.pressure;
  const stated = finite(pressurePsia);
  const p = stated ? pressurePsia : pb;
  if (!finite(p)) return { ok: false, errors: ['The block states no bubble point; state the reservoir pressure.'] };
  const mu = tableAt(b.table, 'mu_o', p);
  if (!finite(mu)) {
    const ps = (b.table || []).map((r) => r.pressure).filter(finite);
    return { ok: false, errors: [`The pressure ${g4(p)} psia is outside the PVT table of the project (${ps.length ? `${Math.min(...ps)} to ${Math.max(...ps)} psia` : 'no table'}). Values are not extrapolated.`] };
  }
  const values = {};
  const methods = {};
  const api = b.inputs?.oil_gravity;
  const t = b.inputs?.temperature;
  const origin = `${b.source_app || PVT_PRODUCER}${b.project_name ? `, project "${b.project_name}"` : ''}`;
  if (finite(api)) { values.gravityApi = g4(api); methods.gravityApi = `Input of the fluid model, ${origin}`; }
  values.viscosityCp = g4(mu);
  const above = finite(pb) && p > pb + 1e-9;
  const where = stated ? `at ${g4(p)} psia, the stated reservoir pressure (${above ? 'undersaturated' : 'saturated'})` : `at the bubble point, ${g4(p)} psia (no reservoir pressure stated)`;
  methods.viscosityCp = `${pvtContractSourceText(b, above ? 'mu_o_undersaturated' : 'mu_o', { where })}. Read from the project's PVT table, linear between rows`;
  if (finite(t)) { values.temperatureF = g4(t); methods.temperatureF = `Input of the fluid model (the PVT temperature), ${origin}`; }
  const context = finite(pb) ? { saturationPressurePsia: g4(pb) } : {};
  if (finite(pb)) methods.saturationPressurePsia = pvtContractSourceText(b, 'pb', { where: '' });
  return {
    ok: true,
    errors: [],
    patch: Object.fromEntries(['gravityApi', 'viscosityCp', 'temperatureF'].filter((k) => values[k] != null).map((k) => [k, values[k]])),
    context,
    intake: {
      kind: 'pvt',
      from: { app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null, at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema },
      pressure_psia: p,
      pressure_from: stated ? 'stated' : 'the bubble point of the block',
      values: { ...values, ...context },
      fields: Object.keys(values),
      methods,
      contract: pvtContractSummary(b),
    },
  };
}

/** Card fields with their methods (the shared PvtIntakeCard prints them). */
export function eorPvtCardFields(intake) {
  return PVT_FIELDS.map((f) => ({ ...f, method: intake?.methods?.[f.key] || undefined }));
}

/** What a wta-1 block says that the intake took, for "source changed since". */
export const wtaFingerprint = (b) => (b ? { k: b.permeability?.value ?? null, kMethod: b.permeability?.method ?? null, p: b.pressure?.average_psia ?? null } : null);

/** @param {object} block wta-1 @param {{recordId?: string, recordName?: string, updatedAt?: string, at?: string}} [o] */
export function eorWtaIntake(block, { recordId = null, recordName = null, updatedAt = null, at: takenAt = new Date().toISOString() } = {}) {
  if (!block || block.contract !== 'wta-1') return { ok: false, errors: ['No wta-1 block: the Well Test project carries no results. Open it in Well Test Analysis Studio and save it once.'] };
  const k = block.permeability?.value;
  if (!finite(k) || !(k > 0)) return { ok: false, errors: ['The Well Test project states no permeability.'] };
  const name = recordName || block.project?.name || null;
  const origin = `${WTA_APP}${name ? `, project "${name}"` : ''}${block.project?.well ? `, well ${block.project.well}` : ''}`;
  const ci = Array.isArray(block.permeability.ci95) ? ` (95% interval ${g4(block.permeability.ci95[0])} to ${g4(block.permeability.ci95[1])} md)` : '';
  const win = block.permeability.window ? `, window ${g4(block.permeability.window.from_hr)} to ${g4(block.permeability.window.to_hr)} hr of ${block.permeability.window.basis}` : '';
  const values = { permeabilityMd: g4(k) };
  const methods = { permeabilityMd: `${block.permeability.method || 'Method not stated'}${win}${ci}. Well test permeability is the average over the tested interval and the radius of investigation, ${origin}` };
  const pAvg = block.pressure?.average_psia;
  if (finite(pAvg)) {
    values.reservoirPressurePsia = g4(pAvg);
    methods.reservoirPressurePsia = `${block.pressure.average_method || 'Average pressure'} ${block.pressure.basis || ''}, ${origin}`.replace(/\s+,/g, ',');
  }
  return {
    ok: true,
    errors: [],
    patch: { permeabilityMd: values.permeabilityMd },
    context: values.reservoirPressurePsia ? { reservoirPressurePsia: values.reservoirPressurePsia } : {},
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

/** What an mbal-1 record says that the intake took. */
export const mbalFingerprint = (r) => (r ? { n: r.in_place?.value ?? null, q: r.in_place?.quantity ?? null, p: r.pressure?.last_psia ?? null, run: r.run?.id ?? null } : null);

/** @param {object} record mbal-1 */
export function eorMbalIntake(record, { at: takenAt = new Date().toISOString() } = {}) {
  if (!record || record.contract !== 'mbal-1') return { ok: false, errors: ['No mbal-1 record.'] };
  const origin = `${MBAL_APP}, case "${record.case?.name ?? record.case?.id}"${record.run?.ran_at ? `, run of ${String(record.run.ran_at).slice(0, 16).replace('T', ' ')} UTC` : ''}`;
  const values = {};
  const methods = {};
  if (record.in_place?.quantity === 'OOIP' && finite(record.in_place.value)) {
    values.ooipStb = String(Math.round(record.in_place.value));
    methods.ooipStb = `${record.in_place.method}${finite(record.in_place.r_squared) ? `, r2 ${record.in_place.r_squared.toFixed(3)}` : ''}${record.status === 'earlier_run' ? ' (from an earlier run: the case changed after it)' : ''}, ${origin}`;
  }
  if (finite(record.pressure?.last_psia)) {
    values.reservoirPressurePsia = g4(record.pressure.last_psia);
    methods.reservoirPressurePsia = `Last average pressure of the case${record.pressure.last_date ? ` (${String(record.pressure.last_date).slice(0, 10)})` : ''}, ${record.pressure.basis}, ${origin}`;
  }
  if (!Object.keys(values).length) return { ok: false, errors: [`The case "${record.case?.name}" is a gas case or has no OOIP or pressure to take.`] };
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

const WORDS = Object.freeze({ k: 'permeability', kMethod: 'the permeability method', p: 'the pressure', n: 'the in-place volume', q: 'the quantity', run: 'the run' });
const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/**
 * The card model of a wta or mbal intake: source, values received and now,
 * "edited after intake", and "source changed since" against the source read
 * again (`latestFingerprint`).
 */
export function intakeCardModel({ intake, current = {}, labels = {}, latestFingerprint = null, latestError = null }) {
  if (!intake) return null;
  const rows = (intake.fields || []).map((k) => {
    const received = intake.values?.[k] ?? null;
    const now = current[k];
    const edited = received != null && now != null && String(now) !== '' && Number(now) !== Number(received);
    return { key: k, label: labels[k] || k, received, current: now == null || now === '' ? null : String(now), edited, method: intake.methods?.[k] || '' };
  });
  let changedSince = null;
  if (latestFingerprint && intake.fingerprint) {
    const diffs = Object.keys({ ...intake.fingerprint, ...latestFingerprint })
      .filter((k) => JSON.stringify(intake.fingerprint[k] ?? null) !== JSON.stringify(latestFingerprint[k] ?? null))
      .map((k) => `${WORDS[k] || k} (now ${latestFingerprint[k] ?? 'none'}, was ${intake.fingerprint[k] ?? 'none'})`);
    if (diffs.length) changedSince = `The source now differs: ${diffs.join('; ')}. The values here are the ones received (${when(intake.from?.takenAt) || 'time not recorded'}); take them again to use the new ones.`;
  }
  const edited = rows.filter((r) => r.edited).map((r) => r.label);
  let status = 'As received';
  if (changedSince && edited.length) status = 'Source changed since; edited after intake';
  else if (changedSince) status = 'Source changed since';
  else if (edited.length) status = 'Edited after intake';
  const f = intake.from || {};
  return {
    source: `${f.app}${f.recordName ? `, "${f.recordName}"` : ''}`,
    at: when(f.at),
    takenAt: when(f.takenAt),
    rows,
    changedSince,
    edited,
    status,
    unreadable: latestError || null,
  };
}

/**
 * The Source column words of a value taken by an intake, or null when it
 * was not taken; "edited after intake" when it no longer matches.
 */
export function intakeSourceText(intakes, key, now) {
  for (const it of Object.values(intakes || {})) {
    if (!it?.values || it.values[key] == null) continue;
    const base = it.methods?.[key] || `From ${it.from?.app}`;
    const received = it.values[key];
    if (now != null && String(now) !== '' && Number(now) !== Number(received)) {
      return `Edited in this app after the intake (received ${received}). The intake said: ${base}`;
    }
    return base;
  }
  return null;
}

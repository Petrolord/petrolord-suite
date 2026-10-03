/**
 * What a consuming app keeps and shows about the relative permeability (or
 * capillary pressure) it took from SCAL Studio (SCAL-U1, RL11). One model
 * for the shared card (KrIntakeCard.jsx) in every consumer, the pattern of
 * pvtIntakeCard.js: where the curves came from and when, whether the set
 * was fitted to lab data or typed, the pedigree of the sample behind it,
 * whether the source project changed after the intake ("source changed
 * since"), and which values were edited in the consumer after the intake.
 *
 * The consumer keeps what was sent: a change at the source is shown, never
 * applied silently.
 *
 * Pure.
 */
import { krContractOf, krContractSourceText, krSetText, KR1_ORIGINS, KR_PRODUCER } from './krContract.js';

const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/** The block without its tables: what a receiver stores with its project. */
export function krContractSummary(block) {
  const b = krContractOf(block);
  if (!b) return null;
  const strip = (set) => (set ? { ...set, table: undefined, table_rows: Array.isArray(set.table) ? set.table.length : 0 } : null);
  return { ...b, oil_water: strip(b.oil_water), gas_oil: strip(b.gas_oil), capillary: b.capillary ? { ...b.capillary, table: undefined, table_rows: (b.capillary.table || []).length } : null };
}

/**
 * The record a consumer stores with its own project when it takes a set.
 * @param {{contract: object, set?: 'oil_water'|'gas_oil', values: Object<string, any>, at?: string}} a
 */
export function krIntakeRecord({ contract, set = 'oil_water', values, at = new Date().toISOString() }) {
  const b = krContractOf(contract);
  return {
    from: {
      app: b?.source_app || KR_PRODUCER,
      recordId: b?.project_id || null,
      recordName: b?.project_name || null,
      at,
      generatedAt: b?.generated_at || null,
      build: b?.app_build || null,
    },
    set,
    values: { ...values },
    sourceText: b ? krContractSourceText(b, set) : null,
    contract: b ? krContractSummary(b) : null,
  };
}

/**
 * @param {{intake: ?object, current?: Object<string, any>, fields: Array<{key: string, label: string}>,
 *   latest?: ?{contract: ?object, ok?: boolean, reason?: ?string}}} a
 * @returns {?object} null when the project took nothing from SCAL Studio
 */
export function krIntakeCardModel({ intake, current = {}, fields = [], latest = null }) {
  if (!intake) return null;
  const c = intake.contract || null;
  const from = intake.from || {};
  const source = from.recordName ? `${from.app || KR_PRODUCER}, project "${from.recordName}"` : (from.app || `${KR_PRODUCER} (handoff with no saved project)`);
  const rows = fields.filter((f) => intake.values?.[f.key] != null).map((f) => {
    const received = intake.values[f.key];
    const now = current[f.key];
    const edited = now != null && String(now) !== '' && Number(now) !== Number(received);
    return { key: f.key, label: f.label, received: String(received), current: now == null ? null : String(now), edited };
  });
  const set = c?.[intake.set || 'oil_water'];
  const origin = set?.origin?.kind ? KR1_ORIGINS[set.origin.kind] : 'not stated by the handoff';
  const setText = c ? krSetText(c, intake.set || 'oil_water') : null;
  const sample = set?.origin?.sample_id ? (c.samples || []).find((s) => s.id === set.origin.sample_id) : null;
  const pedigree = sample ? [
    sample.origin ? (sample.origin === 'analog' ? 'Analog' : 'Lab') : 'Lab or analog not stated',
    sample.process_kr ? `${sample.process_kr}` : 'drainage or imbibition not stated',
    sample.wettability || 'wettability not stated',
    sample.laboratory ? `lab ${sample.laboratory}` : null,
  ].filter(Boolean).join(', ') : null;
  let changedSince = null;
  const sentAt = from.generatedAt || from.at;
  if (latest?.ok && latest.contract?.generated_at && sentAt && Date.parse(latest.contract.generated_at) > Date.parse(sentAt) + 1000) {
    changedSince = { at: latest.contract.generated_at, text: `The source project was saved again on ${when(latest.contract.generated_at)}, after this intake (${when(sentAt)}). The values here are the ones received; send them again from SCAL Studio to take the new ones.` };
  }
  const edited = rows.filter((r) => r.edited).map((r) => r.label);
  let status = 'As received';
  if (changedSince && edited.length) status = 'Source changed since; edited after intake';
  else if (changedSince) status = 'Source changed since';
  else if (edited.length) status = 'Edited after intake';
  return {
    source,
    at: when(from.at),
    build: from.build || null,
    origin,
    setText: setText || 'Not stated by the handoff',
    pedigree,
    rows,
    changedSince,
    edited,
    status,
    unreadable: latest && latest.ok === false ? latest.reason || 'The source project could not be read again.' : null,
  };
}

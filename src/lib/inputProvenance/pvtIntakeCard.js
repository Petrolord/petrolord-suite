/**
 * What a consuming app shows about the PVT it took from Fluid Systems
 * Studio (FLUID-U2-005; RL11). One model for the shared card
 * (PvtIntakeCard.jsx) in every consumer: where the fluid came from and
 * when, the method behind each property taken, the range flags, whether
 * the source project changed after the intake ("source changed since"),
 * and which values were edited in the consumer after the intake.
 *
 * The consumer keeps the block as it was sent (owner default 2026-10-02):
 * a change at the source is shown, never applied silently.
 *
 * Pure.
 */
import { PVT1_PROPERTIES, PVT1_PB_SOURCES, pvtContractTuningText } from './pvtContract.js';

// the pvt-1 method row of each version-1 property a consumer takes
const METHOD_OF = Object.freeze({ pb: 'pb', bo_at_pb: 'bo', mu_o_at_pb: 'mu_o' });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/**
 * @param {{intake: ?object, current?: Object<string, any>, fields: Array<{property: string, key: string, storeKey?: string, label: string}>,
 *   latest?: ?{contract: ?object, updatedAt?: ?string, ok?: boolean, reason?: ?string}}} a
 *   `intake` is what pvtIntake(...).intake stored with the consumer's project; `current` the consumer's
 *   values by storeKey (or key); `latest` the source project as read again by id
 * @returns {?{source: string, at: ?string, build: ?string, model: string, tuning: string, bubblePoint: string,
 *   rows: Array<{key: string, label: string, received: ?string, current: ?string, edited: boolean, method: string}>,
 *   rangeFlags: string[], changedSince: ?{at: string, text: string}, edited: string[], status: string}}
 *   null when the project took no PVT
 */
export function pvtIntakeCardModel({ intake, current = {}, fields = [], latest = null }) {
  if (!intake) return null;
  const c = intake.contract || null;
  const from = intake.from || {};
  const source = from.recordName ? `${from.app || 'Fluid Systems Studio'}, project "${from.recordName}"` : (from.app || 'Fluid Systems Studio (handoff with no saved project)');
  const rows = fields.filter((f) => intake.values?.[f.key] != null || (intake.fields || []).includes(f.key) || (intake.inputFields || []).includes(f.key)).map((f) => {
    const received = intake.values?.[f.key] ?? null;
    const now = current[f.storeKey || f.key];
    const edited = received != null && now != null && String(now) !== '' && Number(now) !== Number(received);
    const m = c?.methods?.[METHOD_OF[f.property]];
    // a result of the fluid model names the method that produced it; an input is said to be one
    const method = METHOD_OF[f.property] ? (m ? m.method : 'Result of the fluid model, method not stated') : 'Input of the fluid model';
    return { key: f.key, label: f.label, received: received == null ? null : String(received), current: now == null ? null : String(now), edited, method };
  });
  const flags = (c?.range_flags || []).map((x) => x.text).filter(Boolean);
  let changedSince = null;
  if (latest?.ok && latest.contract?.generated_at && from.at && Date.parse(latest.contract.generated_at) > Date.parse(from.at) + 1000) {
    changedSince = { at: latest.contract.generated_at, text: `The source project was saved again on ${when(latest.contract.generated_at)}, after this intake (${when(from.at)}). The values here are the ones received; read the project again to take the new ones.` };
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
    model: c ? (c.model === 'eos' ? 'Equation of state' : c.model === 'lab' ? 'Laboratory table' : 'Black-oil correlations') : 'Not stated by the handoff',
    tuning: c ? (pvtContractTuningText(c) || 'No lab tuning') : 'Not stated by the handoff',
    bubblePoint: c && finite(c.at_saturation?.pressure) ? `${c.at_saturation.pressure} psia, ${PVT1_PB_SOURCES[c.pb_source] || 'source not stated'}` : 'Not stated by the handoff',
    rows,
    rangeFlags: flags,
    changedSince,
    edited,
    status,
    unreadable: latest && latest.ok === false ? latest.reason || 'The source project could not be read again.' : null,
    properties: Object.keys(PVT1_PROPERTIES).length,
  };
}

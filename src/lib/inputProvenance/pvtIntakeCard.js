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
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * What a pvt-1 block says, without when it was said (SCAL U2 batch
 * decision 2026-10-03, the SCAL-U1-023 fix carried here): the model, the
 * bubble point source, the tuning state, the method of each property, the
 * values at saturation and the inputs of the fluid model. Leaves out the
 * save time, the build, the table, the identification and the range
 * request, so a re-save of the same fluid has the same fingerprint. Works
 * on the full block and on the summary a consumer stores.
 */
export function pvtContentFingerprint(block) {
  if (!isRecord(block)) return null;
  const numbers = (o) => Object.fromEntries(Object.entries(isRecord(o) ? o : {})
    .filter(([, v]) => v == null || typeof v === 'number' || typeof v === 'string')
    .sort(([a], [b]) => a.localeCompare(b)));
  return {
    model: block.model ?? null,
    pb_source: block.pb_source ?? null,
    tuning: block.tuning ? { status: block.tuning.status ?? null, kind: block.tuning.kind ?? null } : null,
    methods: Object.fromEntries(Object.entries(isRecord(block.methods) ? block.methods : {})
      .map(([k, m]) => [k, m?.method ?? null]).sort(([a], [b]) => a.localeCompare(b))),
    at_saturation: numbers(block.at_saturation),
    inputs: numbers(block.inputs),
  };
}

const sameValue = (a, b) => {
  if (finite(a) && finite(b)) return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return (a ?? null) === (b ?? null);
};

/** Words for each way the latest block differs from the one the consumer took, or [] when it says the same. */
function fingerprintDifferences(taken, latest) {
  const a = pvtContentFingerprint(taken);
  const b = pvtContentFingerprint(latest);
  if (!a || !b) return [];
  const out = [];
  if (!sameValue(a.model, b.model)) out.push(`the fluid model (now ${b.model}, was ${a.model})`);
  if (!sameValue(a.pb_source, b.pb_source)) out.push(`the source of the bubble point (now ${PVT1_PB_SOURCES[b.pb_source] || b.pb_source}, was ${PVT1_PB_SOURCES[a.pb_source] || a.pb_source})`);
  if (JSON.stringify(a.tuning) !== JSON.stringify(b.tuning)) out.push(`the tuning (now ${b.tuning?.status || 'none'}, was ${a.tuning?.status || 'none'})`);
  for (const k of new Set([...Object.keys(a.methods), ...Object.keys(b.methods)])) {
    if (!sameValue(a.methods[k], b.methods[k])) out.push(`the method of ${PVT1_PROPERTIES[k]?.label || k} (now ${b.methods[k] ?? 'none'}, was ${a.methods[k] ?? 'none'})`);
  }
  for (const [group, words] of [['at_saturation', 'at saturation'], ['inputs', 'input']]) {
    for (const k of new Set([...Object.keys(a[group]), ...Object.keys(b[group])])) {
      if (!sameValue(a[group][k], b[group][k])) out.push(`${k} ${words === 'input' ? `${b[group][k]} (input; was ${a[group][k]})` : `at saturation ${b[group][k]} (was ${a[group][k]})`}`);
    }
  }
  return out;
}
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
  // "Source changed since" is about content: every save re-stamps the block
  // (autosave too), so a later time alone is not a change. Compared: what
  // the block says (pvtContentFingerprint), the stored summary against the
  // block read again by id.
  let changedSince = null;
  if (latest?.ok && latest.contract && c) {
    const diffs = fingerprintDifferences(c, latest.contract);
    if (diffs.length) {
      const at = latest.contract.generated_at;
      changedSince = { at, text: `The source project was saved again${when(at) ? ` on ${when(at)}` : ''} and now differs: ${diffs.join('; ')}. The values here are the ones received (${when(from.at)}); read the project again to take the new ones.` };
    }
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

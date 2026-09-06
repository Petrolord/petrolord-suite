// Event records (WS2): an event is a ws_records row of kind 'event' with
// its type as the subtype; a duration event starts as version 1 with no
// end and is ended by a version 2 on the same chain carrying ended_at
// (append-only: nothing is updated). The engine's events.js does the
// timeline arithmetic on the plain shape these helpers produce. Pure.

import { EVENT_TYPES, eventType, eventsInPeriod, openEvents, timeByType } from '@/lib/wellsite/events';
import { chainHeads } from '@/lib/wellsite/records';

export { EVENT_TYPES, eventType, eventsInPeriod, openEvents, timeByType };

/** Engine event shapes from the current heads of the event chains. */
export function eventsFromRecords(records) {
  const heads = chainHeads(records.filter((r) => r.kind === 'event'));
  return heads.map((r) => {
    const t = eventType(r.subtype) || { name: r.subtype, duration: true, family: 'other' };
    return {
      id: r.id, chainId: r.chain_id, type: r.subtype, label: (r.payload && r.payload.label) || t.name,
      startUtcMs: Date.parse(r.occurred_at), endUtcMs: r.ended_at ? Date.parse(r.ended_at) : (t.duration ? null : Date.parse(r.occurred_at)),
      mdM: r.md_calc_m ?? null, by: r.created_by, note: (r.payload && r.payload.note) || null, duration: t.duration, family: t.family, record: r,
    };
  }).sort((a, b) => a.startUtcMs - b.startUtcMs);
}

/** The record parameters to start an event now. */
export function startEventParams({ type, label = null, note = null, bit = null, occurredAt = null }) {
  const t = eventType(type);
  if (!t) throw new Error(`Unknown event type ${type}.`);
  if (type === 'user_defined' && !(label && label.trim())) throw new Error('A user-defined event needs a label.');
  const at = occurredAt || new Date().toISOString();
  const p = { kind: 'event', subtype: type, occurredAt: at, payload: { label: label || t.name, note, family: t.family, duration: t.duration } };
  // a point event starts and ends at the same instant
  if (!t.duration) p.endedAt = at;
  if (bit) p.depth = { value: bit.depth_value, unit: bit.depth_unit, reference: bit.depth_ref, datum: bit.depth_datum, kind: 'event' };
  return p;
}

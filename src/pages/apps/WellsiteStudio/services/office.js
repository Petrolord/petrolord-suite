// The office view (upgrade U2-007): one row per live well the user can
// see, read from the local store, for the operations geologist's morning
// page. Nothing here writes a record. Every figure comes from the same
// services the rig's screens use (lag, sample board, tops board), so the
// office reads exactly what the rig reads. What "awaits" someone is said
// from the record: calls not yet final, competing versions, the latest
// report of each kind with no sign-off, samples overdue for review. Pure.

import { currentObservations } from '@/lib/wellsite/records';
import { eventsFromRecords } from './events';
import { lagNow, sampleBoard, ropNow } from './samples';
import { formationBoard, currentPrognosis } from './tops';
import { wellContext } from './wellContext';
import { wellWithSurvey, activeSurvey, SURVEY_SUBTYPE } from './surveys';
import { currentWashout } from './lagCheck';

/**
 * The summary of one well.
 * @param {Object} p { well, records, samples, stages, tops, prognoses, reports, signoffs, nowMs }
 */
export function officeRow({ well, records = [], samples = [], stages = [], tops = [], prognoses = [], reports = [], signoffs = [], nowMs }) {
  const obs = records.filter((r) => r.kind === 'observation');
  const bitDepths = currentObservations(obs.filter((r) => r.subtype === 'bit_depth')).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const pumpEvents = currentObservations(obs.filter((r) => r.subtype === 'pump_rate')).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const cfgs = obs.filter((r) => r.subtype === 'rig_config').sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const rigConfig = cfgs.length ? cfgs[cfgs.length - 1].payload : null;
  const events = eventsFromRecords(records.filter((r) => r.kind === 'event'));
  const surveyRecords = obs.filter((r) => r.subtype === SURVEY_SUBTYPE);
  const wellEff = wellWithSurvey(well, surveyRecords);
  const ctx = wellContext(wellEff);
  const washout = currentWashout(records.filter((r) => r.kind === 'decision'));
  const lag = lagNow({ well: wellEff, rigConfig, bitDepths, pumpEvents, events, nowUtcMs: nowMs, washout });
  const board = sampleBoard({ samples, stages, well: wellEff, rigConfig, bitDepths, pumpEvents, events, nowUtcMs: nowMs, washout });
  const bit = bitDepths[bitDepths.length - 1] || null;
  const lastPump = pumpEvents[pumpEvents.length - 1] || null;
  const tb = Number.isFinite(ctx.kbElevM) ? formationBoard({ tops, prognosis: currentPrognosis(prognoses), bitMdM: bit ? bit.md_calc_m : null, ctx }) : { rows: [], conflicts: [], next: null };
  const awaitingFinal = tb.rows.filter((r) => r.call && !['final', 'withdrawn'].includes(r.call.status)).map((r) => ({ name: r.name, status: r.call.status, mdM: r.call.md_calc_m }));
  // the latest version of each report (kind and day) with no sign-off on it
  const latest = new Map();
  for (const r of reports) { const k = `${r.kind}:${r.period_start}`; const cur = latest.get(k); if (!cur || (r.version_no || 1) > (cur.version_no || 1)) latest.set(k, r); }
  const signed = new Set(signoffs.map((s) => s.report_id));
  const unsigned = [...latest.values()].filter((r) => !signed.has(r.id)).map((r) => ({ id: r.id, kind: r.kind, date: r.report_date, version: r.version_no || 1 }));
  const caught = stages.filter((s) => s.stage === 'caught').sort((a, b) => Date.parse(b.at_utc) - Date.parse(a.at_utc))[0] || null;
  const lastSample = caught ? samples.find((s) => s.id === caught.sample_id) || null : null;
  const stamps = [...records.map((r) => r.occurred_at), ...tops.map((t) => t.occurred_at), ...stages.map((s) => s.at_utc)].filter(Boolean).map((t) => Date.parse(t)).filter(Number.isFinite);
  const openEvent = events.filter((e) => e.duration && e.endUtcMs == null).slice(-1)[0] || null;
  return {
    wellId: well.id, name: well.name, field: (well.header && well.header.field) || null, rig: (well.header && well.header.rig) || null,
    bitMdM: bit ? bit.md_calc_m : null, bitAtUtc: bit ? bit.occurred_at : null,
    laggedMdM: lag.available && Number.isFinite(lag.laggedMdM) ? lag.laggedMdM : null, lagNote: lag.available ? lag.note : lag.note,
    lagStrokes: lag.available ? lag.lagStrokes : null,
    spm: lastPump ? Number(lastPump.payload.spm) || 0 : null,
    rop: ropNow(bitDepths, events),
    operation: openEvent ? openEvent.label : null,
    lastSample: lastSample ? { no: lastSample.sample_no, mdM: lastSample.md_calc_m, atUtc: caught.at_utc } : null,
    overdueSamples: board.overdue.length,
    awaitingFinal, conflicts: tb.conflicts.length, nextTop: tb.next ? tb.next.name : null,
    unsignedReports: unsigned,
    survey: activeSurvey(well, surveyRecords).label,
    lastActivityUtc: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
    awaiting: awaitingFinal.length + tb.conflicts.length + unsigned.length + board.overdue.length,
  };
}

/** What awaits someone on a well, as short sentences (empty when nothing does). */
export function awaitingText(row) {
  const out = [];
  if (row.awaitingFinal.length) out.push(`${row.awaitingFinal.length} call(s) not yet final (${row.awaitingFinal.map((t) => `${t.name}, ${t.status}`).join('; ')})`);
  if (row.conflicts) out.push(`${row.conflicts} conflict(s) to resolve`);
  if (row.unsignedReports.length) out.push(`${row.unsignedReports.length} report(s) with no sign-off (${row.unsignedReports.map((r) => `${r.kind} ${r.date}`).join('; ')})`);
  if (row.overdueSamples) out.push(`${row.overdueSamples} sample(s) overdue for review`);
  return out;
}

/** How fresh the office's copy of a well is, from the follow record (never claimed without the event). */
export function followText(follow, online) {
  if (!follow || !follow.atUtc) return online ? 'not followed yet on this device' : 'not followed yet; no connection';
  if (follow.error) return `last try failed (${follow.error}); showing what this device held`;
  return follow.received > 0 ? `${follow.received} new row(s)` : 'up to date';
}

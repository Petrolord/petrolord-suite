// Lag and sample scheduling glue (WS3): turns the well's records into the
// engine inputs (lag context from the rig configuration, bit history and
// pump log from observations), schedules samples from the authorised
// programme, and builds the sample board the screens show. Pure; the
// backend writes the rows.

import { displacementFromField } from '@/lib/wellsite/pumps';
import { lagReadout, laggedDepthNow } from '@/lib/wellsite/lag';
import { scheduledDepths, validateProgramme, applyProgrammeChange, highestStage, dueState, canAdvance, statusConfig, expectedArrivals as engineArrivals, SAMPLE_STAGES, DEFAULT_MANDATORY } from '@/lib/wellsite/sampleProgram';
import { chainHeads } from '@/lib/wellsite/records';

export { SAMPLE_STAGES, DEFAULT_MANDATORY, validateProgramme, canAdvance, statusConfig, highestStage };
export const PROGRAMME_SUBTYPE = 'sample_programme';
export const LOOKAHEAD_SAMPLES = 3;

/** The engine lag context from the well and its latest rig configuration (null when it cannot be built). */
export function lagContextOf(well, rigConfig) {
  if (!rigConfig || !rigConfig.pump || !rigConfig.drillpipe || !(rigConfig.hole_sections || []).length) return null;
  let m3PerStroke;
  try { m3PerStroke = displacementFromField(rigConfig.pump).m3PerStroke; } catch { return null; }
  const survey = well && well.survey && Array.isArray(well.survey.stations) && well.survey.stations.length >= 2 ? well.survey.stations : null;
  return { geometry: rigConfig.hole_sections, bha: rigConfig.bha || [], drillpipe: rigConfig.drillpipe, stations: survey, m3PerStroke };
}

export const bitHistoryOf = (bitDepths) => bitDepths.map((r) => ({ utcMs: Date.parse(r.occurred_at), mdM: r.md_calc_m })).sort((a, b) => a.utcMs - b.utcMs);
export const pumpLogOf = (pumpEvents) => pumpEvents.map((r) => ({ utcMs: Date.parse(r.occurred_at), spm: Number(r.payload && r.payload.spm) || 0 })).sort((a, b) => a.utcMs - b.utcMs);

/** The status-bar lag readout, or a reason it is unavailable. */
export function lagNow({ well, rigConfig, bitDepths, pumpEvents, nowUtcMs }) {
  const lagCtx = lagContextOf(well, rigConfig);
  if (!lagCtx) return { available: false, note: 'Record the rig geometry and pump in Config to see the lag.' };
  const history = bitHistoryOf(bitDepths);
  if (!history.length) return { available: false, note: 'Record a bit depth to see the lag.' };
  const r = lagReadout({ nowUtcMs, bitMdM: history[history.length - 1].mdM, bitDepthHistory: history, pumpLog: pumpLogOf(pumpEvents), lagCtx });
  return { available: true, ...r, lagCtx };
}

/** The current programme from its decision records (head of the chain), or null. */
export function currentProgramme(programmeRecords) {
  const heads = chainHeads(programmeRecords.filter((r) => r.kind === 'decision' && r.subtype === PROGRAMME_SUBTYPE));
  if (!heads.length) return null;
  const h = heads.sort((a, b) => (b.payload.version || 0) - (a.payload.version || 0))[0];
  return { id: h.id, record: h, ...h.payload };
}

/** The decision payload for a programme change. */
export function programmeChange(prev, rows, { authorisedBy, atUtc, reason }) {
  const next = applyProgrammeChange(prev ? { version: prev.version, rows: prev.rows } : null, rows, { authorisedBy, atUtc, reason });
  return {
    kind: 'decision', subtype: PROGRAMME_SUBTYPE,
    payload: { ...next, basis: reason || 'Sampling programme', statement: `Sampling programme version ${next.version}`, person: authorisedBy, communication: null },
  };
}

/** Sample rows still to create so the schedule reaches `toMdM` (depths already present are kept). */
export function samplesToSchedule(programme, existing, { toMdM }) {
  if (!programme || !programme.rows || !programme.rows.length) return [];
  const have = new Set(existing.map((s) => Math.round(s.md_calc_m * 1000)));
  const maxNo = existing.reduce((m, s) => Math.max(m, s.sample_no || 0), 0);
  const out = [];
  let no = maxNo;
  for (const d of scheduledDepths(programme, { fromMdM: 0, toMdM })) {
    if (have.has(Math.round(d.mdM * 1000))) continue;
    no += 1;
    out.push({ sample_no: no, mdM: d.mdM, programmeVersion: d.programmeVersion, intervalM: programme.rows[d.rowIndex].intervalM });
  }
  return out;
}

/** How far ahead of the bit to schedule: the next LOOKAHEAD_SAMPLES depths. */
export function scheduleHorizonM(programme, bitMdM) {
  if (!programme || !programme.rows || !programme.rows.length) return bitMdM;
  const last = programme.rows[programme.rows.length - 1];
  const interval = last.intervalM || 3;
  return bitMdM + LOOKAHEAD_SAMPLES * interval;
}

/**
 * The sample board rows.
 * @param {Object} p { samples, stages, well, rigConfig, bitDepths, pumpEvents, nowUtcMs }
 */
export function sampleBoard({ samples, stages, well, rigConfig, bitDepths, pumpEvents, nowUtcMs }) {
  const tolerance = (well.settings && well.settings.overdue_tolerance_min) ?? 15;
  const cfg = statusConfig({ mandatory: (well.settings && well.settings.mandatory_sample_stages) || DEFAULT_MANDATORY });
  const stagesBySample = new Map();
  for (const st of stages) { if (!stagesBySample.has(st.sample_id)) stagesBySample.set(st.sample_id, []); stagesBySample.get(st.sample_id).push(st); }
  const history = bitHistoryOf(bitDepths);
  const bitMdM = history.length ? history[history.length - 1].mdM : null;
  const lagCtx = lagContextOf(well, rigConfig);
  const pumpLog = pumpLogOf(pumpEvents);
  const engineSamples = samples.map((s) => ({ id: s.id, mdM: s.md_calc_m, stages: stagesBySample.get(s.id) || [] }));
  let arrivals = new Map();
  let lagged = null;
  if (lagCtx && history.length) {
    for (const a of engineArrivals(engineSamples, { bitDepthHistory: history, pumpLog, lagCtx, nowUtcMs })) arrivals.set(a.sampleId, a);
    lagged = laggedDepthNow({ nowUtcMs, bitDepthHistory: history, pumpLog, lagCtx });
  }
  const rows = samples.map((s) => {
    const st = stagesBySample.get(s.id) || [];
    const a = arrivals.get(s.id) || null;
    const due = dueState({ mdM: s.md_calc_m }, { bitMdM: bitMdM ?? -Infinity, nowUtcMs, arrivalUtcMs: a ? a.arrivalUtcMs : null, toleranceMin: tolerance, stages: st });
    const status = highestStage(st);
    // scheduled and due are states the board derives, not stages a person records
    const next = SAMPLE_STAGES.filter((x) => x !== 'scheduled' && x !== 'due' && SAMPLE_STAGES.indexOf(x) > SAMPLE_STAGES.indexOf(status) && canAdvance(st, x, cfg).ok);
    return { sample: s, stages: st, status, state: due.state, minutesPastArrival: due.minutesPastArrival, arrival: a, nextStages: next, cfg };
  }).sort((x, y) => x.sample.md_calc_m - y.sample.md_calc_m);
  const inTransit = rows.filter((r) => r.state === 'in_transit' || r.state === 'due' || r.state === 'overdue');
  const nextDue = rows.find((r) => r.state === 'in_transit' || r.state === 'due') || null;
  const nextScheduled = rows.find((r) => r.state === 'scheduled') || null;
  return { rows, inTransit, nextDue, nextScheduled, overdue: rows.filter((r) => r.state === 'overdue'), lagged, bitMdM, cfg, tolerance };
}

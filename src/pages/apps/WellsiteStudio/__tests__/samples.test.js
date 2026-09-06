// WS3 service layer against the engine goldens: the seeded rig
// configuration yields the reference lag, a rate change moves an
// arrival (G2), a shutdown makes the lag time undefined (G3), the board
// states never say missed, and scheduling fills only the gaps.
import g from '../../../../../packages/engines/test-data/wellsite/lag-goldens.json';
import { lagContextOf, lagNow, sampleBoard, samplesToSchedule, programmeChange, currentProgramme, scheduleHorizonM, bitHistoryOf, pumpLogOf } from '../services/samples';
import { SEED_RIG_CONFIG } from '../services/seed';
import { arrivalPrediction } from '@/lib/wellsite/lag';

const FT = 0.3048;
const MIN = 60000;
const T0 = Date.parse('2026-09-07T06:00:00Z');
const iso = (min) => new Date(T0 + min * MIN).toISOString();
const well = { survey: null, settings: { overdue_tolerance_min: 15, mandatory_sample_stages: ['caught', 'described', 'bagged'] } };
// the reference well of the goldens: open hole, no BHA, no casing
const refConfig = { ...SEED_RIG_CONFIG, hole_sections: [{ from_md_m: 0, to_md_m: 4000, cased: false, hole_id_m: 12.25 * 0.0254 }], bha: [] };
const bit = (min, ft) => ({ occurred_at: iso(min), md_calc_m: ft * FT });
const pump = (min, spm) => ({ occurred_at: iso(min), payload: { spm } });

test('the rig configuration builds the lag context with the golden displacement and lag strokes', () => {
  const ctx = lagContextOf(well, refConfig);
  expect(ctx.m3PerStroke).toBeCloseTo(g.m3PerStroke, 9);
  expect(lagContextOf(well, null)).toBeNull();
  const r = lagNow({ well, rigConfig: refConfig, bitDepths: [bit(-600, 9500), bit(0, 10000)], pumpEvents: [pump(-600, 60)], nowUtcMs: T0 });
  expect(r.available).toBe(true);
  expect(r.lagStrokes).toBeCloseTo(g.lagStrokes_10000ft, 3);
  expect(r.lagTimeMin).toBeCloseTo(g.G1.lagTimeMin, 3);
  expect(lagNow({ well, rigConfig: null, bitDepths: [], pumpEvents: [], nowUtcMs: T0 }).note).toMatch(/Config/);
});

test('G2 and G3 through the arrival prediction the board uses', () => {
  const ctx = lagContextOf(well, refConfig);
  const g2 = arrivalPrediction({ cutUtcMs: T0, cutMdM: 10000 * FT, lagCtx: ctx, pumpLog: pumpLogOf([pump(0, 60), pump(60, 40)]), nowUtcMs: T0 + 90 * MIN });
  expect((g2.arrivalUtcMs - T0) / MIN).toBeCloseTo(g.G2.arrivalMin, 4);
  const g3 = arrivalPrediction({ cutUtcMs: T0, cutMdM: 10000 * FT, lagCtx: ctx, pumpLog: pumpLogOf([pump(0, 60), pump(30, 0)]), nowUtcMs: T0 + 35 * MIN });
  expect(g3.lagTimeAtCurrentSpmMin).toBeNull();
  expect(g3.strokesRemaining).toBeCloseTo(g.G3.strokesRemainingAt35, 3);
});

test('programme decisions chain; scheduling fills gaps ahead of the bit', () => {
  const p1 = programmeChange(null, [{ fromMdM: 0, toMdM: null, intervalM: 10 * FT }], { authorisedBy: 'Ops', atUtc: iso(0), reason: 'Programme' });
  expect(p1.payload.version).toBe(1);
  expect(p1.payload.statement).toBe('Sampling programme version 1');
  const rec1 = { id: 'r1', kind: 'decision', subtype: 'sample_programme', chain_id: 'r1', payload: p1.payload };
  const cur = currentProgramme([rec1]);
  expect(cur.version).toBe(1);
  expect(() => programmeChange(cur, cur.rows, { authorisedBy: '', atUtc: iso(1) })).toThrow(/authorised/);
  const p2 = programmeChange(cur, [{ fromMdM: 0, toMdM: null, intervalM: 5 * FT }], { authorisedBy: 'Ops', atUtc: iso(1), reason: 'Closer to target' });
  expect(p2.payload.version).toBe(2);
  const horizon = scheduleHorizonM(cur, 10000 * FT);
  expect(horizon / FT).toBeCloseTo(10030, 6);
  const existing = [{ sample_no: 1, md_calc_m: 9990 * FT }, { sample_no: 2, md_calc_m: 10000 * FT }];
  const todo = samplesToSchedule(cur, existing, { toMdM: horizon });
  expect(todo.map((s) => Math.round(s.mdM / FT))).toEqual(expect.arrayContaining([10010, 10020, 10030]));
  expect(todo.every((s) => Math.round(s.mdM / FT) !== 10000)).toBe(true);
  expect(todo[todo.length - 1].sample_no).toBe(existing.length + todo.length);
});

test('the sample board: in transit, due, overdue after tolerance, caught; next stages honour the mandatory list; no "missed"', () => {
  const samples = [
    { id: 's1', sample_no: 1, md_calc_m: 9900 * FT }, { id: 's2', sample_no: 2, md_calc_m: 9950 * FT },
    { id: 's3', sample_no: 3, md_calc_m: 10000 * FT }, { id: 's4', sample_no: 4, md_calc_m: 10010 * FT },
  ];
  const stages = [{ sample_id: 's1', stage: 'caught' }];
  const bitDepths = [bit(-600, 9800), bit(-300, 9900), bit(-150, 9950), bit(0, 10000)];
  const pumpEvents = [pump(-600, 60)];
  const now = T0 + 20 * MIN;
  const b = sampleBoard({ samples, stages, well, rigConfig: refConfig, bitDepths, pumpEvents, nowUtcMs: now });
  const byId = Object.fromEntries(b.rows.map((r) => [r.sample.id, r]));
  expect(byId.s1.state).toBe('caught');
  expect(byId.s1.nextStages).toEqual(['washed', 'dried', 'described']);
  expect(byId.s4.nextStages).toEqual(['caught']);
  expect(byId.s4.state).toBe('scheduled');
  // s2 cut at -150 min: lag at 9950 ft is 197.97 min, arrival at +47.97, so still in transit at +20
  expect(byId.s2.state).toBe('in_transit');
  expect(byId.s3.state).toBe('in_transit');
  const later = sampleBoard({ samples, stages, well, rigConfig: refConfig, bitDepths, pumpEvents, nowUtcMs: T0 + 55 * MIN });
  expect(later.rows.find((r) => r.sample.id === 's2').state).toBe('due');
  const much = sampleBoard({ samples, stages, well, rigConfig: refConfig, bitDepths, pumpEvents, nowUtcMs: T0 + 70 * MIN });
  const s2 = much.rows.find((r) => r.sample.id === 's2');
  expect(s2.state).toBe('overdue');
  expect(s2.minutesPastArrival).toBeGreaterThan(15);
  expect(much.overdue.map((r) => r.sample.id)).toEqual(['s2']);
  expect(JSON.stringify(much.rows.map((r) => r.state))).not.toMatch(/missed/);
  expect(b.nextScheduled.sample.id).toBe('s4');
  expect(bitHistoryOf(bitDepths)).toHaveLength(4);
});

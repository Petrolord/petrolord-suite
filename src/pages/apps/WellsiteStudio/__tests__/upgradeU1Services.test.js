// Wellsite Studio upgrade U1 (2026-10-01): the pure doors behind the Step 1
// fixes, each on a case where the old behaviour was wrong. The lag volumes
// are checked against the shipped lag engine (lagNow), never restated.
import { parseFieldNumber } from '../services/units';
import { kbStatus, defaultDepthEntry, wellContext } from '../services/wellContext';
import { ropNow, lagVolumes, lagNow } from '../services/samples';
import { prognosisDifference } from '../services/tops';
import { publishPlan, finalTopsToPublish } from '../services/publish';
import { reviewerLines } from '../services/reportText';
import { sectionsFromPrognosis } from '../components/ConfigView';
import { syncHeadline } from '@/lib/wellsite/sync/syncStore';
import { SEED_RIG_CONFIG, SEED_REGISTRY_WELLS } from '../services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const FT = 0.3048;
const well = { id: 'w1', name: 'KETA-2', header: { kb_elev_m: 25, gl_elev_m: 4, rt_offset_m: 0 }, survey: { version: 'registry-1', stations: SEED_REGISTRY_WELLS[0].deviation }, settings: {} };
const iso = (min) => new Date(Date.parse('2026-09-07T10:00:00Z') + min * 60000).toISOString();
const bit = (min, ft) => ({ id: `b${min}`, occurred_at: iso(min), md_calc_m: ft * FT });

describe('WS-U1-008 fractions and comma decimals in inch fields', () => {
  test.each([
    ['12 1/4', 12.25], ['12-1/4', 12.25], ['8 1/2"', 8.5], ['17½', 17.5], ['12¼ in', 12.25], ['3/4', 0.75], ['12,25', 12.25], ['4.276', 4.276], ['9', 9],
  ])('%s reads as %d', (t, v) => expect(parseFieldNumber(t)).toBeCloseTo(v, 9));
  test('unreadable text stays NaN (the save refuses it with its reason)', () => {
    for (const t of ['', 'abc', '12 1/0', '1,2,3']) expect(parseFieldNumber(t)).toBeNaN();
    // negative control: Number() refused the sizes rigs use
    expect(Number('12 1/4')).toBeNaN();
  });
});

describe('WS-U1-010 and WS-U1-012 the well context', () => {
  test('a registry KB of 0 or none is said, a real KB is not', () => {
    expect(kbStatus(25).ok).toBe(true);
    expect(kbStatus(0)).toMatchObject({ ok: false });
    expect(kbStatus(0).note).toMatch(/TVDSS then equals TVD/);
    expect(kbStatus(NaN).ok).toBe(false);
  });
  test('a well without a default entry starts in the display unit; a well default still wins', () => {
    expect(defaultDepthEntry({ settings: {} }, 'm')).toEqual({ unit: 'm', reference: 'MD', datum: 'RT' });
    expect(defaultDepthEntry({ settings: { default_depth: { unit: 'ft' } } }, 'm').unit).toBe('ft');
    expect(defaultDepthEntry(null).unit).toBe('ft');
  });
});

describe('WS-U1-002 the sharing pill claims nothing before a pass', () => {
  test('never synced: not shared yet; after a pass: shared', () => {
    const base = { online: true, phase: 'idle', pending: 0, failed: 0, rejected: 0, conflicts: 0 };
    expect(syncHeadline({ ...base, lastSyncUtc: null })).toMatchObject({ state: 'local', text: 'not shared yet' });
    expect(syncHeadline({ ...base, lastSyncUtc: null, lastError: 'JWT expired' })).toMatchObject({ state: 'local', text: 'not shared yet, last try failed', tone: 'amber' });
    expect(syncHeadline({ ...base, lastSyncUtc: '2026-10-01T10:00:00Z' })).toMatchObject({ state: 'synchronised', text: 'shared' });
  });
});

describe('WS-U1-011 ROP from the bit depth log', () => {
  test('100 ft in 2 h is 50 ft/hr; a connection held on the timeline is not drilling time', () => {
    const bits = [bit(0, 9800), bit(120, 9900), bit(240, 10000)];
    expect(ropNow(bits).mPerHr / FT).toBeCloseTo(50, 9);
    // a 60 min connection inside the last interval: 100 ft in 60 min of drilling
    const events = [{ type: 'connection', startUtcMs: Date.parse(iso(150)), endUtcMs: Date.parse(iso(210)) }];
    expect(ropNow(bits, events).mPerHr / FT).toBeCloseTo(100, 6);
    expect(ropNow([bit(0, 9800)]).mPerHr).toBeNull();
  });
});

describe('WS-U1-007 lag volumes are the engine lag strokes times the pump output', () => {
  const pumpEvents = [{ occurred_at: iso(-60), payload: { spm: 60 } }];
  const lag = lagNow({ well, rigConfig: SEED_RIG_CONFIG, bitDepths: [bit(-60, 9900), bit(0, 10000)], pumpEvents, nowUtcMs: Date.parse(iso(0)) });
  test('annulus = lag strokes x displacement (identity, land rig), in bbl and m3', () => {
    expect(lag.available).toBe(true);
    const bbl = lagVolumes(lag, 'bbl');
    const m3 = lagVolumes(lag, 'm3');
    expect(bbl.annulus * 0.158987294928).toBeCloseTo(m3.annulus, 9);
    expect(m3.annulus).toBeCloseTo(lag.lagStrokes * lag.lagCtx.m3PerStroke, 9);
    // 6 x 12 in triplex at 97 percent: the field rule 0.000243 x D^2 x L x eff = 0.1018 bbl/stk
    expect(bbl.perStroke / (0.000243 * 36 * 12 * 0.97)).toBeCloseTo(1, 3);
    expect(bbl.flowPerMin).toBeCloseTo(60 * bbl.perStroke, 9);
    expect(bbl.flowAlt.unit).toBe('gpm');
    expect(m3.flowAlt.unit).toBe('L/min');
    expect(bbl.riser).toBeNull();
  });
});

describe('WS-U1-006 a call against its prognosis, subsea', () => {
  const ctx = wellContext(well);
  const row = (callMd) => ({ prognosis: { md_m: 3100 }, call: callMd == null ? null : { md_calc_m: callMd } });
  test('on prognosis, shallower is high, deeper is low; the difference is vertical on a 30 degree hole', () => {
    expect(prognosisDifference(row(3100), ctx).word).toBe('on prognosis');
    const hi = prognosisDifference(row(3090), ctx);
    expect(hi.word).toBe('high');
    // 10 m MD at 30 degrees is 8.66 m TVD (negative control: an MD difference would say 10)
    expect(Math.abs(hi.diffM)).toBeCloseTo(10 * Math.cos(Math.PI / 6), 6);
    expect(prognosisDifference(row(3110), ctx).word).toBe('low');
    expect(prognosisDifference(row(null), ctx).word).toBeNull();
  });
});

describe('WS-U1-013 a publish names formations that already had a top from another source', () => {
  const finalCall = { id: 'c1', role: 'official', status: 'final', name: 'Top Agbada', md_calc_m: 3099, chain_id: 'c1', previous_version_id: null };
  test('the hand-typed prognosis top stays, and the plan says the registry now holds two', () => {
    const existingTops = [{ id: 'r1', name: 'Top Agbada', notes: null }, { id: 'r2', name: 'Top Akata', notes: null }];
    const plan = publishPlan({ tops: [finalCall], records: [], profile: null, existingTops, existingIntervals: [] });
    expect(finalTopsToPublish([finalCall])).toHaveLength(1);
    expect(plan.sameNameOther).toEqual(['Top Agbada']);
    expect(plan.untouchedTops).toBe(2);
    // its own earlier row is replaced, not counted as another source
    const own = [{ id: 'r3', name: 'Top Agbada', notes: 'Wellsite Studio ws-1.0.0 | top 11111111-1111-4111-8111-111111111111 v1' }];
    expect(publishPlan({ tops: [finalCall], records: [], profile: null, existingTops: own, existingIntervals: [] }).sameNameOther).toEqual([]);
  });
});

describe('WS-U1-014 the reviewer lines', () => {
  test('well, operator, depth reference, KB in the display unit, preparer and build; Latin-1 only', () => {
    const lines = reviewerLines({ well: { name: 'KETA-2', field: 'Keta', operator: 'Petrolord E&P', rig: 'Rig 12' } }, { unit: 'ft', kbElevM: 25, preparedBy: 'A. Geologist', build: 'Petrolord Suite 4.0.0 (abc), Wellsite Studio' });
    expect(lines.join(' ')).toMatch(/Well KETA-2; field Keta; operator Petrolord E&P; rig Rig 12/);
    expect(lines.join(' ')).toMatch(/measured depth \(MD\) below KB unless marked TVD; KB 82\.0 ft above MSL/);
    expect(lines.join(' ')).toMatch(/Prepared by A\. Geologist; Petrolord Suite 4\.0\.0/);
    expect(lines.join('')).not.toMatch(/[^\x20-\xff]/);
  });
});

describe('WS-U1-005 hole sections from Well Design', () => {
  const wd = [
    { from_md_m: 0, to_md_m: 914.4, cased: true, casing_id_m: 12.347 * 0.0254, hole_id_m: 17.5 * 0.0254 },
    { from_md_m: 914.4, to_md_m: 3200, cased: false, hole_id_m: 12.25 * 0.0254 },
    { from_md_m: 3200, to_md_m: 3100, cased: false, hole_id_m: 0.2 },
  ];
  test('valid sections carry over; on a floater they start at the BOP', () => {
    const land = sectionsFromPrognosis(wd);
    expect(land).toHaveLength(2);
    expect(land[0]).toMatchObject({ from_md_m: 0, to_md_m: 914.4, cased: true });
    const floater = sectionsFromPrognosis(wd, { bopM: 1000 });
    expect(floater).toHaveLength(1);
    expect(floater[0]).toMatchObject({ from_md_m: 1000, to_md_m: 3200, cased: false });
  });
});

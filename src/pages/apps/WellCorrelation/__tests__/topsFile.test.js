/**
 * AppUpgrade WC-U2-004 (PL2, PL3): tops files into and out of Well
 * Correlation. The hostile tops set (e2e/fixtures/wc/hostile) goes through
 * planTopsFile, which converts TVD, TVDSS and Z through each well's survey
 * and KB and then runs the Suite's tops door rules (WDM planTopsPaste).
 * Negative control: on origin/main there is no import in the app, and the
 * door refuses every non-MD column (WC-U1-016), so these files could not be
 * brought in at all.
 */
import fs from 'fs';
import path from 'path';
import { planTopsFile, detectTopsColumns, topsCsv } from '../services/topsFile';
import { sheetRows } from '@/pages/apps/WellDataManager/engine/topsSheet';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'wc', 'hostile');
const read = (f) => fs.readFileSync(path.join(HOSTILE, f), 'utf8');
const hostile = JSON.parse(read('wells.json'));
const FT = 0.3048;
// a deviated well with a KB (KETA-2 of the sample section is 0 to 30 deg below
// 1,400 m; KB 25 m here) and one that climbs past horizontal (uphill)
const deviated = { id: 'dv-1', name: 'DEV 1', uwi: 'DV-0001', is_own: true, kb_m: 25, deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }], tops: [] };
const uphill = { id: 'up-1', name: 'UP 1', is_own: true, kb_m: 20, deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 1300, inc: 90, azi: 0 }, { md: 1600, inc: 120, azi: 0 }], tops: [] };
const shared = { id: 'sh-1', name: 'SHARED 1', is_own: false, kb_m: 20, deviation: null, tops: [] };
const WELLS = [...hostile, deviated, uphill, shared];

const plan = (text, extra = {}) => planTopsFile(text, { wells: WELLS, rows: sheetRows(WELLS, WELLS.flatMap((w) => (w.tops || []).map((t) => ({ ...t, well_id: w.id })))), ...extra });
const create = (p, well, name) => p.creates.find((c) => c.wellName === well && c.name === name);

test('a Petrel export with MD, TWT and Z uses the MD column and reads feet from its header', () => {
  const cols = detectTopsColumns(['Well', 'Surface', 'MD (ft)', 'TWT (ms)', 'Z (ft)', 'Interpreter']);
  expect(cols).toMatchObject({ depth: 2, ref: 'md', unit: 'ft' });
  const p = plan(read('tops_petrel_wells_ft.txt'));
  expect(p.error).toBeUndefined();
  expect(create(p, 'OKAN PX-4', 'Sand D').mdM).toBeCloseTo(6528.9 * FT, 6);
});

test('a TVDSS-only file lands at MD through the KB of a well with no survey, and says it assumed vertical', () => {
  const p = plan(read('tops_tvdss_only.csv'));
  expect(p.ref).toBe('tvdss');
  expect(p.refFromHeader).toBe(true);
  expect(create(p, 'OKAN PX-4', 'Sand F').mdM).toBeCloseTo(1990 + 25, 9); // KB 25 m
  expect(create(p, 'IDU 9', 'Sand F').mdM).toBeCloseTo(1995 + 28, 9);
  expect(p.notes.join(' ')).toMatch(/OKAN PX-4, IDU 9: no survey: drawn vertical, MD = TVD/);
});

test('TVDSS and TVD on a deviated well go through its survey (the frame round trip)', () => {
  const f = makeDepthFrame({ deviation: deviated.deviation, kbM: 25 });
  const at = f.mdToTvdss(1650);
  const p1 = plan(`Well,Top,TVDSS (m)\nDEV 1,Sand M,${at.tvdss}\n`);
  expect(create(p1, 'DEV 1', 'Sand M').mdM).toBeCloseTo(1650, 4);
  const p2 = plan(`Well,Top,TVD (ft)\nDEV 1,Sand M,${at.tvd / FT}\n`);
  expect(create(p2, 'DEV 1', 'Sand M').mdM).toBeCloseTo(1650, 4);
  expect(1650 - at.tvd).toBeGreaterThan(5); // the case where reading TVD as MD is wrong
});

test('an elevation (Z, negative down) file converts through the KB', () => {
  const p = plan(read('tops_elevation_z.csv'));
  expect(p.ref).toBe('z');
  expect(create(p, 'OKAN PX-4', 'Sand H').mdM).toBeCloseTo(1975 + 25, 9);
});

test('a time-only file is refused with the reason', () => {
  const p = plan(read('tops_twt_only.csv'));
  expect(p.error).toMatch(/is a time.*velocity model/);
});

test('semicolons and comma decimals are read', () => {
  const p = plan(read('tops_semicolon_comma.csv'));
  expect(create(p, 'OKAN PX-4', 'Sand J').mdM).toBeCloseTo(1990.5 + 25, 9);
  expect(create(p, 'IDU 9', 'Sand J').mdM).toBeCloseTo(1996.25 + 28, 9);
});

test('every row not applied is named with its line and reason; a no-KB well is noted', () => {
  const p = plan(read('tops_tvdss_problems.csv'));
  const reasons = p.problems.map((q) => `${q.line}: ${q.reason}`).join(' | ');
  expect(reasons).toMatch(/2: no well named or with UWI "NO SUCH WELL"/);
  expect(reasons).toMatch(/3: the top has no name/);
  expect(reasons).toMatch(/4: TVDSS "abc" is not a number/);
  expect(reasons).toMatch(/5: OKAN PX-4, Sand L: -40 m TVDSS \(below sea level\) is above the depth reference/);
  expect(create(p, 'IDU 7', 'Sand L')).toBeTruthy();
  expect(p.notes.join(' ')).toMatch(/IDU 7: no KB: TVDSS read as TVD/);
});

test('a depth reached twice on a climbing well is refused; shared wells stay read-only; case twins are named', () => {
  const f = makeDepthFrame({ deviation: uphill.deviation, kbM: 20 });
  const tv = f.mdToTvdss(1500).tvdss; // the well climbs back through this depth
  const p = plan(`Well,Top,TVDSS (m)\nUP 1,Sand N,${tv}\nSHARED 1,Sand N,1500\n`);
  const reasons = p.problems.map((q) => q.reason).join(' | ');
  expect(reasons).toMatch(/UP 1, Sand N: that depth is reached twice along the well/);
  expect(reasons).toMatch(/SHARED 1 is shared with you read-only/);
  const d = plan(read('tops_duplicates.csv'));
  expect(d.problems.map((q) => q.reason).join(' ')).toMatch(/SAND G in IDU 9 also appears on line 1/);
});

test('the user overrides the reference and unit when the header states none (Petra DEPTH)', () => {
  const p0 = plan(read('tops_petra_export.txt'));
  expect(p0.refFromHeader).toBe(false);
  expect(p0.unitFromHeader).toBe(false);
  const p = plan(read('tops_petra_export.txt'), { unit: 'ft', ref: 'md' });
  expect(create(p, 'OKAN PX-4', 'Sand E').mdM).toBeCloseTo(6594.5 * FT, 6);
});

test('export: MD, TVD, TVDSS in feet and TWT from checkshots; re-importing it changes nothing', async () => {
  const b = makeInMemoryBackend({ sample: false, seedWells: [{ ...deviated, checkshots: [{ tvdss_m: 1000, twt_ms: 900 }, { tvdss_m: 2000, twt_ms: 1700 }], tops: [{ id: 't1', well_id: 'dv-1', name: 'Sand M', md_m: 1650, surface_type: 'mfs', interpreter: 'ama', confidence: 'high' }] }] });
  const [w] = await b.listWells();
  const tops = await b.listTops(w.id);
  const frame = makeDepthFrame({ deviation: w.deviation, kbM: w.kb_m });
  const { text, count } = topsCsv([{ ...w, tops, frame }], { unit: 'ft', now: new Date('2026-09-29T00:00:00Z'), build: 'test' });
  expect(count).toBe(1);
  const lines = text.trim().split('\n');
  expect(lines[0]).toMatch(/^# Petrolord Suite Well Correlation tops/);
  expect(lines[1]).toMatch(/Depths in ft.*TVDSS below mean sea level/);
  expect(lines[4]).toBe('Well,UWI,Top,Surface type,MD (ft),TVD (ft),TVDSS (ft),TWT (ms),Interpreter,Confidence,Notes');
  const cells = lines[5].split(',');
  const at = frame.mdToTvdss(1650);
  expect(cells.slice(0, 4)).toEqual(['DEV 1', 'DV-0001', 'Sand M', 'mfs']);
  expect(Number(cells[4])).toBeCloseTo(1650 / FT, 2);
  expect(Number(cells[5])).toBeCloseTo(at.tvd / FT, 2);
  expect(Number(cells[6])).toBeCloseTo(at.tvdss / FT, 2);
  expect(Number(cells[7])).toBeCloseTo(900 + ((at.tvdss - 1000) / 1000) * 800, 1);
  expect(cells.slice(8, 10)).toEqual(['ama', 'high']);
  const again = planTopsFile(text, { wells: [w], rows: sheetRows([w], tops) });
  expect(again).toMatchObject({ ref: 'md', unit: 'ft', creates: [], updates: [], problems: [] });
  expect(again.unchanged).toBe(1);
});

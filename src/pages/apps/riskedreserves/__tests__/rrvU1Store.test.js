/**
 * Risked Reserves Valuation upgrade U1: the store. Saved state (RL12, PL5),
 * the handoff from ReservoirCalc Pro (RL11), what an edit and a change
 * upstream look like, units (PL3), inputs a person can type (PL11) and the
 * CSV with its provenance header (RL1, RL7).
 */
import {
  fromRcpProspect, blankProspect, inputProblem, engineInput, rcpFingerprint, editedKeys, upstreamState, refreshFromRcp,
  upgradeProspect, setInput, loadStored, storeLocal, mergeSaved, toRow, fromRow, payloadOf, valuationCsv,
  RRV_KEY, RRV_STORE_KEY, DEFAULT_ECONOMICS, INPUT_KEYS, PERCENTILE_CONVENTION,
} from '../services/rrvStore';
import { rrvUnits } from '../services/rrvUnits';
import { RRV_SEED_PROSPECTS, RRV_LEGACY_PROSPECT, RRV_T1_BROWSER_LIST } from '../services/rrvFixtures';
import { valueProspect } from '@/utils/prospectValuation';

const NOW = new Date('2026-10-02T15:00:00Z');
const UUID = '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11';
const north = { id: UUID, ...RRV_SEED_PROSPECTS[0] };
const P = () => fromRcpProspect(north, { now: NOW });

beforeEach(() => localStorage.clear());

describe('PL11, PL4: a blank is never read as zero', () => {
  test('a blank Pg, MEFS or cost is named; the engine alone would have valued it as zero', () => {
    const p = blankProspect(1);
    expect(inputProblem({ ...p, pg: '' })).toMatch(/Enter Pg/);
    expect(inputProblem({ ...p, mefs: '' })).toMatch(/Enter the MEFS \(zero is allowed\)/);
    expect(inputProblem({ ...p, unitValue: null })).toMatch(/Enter the value per barrel/);
    expect(inputProblem({ ...p, wellCost: '' })).toMatch(/Enter the exploration well cost/);
    expect(inputProblem({ ...p, mefs: 0, devCost: 0 })).toBeNull();
    // negative control: this is what the T1 build did with a cleared Pg
    // (Number('') is 0): a confident EMV of minus the well cost, no warning
    expect(valueProspect({ ...p, pg: Number('') }).emv).toBe(-p.wellCost);
    // typed junk is named too
    expect(inputProblem({ ...p, pg: 'abc' })).toMatch(/Pg must be between 0 and 1/);
    expect(inputProblem({ ...p, devCost: 'x' })).toMatch(/zero or more/);
  });
  test('the engine input has exactly the keys the report must print', () => {
    expect(Object.keys(engineInput(blankProspect(1))).sort()).toEqual([...INPUT_KEYS].sort());
    expect(engineInput({ ...blankProspect(1), p50: '' }).p50).toBeUndefined();
  });
});

describe('RL11: what ReservoirCalc Pro handed over is kept with the valuation', () => {
  test('source record, time, unit, basis, percentile convention, methods and the values as received', () => {
    const p = P();
    expect(p.handoff).toMatchObject({
      schema: 'rcp-prospect-1', app: 'ReservoirCalc Pro', table: 'rcp_prospects', recordId: UUID, recordName: 'Ekene North',
      recordUpdatedAt: '2026-10-02T14:05:00.000Z', build: 'harness', receivedAt: NOW.toISOString(),
      unit: 'MMbbl', unitLabel: 'MMSTB', basis: 'recoverable', percentiles: PERCENTILE_CONVENTION, pgMethod: 'as risked in ReservoirCalc Pro',
      values: { pg: 0.32, p90: 12, p50: 30, p10: 75, mean: 38 },
    });
    expect(p.handoff.source.run).toMatchObject({ seed: 123, iterations: 10000 });
    expect(p.handoff.source.inPlace).toMatchObject({ stream: 'STOIIP', mean: 152 });
    expect(p.pgFactors).toEqual({ trap: 0.8, reservoir: 0.8, charge: 0.5, seal: 1 });
    expect(p.handoff.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });
  test('a gas row states its unit and the conversion, and keeps what was sent beside what it became', () => {
    const gas = fromRcpProspect({ id: 'g', name: 'G', pg_factors: {}, inputs: { unit: 'Bcf', basis: 'recoverable', p90: 60, p50: 120, p10: 240, mean: 150 }, risked: { pg: 0.3 } }, { now: NOW });
    expect(gas.handoff).toMatchObject({ unit: 'Bcf', unitLabel: 'Bscf', conversion: 'converted from Bcf at 6 Mscf per boe', values: { p90: 10, p50: 20, p10: 40, mean: 25 }, sent: { p90: 60, p50: 120, p10: 240, mean: 150 } });
  });
  test('the fingerprint is of what the record says: key order and stamps do not move it, re-risking does', () => {
    const a = rcpFingerprint(north);
    const reordered = { risked: north.risked, inputs: { ...north.inputs }, pg_factors: { seal: 1, charge: 0.5, reservoir: 0.8, trap: 0.8 }, name: north.name, id: 'other', visibility: 'organization', version: 9, updated_at: 'later', extra: undefined };
    expect(rcpFingerprint(reordered)).toBe(a);
    expect(rcpFingerprint({ ...north, risked: { ...north.risked, pg: 0.28 } })).not.toBe(a);
    expect(rcpFingerprint({ ...north, inputs: { ...north.inputs, p50: 34 } })).not.toBe(a);
  });
  test('an input changed here after the handoff is told apart, and changing it back clears the mark', () => {
    const p = P();
    expect(editedKeys(p)).toEqual([]);
    expect(editedKeys({ ...p, p50: 34, pg: 0.3 })).toEqual(['pg', 'p50']);
    expect(editedKeys({ ...p, mefs: 99 })).toEqual([]); // the MEFS was never handed over
    expect(editedKeys({ ...p, p50: 30 })).toEqual([]);
    expect(editedKeys(blankProspect(1))).toEqual([]);
  });
});

describe('RL11: a change upstream after the valuation (the "Re-run prospect" follow-up)', () => {
  const p = P();
  test('current, changed in place, risked again as a new record, gone, never recorded, unreadable, typed', () => {
    expect(upstreamState(p, [north]).state).toBe('current');
    const edited = { ...north, updated_at: '2026-10-03T08:00:00.000Z', risked: { ...north.risked, pg: 0.28, success: { ...north.risked.success, p50: 34 } } };
    const ch = upstreamState(p, [edited]);
    expect(ch.state).toBe('changed');
    expect(ch.changes).toEqual([{ key: 'pg', from: 0.32, to: 0.28 }, { key: 'p50', from: 30, to: 34 }]);
    const again = { ...edited, id: '99999999-9999-4999-8999-999999999999' };
    const rep = upstreamState(p, [{ ...again, name: 'Other' }, again]);
    expect(rep.state).toBe('replaced');
    expect(rep.row.id).toBe(again.id);
    expect(upstreamState(p, [{ ...again, name: 'Other' }]).state).toBe('missing');
    expect(upstreamState({ ...p, handoff: null }, [north]).state).toBe('unrecorded');
    expect(upstreamState(p, null).state).toBe('unknown');
    expect(upstreamState(blankProspect(1), [north]).state).toBe('own');
  });
  test('the newest namesake is the one a replaced prospect is offered', () => {
    const older = { ...north, id: 'a', updated_at: '2026-10-03T08:00:00.000Z' };
    const newer = { ...north, id: 'b', updated_at: '2026-10-04T08:00:00.000Z' };
    expect(upstreamState(p, [older, newer]).row.id).toBe('b');
  });
  test('refresh takes Pg, the volumes and the factors; this app\'s own inputs and a typed value per barrel stay', () => {
    const mine = { ...['mefs', 'wellCost', 'unitValue', 'p50'].reduce((q, k) => setInput(q, k, { mefs: 15, wellCost: 30, unitValue: 9.5, p50: 31 }[k]), p), ident: { company: 'Lordsway', licence: 'OML 143', play: '', analyst: 'A' }, row: { id: 'row-1', version: 3 }, dirty: false };
    const edited = { ...north, updated_at: '2026-10-03T08:00:00.000Z', pg_factors: { ...north.pg_factors, charge: 0.4 }, risked: { ...north.risked, pg: 0.256, success: { p90: 14, p50: 34, p10: 80, mean: 41 } } };
    const next = refreshFromRcp(mine, edited, { now: NOW });
    expect(next).toMatchObject({ pg: 0.256, p90: 14, p50: 34, p10: 80, mefs: 15, wellCost: 30, unitValue: 9.5, ident: mine.ident, row: mine.row });
    expect(next.pgFactors.charge).toBe(0.4);
    expect(next.handoff.fingerprint).toBe(rcpFingerprint(edited));
    expect(editedKeys(next)).toEqual([]);
    expect(next.touched).toEqual({ mefs: true, wellCost: true, unitValue: true });
    expect(upstreamState(next, [edited]).state).toBe('current');
  });
  test('refresh from a record that now carries economics takes them unless the user typed their own', () => {
    const withEcon = { ...north, inputs: { ...north.inputs, economics: { unitValue: 11.5, devCost: 240, engine: 'calculateEconomics' } } };
    // a valuation on entered values takes what the record now sends; one on the economic model keeps its model
    const asStep1 = upgradeProspect({ ...P(), econ: null, ...DEFAULT_ECONOMICS, touched: {} });
    expect(refreshFromRcp(asStep1, withEcon, { now: NOW })).toMatchObject({ unitValue: 11.5, devCost: 240, rcpUnitValue: 11.5, mefs: 10 });
    expect(refreshFromRcp(P(), withEcon, { now: NOW })).toMatchObject({ unitValue: P().unitValue, rcpUnitValue: 11.5, econ: { value: 'model' } });
    expect(refreshFromRcp(setInput(P(), 'unitValue', 9.5), withEcon, { now: NOW })).toMatchObject({ unitValue: 9.5, devCost: 240 });
  });
  test('a prospect risked again gets the new record\'s key, so its saved row follows it', () => {
    const again = { ...north, id: '99999999-9999-4999-8999-999999999999' };
    const next = refreshFromRcp({ ...P(), row: { id: 'row-1' } }, again, { now: NOW });
    expect(next.id).toBe(`rcp-${again.id}`);
    expect(toRow(next)).toMatchObject({ prospect_key: `rcp-${again.id}`, rcp_prospect_id: again.id });
  });
});

describe('PL5, RL12: saved state', () => {
  test('the T1 browser list opens: no identification, no handoff, typed economics told from defaults', () => {
    localStorage.setItem(RRV_KEY, JSON.stringify(RRV_T1_BROWSER_LIST));
    const { list, fromLegacy } = loadStored();
    expect(fromLegacy).toBe(2);
    expect(list[0]).toMatchObject({ name: 'Ekene North', source: 'rcp', handoff: null, pgFactors: null, ident: { company: '', analyst: '' }, row: null, dirty: true });
    // 15 and 9.5 differ from the defaults, so the user typed them; 100 and 25 stay assumptions
    expect(list[0].touched).toEqual({ mefs: true, unitValue: true });
    expect(list[1].touched).toEqual({});
    expect(inputProblem(list[0])).toBeNull();
    // the older key is left for an older tab
    expect(JSON.parse(localStorage.getItem(RRV_KEY))).toHaveLength(2);
  });
  test('the browser copy round-trips, and wins over the older list once it exists', () => {
    localStorage.setItem(RRV_KEY, JSON.stringify(RRV_T1_BROWSER_LIST));
    const p = { ...P(), row: null, dirty: true };
    expect(storeLocal([p])).toBe(true);
    const back = loadStored();
    expect(back.fromLegacy).toBe(0);
    expect(back.list).toEqual([p]);
    expect(JSON.parse(localStorage.getItem(RRV_STORE_KEY)).v).toBe(2);
  });
  test('a row is the valuation itself: it reads back to the same state', () => {
    const p = { ...setInput(P(), 'mefs', 15), ident: { company: 'Lordsway', licence: 'OML 143', play: 'Agbada', analyst: 'A. Analyst' }, inputMeta: { mefs: { source: 'economics', note: 'FDP screening 2026' } }, notes: 'n' };
    const row = { id: 'row-1', user_id: 'u1', version: 4, visibility: 'private', updated_at: '2026-10-02T15:01:00.000Z', schema_version: 1, ...toRow(p) };
    expect(row).toMatchObject({ prospect_key: `rcp-${UUID}`, rcp_prospect_id: UUID, name: 'Ekene North' });
    expect(row.valuation).toEqual(payloadOf(p));
    const back = fromRow(JSON.parse(JSON.stringify(row)));
    expect(payloadOf(back)).toEqual(payloadOf(p));
    expect(back.row).toMatchObject({ id: 'row-1', version: 4 });
    expect(back.dirty).toBe(false);
    // the page's own bookkeeping never reaches the payload
    expect(Object.keys(toRow({ ...p, row: { id: 'x' }, dirty: true }).valuation)).not.toEqual(expect.arrayContaining(['row', 'dirty']));
  });
  test('a typed prospect, or a harness id that is not a uuid, saves with no source record id', () => {
    expect(toRow(blankProspect(1)).rcp_prospect_id).toBeNull();
    expect(toRow(fromRcpProspect({ id: 'prospect-1', ...RRV_SEED_PROSPECTS[0] })).rcp_prospect_id).toBeNull();
    expect(toRow({ ...blankProspect(1), name: '  ' }).name).toBe('Unnamed prospect');
  });
  test('merging the account with the browser: unsaved edits win, never-saved ones wait, deleted ones go', () => {
    const a = setInput(P(), 'mefs', 15);
    const rows = [{ id: 'row-a', version: 2, ...toRow(a) }];
    const draft = { ...a, mefs: 20, row: { id: 'row-a', version: 1 }, dirty: true };
    const never = { ...blankProspect(2), row: null, dirty: true };
    const deletedElsewhere = { ...blankProspect(3), id: 'own-gone', row: { id: 'row-gone' }, dirty: false };
    const merged = mergeSaved([draft, never, deletedElsewhere], rows);
    expect(merged.map((m) => [m.id, m.mefs, m.dirty, m.row?.id ?? null])).toEqual([[a.id, 20, true, 'row-a'], [never.id, never.mefs, true, null]]);
    // the draft is saved over the row's CURRENT version
    expect(merged[0].row.version).toBe(2);
    // with nothing unsaved in the browser the row is what shows
    expect(mergeSaved([{ ...a, mefs: 99, row: { id: 'row-a' }, dirty: false }], rows)[0]).toMatchObject({ mefs: 15, dirty: false });
  });
  test('a legacy prospect row (no unit, no basis) still maps and is flagged', () => {
    const p = fromRcpProspect({ id: 'l', ...RRV_LEGACY_PROSPECT });
    expect(p).toMatchObject({ pg: 0.2016, p90: 20, p10: 96, basis: null });
    expect(p.volumeNote).toMatch(/saved before the basis was recorded/);
    expect(p.handoff).toMatchObject({ unit: null, basis: null, source: null });
    expect(upgradeProspect(p).touched).toEqual({});
  });
});

describe('PL3: units convert at the door and are never relabelled', () => {
  test('anchors: one known value per kind (a round trip alone cannot see a wrong factor)', () => {
    const m = rrvUnits('10^6 m3');
    // 1 bbl = 0.158987294928 m3
    expect(m.volume(1)).toBeCloseTo(0.158987294928, 9);
    expect(m.volume(100)).toBeCloseTo(15.8987294928, 7);
    // 8 $/bbl = 8 / 0.158987... = 50.3185 $/m3
    expect(m.unitValue(8)).toBeCloseTo(50.31848, 4);
    // value x volume is the same money in both systems
    expect(m.unitValue(8) * m.volume(38)).toBeCloseTo(8 * 38, 9);
    expect(m.volumeIn(m.volume(12.5))).toBeCloseTo(12.5, 12);
    expect(m.unitValueIn(m.unitValue(8))).toBeCloseTo(8, 12);
    expect([m.volumeLabel, m.unitValueLabel, m.system]).toEqual(['10^6 m3 oe', '$/m3 oe', 'metric']);
    const o = rrvUnits('MMbbl');
    expect([o.volume(12), o.unitValue(8), o.volumeLabel, o.unitValueLabel]).toEqual([12, 8, 'MMboe', '$/boe']);
    expect(m.show('devCost', 100)).toBe(100);
    expect(m.show('pg', 0.3)).toBe(0.3);
    expect(m.label('devCost')).toBe('$MM');
  });
});

describe('RL1, RL7: the CSV says what it is', () => {
  const p = { ...P(), p50: 34 };
  const rows = [{ p, v: valueProspect(engineInput(p)), problem: null }];
  test('provenance header: build, time, units, percentile convention, basis, where it is saved, the source of each prospect', () => {
    const csv = valuationCsv(rows, { build: 'Petrolord Suite 4.0.0 (abc1234)', generatedAt: NOW, units: rrvUnits('MMbbl'), savedWhere: 'Petrolord account', sourceLine: () => 'ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC, sent in MMSTB, basis recoverable; edited here: P50' });
    const lines = csv.split('\n');
    const header = lines.filter((l) => l.startsWith('#'));
    expect(header[0]).toBe('# Risked Reserves Valuation, Petrolord Suite');
    expect(header.join('\n')).toMatch(/# Build: Petrolord Suite 4\.0\.0 \(abc1234\)/);
    expect(header.join('\n')).toMatch(/# Generated: 2026-10-02 15:00 UTC/);
    expect(header.join('\n')).toMatch(/# Units: volumes MMboe \(oil equivalent, gas at 6 Mscf per boe\); value per barrel \$\/boe; costs and values \$MM/);
    expect(header.join('\n')).toMatch(/# Percentiles: P90 is the low case/);
    expect(header.join('\n')).toMatch(/# EMV = Pg x \[ value per barrel x E\(V; V >= MEFS\)/);
    expect(header.join('\n')).toMatch(/# Saved: Petrolord account/);
    expect(header.join('\n')).toMatch(/# Ekene North: ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC, sent in MMSTB, basis recoverable; edited here: P50/);
    const head = lines.find((l) => l.startsWith('prospect,'));
    // the gap matrix finding: volumes converted to MMboe were labelled MMbbl, and the CSV left out the commercial case
    expect(head).toMatch(/p90_mmboe,p50_mmboe,p10_mmboe,mefs_mmboe,value_usd_per_boe/);
    expect(head).toMatch(/mean_if_commercial_mmboe,npv_if_commercial_musd,volume_basis,source_record,source_record_saved,edited_after_handoff,problem,mefs_basis,value_basis$/);
    const data = lines[lines.length - 1].split(',');
    expect(data.slice(0, 6)).toEqual(['Ekene North', 'rcp', '0.32', '12', '34', '75']);
    expect(data).toContain('recoverable');
    expect(data).toContain('p50');
    expect(lines[lines.length - 1]).toContain(rows[0].v.npvIfCommercial.toFixed(3));
  });
  test('in the metric view the numbers convert and the column names follow', () => {
    const csv = valuationCsv(rows, { units: rrvUnits('10^6 m3'), generatedAt: NOW });
    expect(csv).toMatch(/# Units: volumes 10\^6 m3 oe .*value per barrel \$\/m3 oe/);
    const head = csv.split('\n').find((l) => l.startsWith('prospect,'));
    expect(head).toMatch(/p90_mm_m3_oe,.*value_usd_per_m3_oe/);
    const data = csv.split('\n').pop().split(',');
    expect(Number(data[3])).toBeCloseTo(12 * 0.158987294928, 6);
    expect(Number(data[7])).toBeCloseTo(rows[0].p.unitValue / 0.158987294928, 4);
    // money does not convert
    expect(Number(data[8])).toBe(rows[0].p.devCost);
  });
  test('without the header the plain table is as before (the T1 export)', () => {
    const csv = valuationCsv(rows);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toMatch(/^prospect,source,pg,p90_mmbbl/);
  });
});

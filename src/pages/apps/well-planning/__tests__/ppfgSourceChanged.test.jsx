/**
 * 2026-10-14: a design remembers the prognosis it was reviewed against
 * (services/ppfgSource on the shared source-freshness kit). The mud window
 * reads the published PP/FP/OBG live, so a republish used to move the
 * casing seats with nothing said. Gates call the shipped functions; the
 * negative control shows the move going unnoticed without the reference.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import {
  snapshotOf, fingerprintOf, compareSource, keepSource, noticeText,
} from '@/lib/sourceFreshness/model';
import { useSourceFreshness } from '@/lib/sourceFreshness/useSourceFreshness';
import SourceChangedNotice from '@/lib/sourceFreshness/SourceChangedNotice';
import {
  PPFG_SOURCE_KIND, ppfgRefKey, ppfgRowFromCurves, ppfgReference, mudWindowSeen, mudWindowRowsFor,
  readPpfgSource, ppfgMoveText, designPpfgSources, tieOnWithPpfg, tieOnForSave, reviewedText,
  ppfgNoticeItems, PPFG_REFRESH_EFFECT,
} from '../services/ppfgSource';
import { tightestWindowBelow, SEATS_BELOW_TOP_M } from '../services/ppfg';
import { readyCurve, pickPpfgLogs } from '../services/ppfg';
import PpfgReviewStatus from '../components/PpfgReviewStatus';

const KB = 25;
const STEP = 5;
const N = 461; // 0..2300 m MD
const vertical = [{ md: 0, inc: 0, azi: 0 }, { md: 2300, inc: 0, azi: 0 }];
const WELL = { id: 'w-1', name: 'PPS demo: Ekene-1', kb_m: KB, deviation: vertical, td_md_m: 2300 };

// pore pressure in MPa at TVD below KB: hydrostatic, then a ramp from `top`
const ppAt = (tvd, top, k) => 0.0101 * tvd + (tvd > top ? k * (tvd - top) ** 2 : 0);
const obgAt = (tvd) => 0.0222 * tvd;
// Eaton-style: the fracture pressure follows the pore pressure (k 0.54)
const fpFrom = (pp, tvd) => pp + 0.54 * (obgAt(tvd) - pp);

/** A publish: three registry rows (new ids each time) and their samples. */
function publish(tag, { top = 1250, k = 1.4e-5, at = '2026-10-14T09:00:00.000Z' } = {}) {
  const mk = (mnemonic, f) => {
    const values = Float64Array.from({ length: N }, (_, i) => f(i * STEP));
    return {
      log: {
        id: `${mnemonic}-${tag}`, well_id: WELL.id, mnemonic, unit: 'MPA', start_md_m: 0, step_m: STEP, n_samples: N,
        created_at: at, provenance: { engine: 'pore-pressure-studio', pipeline_version: 'pp-1.2.0' },
      },
      values,
    };
  };
  const set = [mk('PP', (z) => ppAt(z, top, k)), mk('FP', (z) => fpFrom(ppAt(z, top, k), z)), mk('OBG', obgAt)];
  return { logs: set.map((s) => s.log), values: new Map(set.map((s) => [s.log.id, s.values])) };
}

function readersFor(state) {
  return {
    listLogs: async () => state.current?.logs || [],
    downloadCurve: async (log) => state.current.values.get(log.id),
    getWell: async () => WELL,
  };
}

const curvesOf = (pub) => {
  const picked = pickPpfgLogs(pub.logs);
  return Object.fromEntries(Object.entries(picked).map(([m, log]) => [m, readyCurve(log, pub.values.get(log.id))]));
};
const rowsOf = (pub, bridged = true) => mudWindowRowsFor({ curves: curvesOf(pub), well: WELL, bridged, stations: vertical, kbElevM: KB }).rows;
const refOf = (pub, bridged = true) => ppfgReference({ well: WELL, curves: curvesOf(pub), rows: rowsOf(pub, bridged), bridged, usedAt: '2026-10-14T09:30:00.000Z' });

describe('the ppfg_prognosis kind', () => {
  test('its snapshot is the published rows, in any order, and leaves what the design saw out', () => {
    const pub = publish('a');
    const row = ppfgRowFromCurves(WELL, curvesOf(pub));
    const shuffled = { ...row, curves: [...row.curves].reverse(), seen: { seats: [{ tvd: 1 }] } };
    expect(fingerprintOf(snapshotOf(PPFG_SOURCE_KIND, shuffled))).toBe(fingerprintOf(snapshotOf(PPFG_SOURCE_KIND, row)));
    const again = ppfgRowFromCurves(WELL, curvesOf(publish('b')));
    expect(fingerprintOf(snapshotOf(PPFG_SOURCE_KIND, again))).not.toBe(fingerprintOf(snapshotOf(PPFG_SOURCE_KIND, row)));
  });

  test('a well with no PP or FP published has no row', () => {
    const pub = publish('a');
    expect(ppfgRowFromCurves(WELL, { OBG: curvesOf(pub).OBG })).toBeNull();
  });
});

describe('a design reviewed against a prognosis', () => {
  const v1 = publish('v1', { top: 1250, k: 1.4e-5 });
  const v2 = publish('v2', { top: 1100, k: 1.2e-5, at: '2026-10-14T10:02:00.000Z' });
  const ref = refOf(v1);

  test('the reference keeps the curve rows and what the design saw', () => {
    expect(ref.key).toBe(ppfgRefKey(WELL.id));
    expect(ref.kind).toBe(PPFG_SOURCE_KIND);
    expect(ref.seen.seats.length).toBeGreaterThan(0);
    expect(ref.seen.max_pp.ppg).toBeGreaterThan(8.6);
    expect(ref.snapshot.curves.map((c) => c[1])).toEqual(['FP-v1', 'OBG-v1', 'PP-v1']);
  });

  test('reading the same publish again is unchanged', async () => {
    const now = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: v1 }));
    expect(compareSource(ref, now).status).toBe('unchanged');
    expect(ppfgMoveText(ref.seen, now.seen, { unit: 'ft' })).toEqual(['casing seats unchanged']);
  });

  test('a republish is a change, and what moved on this trajectory is said in feet and ppg', async () => {
    const now = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: v2 }));
    const r = compareSource(ref, now);
    expect(r.status).toBe('changed');
    expect(r.changedAt).toBe('2026-10-14T10:02:00.000Z');
    const moved = ppfgMoveText(ref.seen, now.seen, { unit: 'ft' });
    expect(moved.some((t) => /^shoe \d at least TVD [\d,]+ ft to [\d,]+ ft$|^a new shoe/.test(t))).toBe(true);
    expect(moved.some((t) => /^highest pore pressure \d+\.\d\d to \d+\.\d\d ppg$/.test(t))).toBe(true);
    expect(moved.join(' ')).not.toMatch(/—/);
    const text = noticeText({ ...r, differences: moved }, { usedBy: 'this design' });
    expect(text.headline).toBe('The prognosis on PPS demo: Ekene-1 (published pore pressure prognosis) changed after this design used it.');
    expect(text.detail).toMatch(/Changed 2026-10-14 10:02 UTC\. What moved: /);
  });

  test('keep current values records that publish, and a later one shows again', async () => {
    const now = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: v2 }));
    const kept = keepSource({}, compareSource(ref, now));
    expect(compareSource(ref, now, kept).status).toBe('kept');
    const v3 = publish('v3', { top: 1000, k: 1e-5, at: '2026-10-14T11:00:00.000Z' });
    const later = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: v3 }));
    expect(compareSource(ref, later, kept).status).toBe('changed');
  });

  test('a deleted prognosis says so', async () => {
    const now = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: null }));
    expect(now).toBeNull();
    const r = compareSource(ref, now);
    expect(r.status).toBe('deleted');
    expect(noticeText(r, { usedBy: 'this design' }).headline).toMatch(/was deleted from the registry/);
  });

  test('another well under Prognosis from is a different reference', () => {
    expect(ppfgRefKey('w-2')).not.toBe(ref.key);
  });

  test('negative control: without the reference the republish moves the seats and nothing is reported', async () => {
    // the seats really move between the two publishes
    expect(mudWindowSeen(rowsOf(v2)).seats).not.toEqual(mudWindowSeen(rowsOf(v1)).seats);
    const state = { current: v2 };
    const resolve = async (list) => new Map(await Promise.all(list.map(async (r) => [r.key, await readPpfgSource(r, { stations: vertical, kbElevM: KB }, readersFor(state))])));
    const without = renderHook(() => useSourceFreshness({ refs: [], resolve }));
    await waitFor(() => expect(without.result.current.checking).toBe(false));
    expect(without.result.current.items).toEqual([]);
    const withRef = renderHook(() => useSourceFreshness({ refs: [ref], resolve }));
    await waitFor(() => expect(withRef.result.current.items.length).toBe(1));
    expect(withRef.result.current.items[0].status).toBe('changed');
    expect(withRef.result.current.rowFor(ref.key).seen.seats.length).toBeGreaterThan(0);
  });
});

describe('storage in the design row (tie_on.sources.ppfg, no schema change)', () => {
  const ref = refOf(publish('v1'));
  test('recorded beside the tie-on, and carried through Save', () => {
    const tieOn = tieOnWithPpfg({ md: 0, inc: 0, azi: 75 }, { refs: { [ref.key]: ref }, kept: {} });
    expect(tieOn.azi).toBe(75);
    const design = { tie_on: tieOn };
    expect(designPpfgSources(design).refs[ref.key].id).toBe('w-1');
    const saved = tieOnForSave(design, { md: 0, inc: 0, azi: 80 });
    expect(saved.azi).toBe(80);
    expect(saved.sources.ppfg.refs[ref.key]).toBe(ref);
    expect(designPpfgSources({ tie_on: { md: 0, inc: 0, azi: 0 } })).toEqual({ refs: {}, kept: {} });
    expect(tieOnForSave({ tie_on: null }, { md: 0, inc: 0, azi: 1 })).toEqual({ md: 0, inc: 0, azi: 1 });
  });
});

describe('what the person sees', () => {
  const v1 = publish('v1');
  const ref = refOf(v1);

  test('before anything is recorded: the record button', () => {
    const onRecord = jest.fn();
    render(<PpfgReviewStatus reference={null} status={null} canEdit ready onRecord={onRecord} unit="ft" />);
    expect(screen.getByTestId('wd-ppfg-review').textContent).toMatch(/a republish would go unnoticed/);
    fireEvent.click(screen.getByTestId('wd-ppfg-record'));
    expect(onRecord).toHaveBeenCalled();
  });

  test('recorded and unchanged: when it was published and the seats then', () => {
    render(<PpfgReviewStatus reference={ref} status="unchanged" canEdit ready onRecord={() => {}} unit="ft" />);
    const t = screen.getByTestId('wd-ppfg-reviewed').textContent;
    expect(t).toMatch(/^This design was reviewed against the prognosis on PPS demo: Ekene-1, published 2026-10-14 09:00 UTC; casing seats then at TVD [\d, ]+ ft\.$/);
    expect(t).toBe(reviewedText(ref, { unit: 'ft' }));
  });

  test('changed: the panel line points at the notice, and the notice carries what moved with both actions', async () => {
    const v2 = publish('v2', { top: 1100, k: 1.2e-5, at: '2026-10-14T10:02:00.000Z' });
    render(<PpfgReviewStatus reference={ref} status="changed" canEdit ready onRecord={() => {}} unit="ft" />);
    expect(screen.getByTestId('wd-ppfg-reviewed-stale')).toBeTruthy();
    const now = await readPpfgSource(ref, { stations: vertical, kbElevM: KB }, readersFor({ current: v2 }));
    const item = { ...compareSource(ref, now), differences: ppfgMoveText(ref.seen, now.seen, { unit: 'ft' }), effect: 'The mud window shows the prognosis published now.' };
    const onRefresh = jest.fn(async () => {});
    const onKeep = jest.fn();
    render(<SourceChangedNotice items={[item]} onRefresh={onRefresh} onKeep={onKeep} title="Prognosis changed" testId="wd-ppfg-source-changed" usedBy="this design" compact />);
    const box = screen.getByTestId('wd-ppfg-source-changed');
    expect(box.textContent).toMatch(/Prognosis changed \(1\)/);
    expect(box.textContent).toMatch(/What moved: .*highest pore pressure/);
    fireEvent.click(screen.getByTestId('wd-ppfg-source-changed-refresh'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('wd-ppfg-source-changed-keep'));
    expect(onKeep).toHaveBeenCalled();
  });
});

describe('what moved, from the mud window once it has loaded (dry-run follow-up)', () => {
  const ft = (x) => x * 0.3048;
  const was = {
    seats: [{ tvd: ft(2709) }, { tvd: ft(4238) }, { tvd: ft(4709) }],
    max_pp: { ppg: 13.94, tvd: ft(7300) }, tightest: { ppg: 0.81, tvd: ft(4709) },
  };
  const now = { seats: [{ tvd: ft(1693) }], max_pp: { ppg: 12.59, tvd: ft(7300) }, tightest: { ppg: 1.42, tvd: ft(1693) } };

  test('the exact words: a moved shoe, the shoes no longer needed, the highest pore pressure and tightest window', () => {
    expect(ppfgMoveText(was, now, { unit: 'ft' })).toEqual([
      'shoe 1 at least TVD 2,709 ft to 1,693 ft',
      'shoes 2 and 3 no longer needed',
      'highest pore pressure 13.94 to 12.59 ppg',
      'tightest window 0.81 ppg at TVD 4,709 ft to 1.42 ppg at TVD 1,693 ft',
    ]);
    expect(ppfgMoveText({ seats: [{ tvd: 100 }, { tvd: 200 }] }, { seats: [{ tvd: 100 }] })).toEqual(['shoe 2 no longer needed']);
  });

  test('a registry read without seats falls back to the generic words until the panel has loaded, then says what moved', async () => {
    const v1 = publish('v1');
    const v2 = publish('v2', { top: 1100, k: 1.2e-5, at: '2026-10-14T10:02:00.000Z' });
    const ref = refOf(v1);
    // the read ran before the trajectory compiled: no stations, so no seats in the row
    const row = await readPpfgSource(ref, { stations: null }, readersFor({ current: v2 }));
    expect(row.seen).toBeUndefined();
    const item = { ...compareSource(ref, row) };
    const rowFor = () => row;
    const before = ppfgNoticeItems([item], { rowFor, panelSeen: null, unit: 'ft' })[0];
    expect(before.differences).toEqual(['curves changed']);
    expect(before.effect).toBe(PPFG_REFRESH_EFFECT);
    const panelSeen = { wellId: WELL.id, seen: mudWindowSeen(rowsOf(v2)) };
    const after = ppfgNoticeItems([item], { rowFor, panelSeen, unit: 'ft' })[0];
    expect(after.differences.join('; ')).toMatch(/^shoe 1 at least TVD [\d,]+ ft to [\d,]+ ft; highest pore pressure \d+\.\d\d to \d+\.\d\d ppg/);
    // negative control: the panel showing another well's prognosis is not used
    const other = ppfgNoticeItems([item], { rowFor, panelSeen: { ...panelSeen, wellId: 'w-2' }, unit: 'ft' })[0];
    expect(other.differences).toEqual(['curves changed']);
  });
});

describe('the tightest window below the seats\' top cut-off', () => {
  // the conductor section: PP and FG converge on the seawater gradient at the top
  const rows = [
    { md: 75, tvd: 75, ppPpg: 8.6, fpPpg: 8.65, ppEmw: 1.03, fpEmw: 1.036, windowMpa: 0.04 },
    { md: 600, tvd: 600, ppPpg: 8.7, fpPpg: 12.0, ppEmw: 1.042, fpEmw: 1.438, windowMpa: 1.9 },
    { md: 1400, tvd: 1400, ppPpg: 13.0, fpPpg: 13.8, ppEmw: 1.558, fpEmw: 1.654, windowMpa: 1.3 },
    { md: 2000, tvd: 2000, ppPpg: 13.5, fpPpg: 15.0, ppEmw: 1.618, fpEmw: 1.797, windowMpa: 3.5 },
  ];
  test('below the cut-off the tightest is the ramp, in ppg and g/cc', () => {
    const t = tightestWindowBelow(rows, { fromTvdM: 75 + SEATS_BELOW_TOP_M });
    expect(t.tvd).toBe(1400);
    expect(t.ppg).toBeCloseTo(0.8, 9);
    expect(t.gcc).toBeCloseTo(0.096, 9);
    // negative control: with no cut-off the conductor section wins
    expect(tightestWindowBelow(rows, { fromTvdM: 0 }).tvd).toBe(75);
    expect(mudWindowSeen(rows).tightest.tvd).toBe(1400);
  });
});

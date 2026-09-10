/**
 * PT11c: the depth-shift service. The shift function is a first-class
 * object on the `_DS` row, the raw curve is never written, and a saved
 * shift round-trips through save and reload with its pairs and edits.
 */
import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import {
  applyTies, buildShiftLog, dsName, isDsName, shiftLogFor, shiftOfLog, shiftTracks, verifyStoredShift,
} from '../services/depthShift';
import { depthShiftTiePoints, depthShiftBlock } from '../engine/conditioning';
import { mapLogs } from '../services/curveMap';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const C = goldens.COND;

async function openWell(backend) {
  const wells = await backend.listWells();
  const well = wells.find((w) => w.is_own);
  const logs = await backend.listLogs(well.id);
  const raw = {};
  for (const l of logs) raw[l.mnemonic] = await backend.downloadCurve(l);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [key, log] of Object.entries(mapped)) if (log) curves[key] = raw[log.mnemonic];
  return { wellId: well.id, curves, logs: raw, allLogs: logs, inventory: Object.entries(mapped).map(([key, log]) => ({ key, log })) };
}

test('applyTies refuses crossing ties with the engine sentence and never throws', () => {
  const depth = Float64Array.from([0, 1, 2, 3]);
  const x = Float64Array.from([1, 2, 3, 4]);
  const bad = applyTies(depth, x, [[1, 2], [2, 1.5]]);
  expect(bad.ok).toBe(false);
  expect(bad.error).toMatch(/Ties cross/);
  const ok = applyTies(depth, x, [[2, 1]]);
  expect(ok.ok).toBe(true);
  expect(Array.from(ok.data)).toEqual(Array.from(depthShiftBlock(depth, x, 1)));
  expect(Array.from(ok.shift)).toEqual([1, 1, 1, 1]);
});

test('the _DS row carries the shift object, who and when, and the raw row is untouched', async () => {
  const backend = makeInMemoryBackend();
  const wd = await openWell(backend);
  const rawBefore = Float64Array.from(wd.logs.GR);
  const rawRowBefore = wd.allLogs.find((l) => l.mnemonic === 'GR');
  const log = buildShiftLog({
    wellData: wd, sourceMnemonic: 'GR', referenceMnemonic: 'RHOB', pairs: C.tiePairs, projectId: 'proj-1', by: 'dev',
    now: () => new Date('2026-09-10T10:00:00Z'),
  });
  expect(log.mnemonic).toBe('GR_DS');
  expect(isDsName(log.mnemonic)).toBe(true);
  expect(dsName('GR')).toBe('GR_DS');
  const p = log.provenance;
  expect(p).toMatchObject({ computed: true, engine: 'petrophysics-studio', operation: 'depth-shift', method: 'tie-points', project_id: 'proj-1' });
  expect(p.shift.pairs).toEqual(C.tiePairs);
  expect(p.shift.reference.mnemonic).toBe('RHOB');
  expect(p.shift.source.mnemonic).toBe('GR');
  expect(p.shift.interpolation).toBe('linear-bracketing');
  expect(p.shift.beyond).toBe('constant');
  expect(p.shift.edits).toEqual([{ at: '2026-09-10T10:00:00.000Z', by: 'dev', pairs: C.tiePairs }]);
  expect(p.input_log_ids).toContain(rawRowBefore.id);
  // the samples are the applied result at float32
  const expected = depthShiftTiePoints(wd.curves.DEPT, wd.logs.GR, C.tiePairs);
  for (let i = 0; i < expected.length; i++) {
    if (Number.isNaN(expected[i])) expect(Number.isNaN(log.data[i])).toBe(true);
    else expect(log.data[i]).toBe(Math.fround(expected[i]));
  }
  // the golden agrees
  for (let i = 0; i < expected.length; i++) {
    if (C.GR_TIE_SHIFTED[i] == null) expect(Number.isNaN(expected[i])).toBe(true);
    else expect(Math.abs(expected[i] - C.GR_TIE_SHIFTED[i])).toBeLessThan(1e-9);
  }
  expect(Array.from(wd.logs.GR)).toEqual(Array.from(rawBefore));
});

test('gate 8: round trip through save and reload, the pairs come back and re-apply byte for byte', async () => {
  const backend = makeInMemoryBackend();
  let wd = await openWell(backend);
  const first = buildShiftLog({ wellData: wd, sourceMnemonic: 'GR', referenceMnemonic: 'RHOB', pairs: [[2020, 2021]], projectId: 'proj-1', by: 'dev' });
  await backend.publishCurves(wd.wellId, [first], 'proj-1');
  wd = await openWell(backend);
  const row = shiftLogFor(wd.allLogs, 'GR');
  expect(row).not.toBeNull();
  expect(shiftOfLog(row).pairs).toEqual([[2020, 2021]]);
  expect(wd.logs.GR_DS).toBeDefined();
  const v = verifyStoredShift(wd.curves.DEPT, wd.logs.GR, wd.logs.GR_DS, shiftOfLog(row));
  expect(v).toEqual({ ok: true, mismatches: 0 });
  // a second save with more ties REPLACES the row (no duplicates) and carries the edit list
  const second = buildShiftLog({ wellData: wd, sourceMnemonic: 'GR', referenceMnemonic: 'RHOB', pairs: C.tiePairs, projectId: 'proj-1', by: 'dev', previous: row });
  await backend.publishCurves(wd.wellId, [second], 'proj-1');
  wd = await openWell(backend);
  expect(wd.allLogs.filter((l) => l.mnemonic === 'GR_DS')).toHaveLength(1);
  const row2 = shiftLogFor(wd.allLogs, 'GR');
  expect(shiftOfLog(row2).pairs).toEqual(C.tiePairs);
  expect(shiftOfLog(row2).edits).toHaveLength(2);
  expect(shiftOfLog(row2).edits[0].pairs).toEqual([[2020, 2021]]);
  expect(verifyStoredShift(wd.curves.DEPT, wd.logs.GR, wd.logs.GR_DS, shiftOfLog(row2)).mismatches).toBe(0);
  // the raw GR row is the same row it was
  expect(wd.allLogs.filter((l) => l.mnemonic === 'GR')).toHaveLength(1);
  // reset to raw deletes the row
  await backend.deleteLog(row2);
  wd = await openWell(backend);
  expect(shiftLogFor(wd.allLogs, 'GR')).toBeNull();
  expect(wd.logs.GR).toBeDefined();
});

test('the shift track shows the display unit and the target track carries raw and shifted', () => {
  const depth = Float64Array.from([0, 1, 2, 3]);
  const x = Float64Array.from([1, 2, 3, 4]);
  const a = applyTies(depth, x, [[2, 1]]);
  const tracks = shiftTracks({ referenceMnemonic: 'RHOB', referenceData: x, sourceMnemonic: 'GR', sourceData: x, shifted: a.data, shift: a.shift, depthUnit: 'ft', unitOf: () => 'API' });
  expect(tracks.map((t) => t.key)).toEqual(['ref', 'target', 'shift']);
  expect(tracks[1].curves.map((c) => c.name)).toEqual(['GR raw', 'GR_DS']);
  expect(tracks[1].curves[0].style).toBe('dash');
  expect(tracks[2].unit).toBe('ft');
  expect(tracks[2].curves[0].data[0]).toBeCloseTo(3.280839895, 9);
});

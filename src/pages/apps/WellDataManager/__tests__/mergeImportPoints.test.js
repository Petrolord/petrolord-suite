/**
 * PETRO-U1-011 (Petrophysics upgrade, PL2 hostile set): routine core
 * analysis merged into an existing well. Twelve plugs at irregular depths
 * (e2e/fixtures/petro/hostile/core_routine_plugs.las) were linearly
 * resampled onto the 0.5 m log grid: 47 samples of "core porosity"
 * between plugs metres apart, and not one measured value kept.
 * Negative control (run 2026-09-28): with resampleToGrid for every curve,
 * the value-set and count assertions fail (47 samples, 0 plug values).
 */
import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { planMerge, findDepthLog, placeNearest, isPointData } from '../engine/mergeImport';

const HOSTILE = path.join(__dirname, '..', '..', '..', '..', '..', 'e2e', 'fixtures', 'petro', 'hostile');
const file = (name) => ({ name, text: async () => fs.readFileSync(path.join(HOSTILE, name), 'utf8') });

test('core plugs land on their nearest log samples with their measured values, nothing between', async () => {
  const b = makeInMemoryBackend({ seedSharedWell: false });
  const ref = await b.parseLasFile(file('reference_si.las'));
  const well = await b.saveWell({ name: 'REF', surfaceX: 0, surfaceY: 0, kbM: 0, tdMdM: 1600 });
  await b.saveLogs(well.id, planMerge({ prepLogs: ref.prep.logs, keep: Object.fromEntries(ref.prep.logs.map((l) => [l.mnemonic, true])) }).logs);
  const core = await b.parseLasFile(file('core_routine_plugs.las'));
  const existing = await b.listLogs(well.id);
  const dl = findDepthLog(existing);
  const depth = await b.downloadCurve(dl);
  const plan = planMerge({
    prepLogs: core.prep.logs, keep: Object.fromEntries(core.prep.logs.map((l) => [l.mnemonic, true])),
    existingLogs: existing, existingDepth: { log: dl, data: depth },
  });
  const plugs = core.prep.logs.find((l) => l.mnemonic === 'CPOR');
  const measured = new Set(Array.from(plugs.data, (v) => Math.fround(v)));
  const cpor = plan.logs.find((l) => l.mnemonic === 'CPOR');
  const finite = [];
  for (let i = 0; i < cpor.data.length; i++) if (Number.isFinite(cpor.data[i])) finite.push([depth[i], cpor.data[i]]);
  expect(finite.length).toBeGreaterThanOrEqual(12);
  expect(finite.length).toBeLessThanOrEqual(24);
  for (const [d, v] of finite) {
    expect(measured.has(Math.fround(v))).toBe(true);
    // within half a grid step of a plug
    expect(Math.min(...Array.from(core.prep.logs[0].data, (p) => Math.abs(p - d)))).toBeLessThanOrEqual(0.25 + 1e-6);
  }
  expect(cpor.provenance.resampled_from.method).toMatch(/nearest sample/);
});

test('a regular, mostly finite log still resamples linearly', () => {
  expect(isPointData(0.1524, Float32Array.from([1, 2, 3, NaN]))).toBe(false);
  expect(isPointData(null, Float32Array.from([1, 2, 3]))).toBe(true);
  expect(isPointData(0.1, Float32Array.from([1, NaN, NaN, NaN]))).toBe(true);
});

test('placeNearest leaves a grid sample empty when no measurement is within half a step', () => {
  const out = placeNearest(Float64Array.from([10.1, 12.0]), Float32Array.from([0.2, 0.3]), Float64Array.from([10, 10.5, 11, 11.5, 12]));
  expect(Array.from(out, (v) => (Number.isFinite(v) ? +v.toFixed(3) : null))).toEqual([0.2, null, null, null, 0.3]);
});

/**
 * G2.5 — write-back: publish payload provenance, the overwrite-own
 * rule, zone-summary snapshots, and the batch recipe all through the
 * in-memory backend (the same contract the registry backend upholds).
 */

import {
  computeWell, preparePublishLogs, zonePropertiesSnapshot, zoneSummary,
  PIPELINE_VERSION, DEFAULT_PARAMS,
} from '../engine/pipeline';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

async function loadWell(backend, name) {
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const curves = {};
  const inventory = [];
  for (const log of logs) {
    curves[log.mnemonic] = await backend.downloadCurve(log);
    inventory.push({ key: log.mnemonic, log });
  }
  return { well, curves, inventory };
}

test('preparePublishLogs: f32 samples + full provenance for each output', () => {
  const backend = makeInMemoryBackend();
  return loadWell(backend, 'KETA TYPE-1').then(({ curves, inventory }) => {
    const { outputs } = computeWell(curves, DEFAULT_PARAMS);
    const logs = preparePublishLogs({ curves, inventory }, outputs, DEFAULT_PARAMS, { projectId: 'p1' });
    expect(logs.map((l) => l.mnemonic).sort()).toEqual(['PAY', 'PHIE', 'SW', 'VSH']);
    for (const l of logs) {
      expect(l.data).toBeInstanceOf(Float32Array);
      expect(l.data.length).toBe(curves.DEPT.length);
      expect(l.provenance.computed).toBe(true);
      expect(l.provenance.engine).toBe('petrophysics-studio');
      expect(l.provenance.pipeline_version).toBe(PIPELINE_VERSION);
      expect(l.provenance.project_id).toBe('p1');
      expect(l.provenance.params.swMethod).toBe(DEFAULT_PARAMS.swMethod);
      expect(l.provenance.input_log_ids.length).toBeGreaterThan(0);
    }
    // null count matches NaN samples (e.g. the seeded null indices)
    const sw = logs.find((l) => l.mnemonic === 'SW');
    expect(sw.nullCount).toBe(Array.from(sw.data).filter((v) => Number.isNaN(v)).length);
  });
});

test('publishCurves overwrites only its OWN prior output, never imported curves', async () => {
  const backend = makeInMemoryBackend();
  const { well, curves, inventory } = await loadWell(backend, 'KETA TYPE-1');
  const before = (await backend.listLogs(well.id)).length; // 6 imported
  const { outputs } = computeWell(curves, DEFAULT_PARAMS);

  const prep = preparePublishLogs({ curves, inventory }, outputs, DEFAULT_PARAMS, { projectId: 'p1' });
  const first = await backend.publishCurves(well.id, prep, 'p1');
  expect(first).toHaveLength(4);
  expect((await backend.listLogs(well.id)).length).toBe(before + 4);

  // republish same project -> replaces its 4, not the 6 imports
  const again = await backend.publishCurves(well.id, prep, 'p1');
  expect(again).toHaveLength(4);
  const after = await backend.listLogs(well.id);
  expect(after.length).toBe(before + 4);
  expect(after.filter((l) => !l.provenance?.computed)).toHaveLength(before);

  // a DIFFERENT project's curves coexist (no clobber across projects)
  await backend.publishCurves(well.id, preparePublishLogs({ curves, inventory }, outputs, DEFAULT_PARAMS, { projectId: 'p2' }), 'p2');
  expect((await backend.listLogs(well.id)).length).toBe(before + 8);
});

test('published curves become mappable registry inputs (VSH/PHIE/SW round-trip)', async () => {
  const backend = makeInMemoryBackend();
  const { well, curves, inventory } = await loadWell(backend, 'KETA TYPE-1');
  const { outputs } = computeWell(curves, DEFAULT_PARAMS);
  await backend.publishCurves(well.id, preparePublishLogs({ curves, inventory }, outputs, DEFAULT_PARAMS, { projectId: 'p1' }), 'p1');
  const logs = await backend.listLogs(well.id);
  const vshLog = logs.find((l) => l.mnemonic === 'VSH');
  const data = await backend.downloadCurve(vshLog);
  // f32 round-trip of the computed VSH
  expect(Array.from(data).slice(0, 5).map((v) => Math.fround(v)))
    .toEqual(Array.from(outputs.VSH.slice(0, 5)).map((v) => Math.fround(v)));
});

test('publishZone snapshots the summary + reproduction metadata', async () => {
  const backend = makeInMemoryBackend();
  const { well, curves } = await loadWell(backend, 'KETA TYPE-1');
  const { outputs } = computeWell(curves, DEFAULT_PARAMS);
  const zone = (await backend.listZones(well.id))[0]; // seeded SAND A
  const summary = zoneSummary(curves, outputs, DEFAULT_PARAMS, zone);
  const props = zonePropertiesSnapshot(summary, DEFAULT_PARAMS, { projectId: 'p1', publishedAt: '2026-07-13T00:00:00Z' });
  await backend.publishZone(zone, props);

  const saved = (await backend.listZones(well.id)).find((z) => z.id === zone.id);
  expect(saved.properties.net_m).toBeCloseTo(summary.net_m, 9);
  expect(saved.properties.cutoffs.sw_max).toBe(DEFAULT_PARAMS.cutSw);
  expect(saved.properties.methods.sw).toBe('archie');
  expect(saved.properties.pipeline_version).toBe(PIPELINE_VERSION);
});

test('write-backs to an org-shared well are rejected (mirrors RLS)', async () => {
  const backend = makeInMemoryBackend();
  const shared = (await backend.listWells()).find((w) => !w.is_own);
  await expect(backend.publishCurves(shared.id, [{ mnemonic: 'VSH', data: new Float32Array(1) }], 'p1'))
    .rejects.toThrow(/Only the owner/);
  const zone = (await backend.listZones(shared.id))[0];
  await expect(backend.publishZone(zone, { net_m: 1 })).rejects.toThrow(/Only the owner/);
});

test('saveProject/loadProject round-trip params + facies', async () => {
  const backend = makeInMemoryBackend();
  expect(await backend.loadProject()).toBeNull();
  const saved = await backend.saveProject({ params: { m: 2.1 }, facies: { w1: [{ id: 'f', polygon: [[0, 0]] }] } });
  expect(saved.params.m).toBe(2.1);
  const loaded = await backend.loadProject();
  expect(loaded.params.m).toBe(2.1);
  expect(loaded.facies.w1).toHaveLength(1);
});

/**
 * G3.2 — the in-memory backend IS the harness's contract: registry
 * shapes, owner-only per-top writes mirroring RLS, propagation across
 * owned wells only, section persistence. Drives the same flow the
 * Playwright suite clicks through.
 */

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { computeFlattening, correlationPolyline, displayedDepth, topMd } from '../engine/section';

async function loadSectionWells(backend) {
  const wells = await backend.listWells();
  const out = [];
  for (const w of wells) {
    out.push({ ...w, tops: await backend.listTops(w.id) });
  }
  return out;
}

test('seeds the 3-well section; W3 is org-shared read-only and lacks Mid Shale', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  expect(wells.map((w) => w.name)).toEqual(['KETA-1', 'KETA-2', 'KETA-3']);
  expect(wells[2].is_own).toBe(false);
  const w3tops = await backend.listTops('corr-w3');
  expect(w3tops.some((t) => t.name === 'Mid Shale')).toBe(false);
});

test('GR + depth curves load and are same-length', async () => {
  const backend = makeInMemoryBackend();
  const logs = await backend.listLogs('corr-w1');
  const gr = logs.find((l) => l.mnemonic === 'GR');
  const dep = logs.find((l) => l.mnemonic === 'DEPT');
  const [g, d] = [await backend.downloadCurve(gr), await backend.downloadCurve(dep)];
  expect(g.length).toBe(d.length);
  expect(g.length).toBeGreaterThan(600);
});

test('drag a top -> updateTop persists the new MD (owned well)', async () => {
  const backend = makeInMemoryBackend();
  const tops = await backend.listTops('corr-w1');
  const dome = tops.find((t) => t.name === 'Top Dome');
  await backend.updateTop(dome.id, { mdM: 1512 });
  const after = await backend.listTops('corr-w1');
  expect(after.find((t) => t.name === 'Top Dome').md_m).toBe(1512);
});

test('per-top writes to the org-shared well are rejected (mirrors RLS)', async () => {
  const backend = makeInMemoryBackend();
  const w3tops = await backend.listTops('corr-w3');
  await expect(backend.updateTop(w3tops[0].id, { mdM: 1500 })).rejects.toThrow(/Only the owner/);
  await expect(backend.saveTop('corr-w3', { name: 'X', mdM: 1500 })).rejects.toThrow(/Only the owner/);
  await expect(backend.deleteTop(w3tops[0])).rejects.toThrow(/Only the owner/);
});

test('propagateTop seeds owned wells only, idempotently', async () => {
  const backend = makeInMemoryBackend();
  const targets = [
    { wellId: 'corr-w1', mdM: 1620 },
    { wellId: 'corr-w2', mdM: 1620 },
    { wellId: 'corr-w3', mdM: 1620 }, // org-shared -> skipped
  ];
  const first = await backend.propagateTop('Marker X', targets);
  expect(first.map((t) => t.well_id).sort()).toEqual(['corr-w1', 'corr-w2']);
  // idempotent: re-propagate adds nothing (already present on owned wells)
  const again = await backend.propagateTop('Marker X', targets);
  expect(again).toHaveLength(0);
});

test('flatten-on-Top-Dome yields a flat correlation line across the section', async () => {
  const backend = makeInMemoryBackend();
  const wells = await loadSectionWells(backend);
  const f = computeFlattening(wells, { mode: 'flatten', topName: 'Top Dome', datumM: 1500 });
  const line = correlationPolyline(wells, f, 'Top Dome');
  expect(line).toHaveLength(3);
  expect(line.every((p) => Math.abs(p.displayed - 1500) < 1e-9)).toBe(true);
  // and the shifts are the hand-derived 0 / -40 / +30
  expect(f.map((x) => x.shift)).toEqual([0, -40, 30]);
});

test('saveSection / loadSection round-trip order + datum', async () => {
  const backend = makeInMemoryBackend();
  expect(await backend.loadSection()).toBeNull();
  await backend.saveSection({ well_ids: ['corr-w1', 'corr-w2'], datum: { mode: 'flatten', topName: 'Top Dome', datumM: 1500 } });
  const s = await backend.loadSection();
  expect(s.well_ids).toEqual(['corr-w1', 'corr-w2']);
  expect(s.datum.topName).toBe('Top Dome');
});

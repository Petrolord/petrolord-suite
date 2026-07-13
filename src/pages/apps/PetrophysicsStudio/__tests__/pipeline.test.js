/**
 * G2.3 — the compute pipeline and the in-memory backend reproduce the
 * ORACLE'S numbers end-to-end: same curves in (via the backend, the
 * path the UI takes), DEFAULT_PARAMS (deliberately identical to the
 * type well's construction params), oracle zone summaries out.
 */

import fs from 'fs';
import path from 'path';
import { computeWell, zoneSummary, DEFAULT_PARAMS } from '../engine/pipeline';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

async function loadCurvesViaBackend(backend, wellName) {
  const wells = await backend.listWells();
  const well = wells.find((w) => w.name === wellName);
  const logs = await backend.listLogs(well.id);
  const curves = {};
  for (const log of logs) curves[log.mnemonic] = await backend.downloadCurve(log);
  return { well, curves };
}

test('DEFAULT_PARAMS mirror the type well construction params', () => {
  const p = typewell.params;
  expect(DEFAULT_PARAMS.grClean).toBe(p.gr_clean);
  expect(DEFAULT_PARAMS.grClay).toBe(p.gr_clay);
  expect(DEFAULT_PARAMS.rhoMa).toBe(p.rho_ma);
  expect(DEFAULT_PARAMS.rhoFl).toBe(p.rho_fl);
  expect(DEFAULT_PARAMS.rw).toBe(p.rw);
  expect(DEFAULT_PARAMS.rsh).toBe(p.rsh);
  expect([DEFAULT_PARAMS.cutPhi, DEFAULT_PARAMS.cutVsh, DEFAULT_PARAMS.cutSw])
    .toEqual([p.cut_phi, p.cut_vsh, p.cut_sw]);
});

test('backend curves -> pipeline -> oracle golden curves', async () => {
  const backend = makeInMemoryBackend();
  const { curves } = await loadCurvesViaBackend(backend, 'KETA TYPE-1');
  const { outputs, missing } = computeWell(curves, DEFAULT_PARAMS);
  expect(missing).toEqual([]);

  const check = (arr, golden, label) => {
    expect(arr.length).toBe(golden.length);
    for (let i = 0; i < golden.length; i++) {
      if (golden[i] === null) {
        if (!Number.isNaN(arr[i])) throw new Error(`${label}[${i}]: expected NaN`);
      } else if (!close(arr[i], golden[i])) {
        throw new Error(`${label}[${i}]: ${arr[i]} !== ${golden[i]}`);
      }
    }
  };
  check(outputs.VSH, goldens.VSH_LARIONOV_TERTIARY, 'VSH');
  check(outputs.PHIE, goldens.PHID, 'PHIE(density)');
  check(outputs.SW, goldens.SW_ARCHIE, 'SW');
});

test('zone summaries reproduce the oracle zone goldens through the backend', async () => {
  const backend = makeInMemoryBackend();
  const { well, curves } = await loadCurvesViaBackend(backend, 'KETA TYPE-1');
  const { outputs } = computeWell(curves, DEFAULT_PARAMS);

  // seeded SAND A + an added SAND B, matching the golden zone windows
  const [top, base] = typewell.params.zones.SAND_B;
  await backend.saveZone(well.id, { name: 'SAND B', topMdM: top, baseMdM: base });
  const zones = await backend.listZones(well.id);
  expect(zones.map((z) => z.name)).toEqual(['SAND A', 'SAND B']);

  const expectSummary = (zone, goldenKey) => {
    const s = zoneSummary(curves, outputs, DEFAULT_PARAMS, zone);
    for (const [k, gv] of Object.entries(goldens.ZONES[goldenKey].summary)) {
      if (gv === null) expect(s[k]).toBeNull();
      else if (!close(s[k], gv)) throw new Error(`${goldenKey}.${k}: ${s[k]} !== ${gv}`);
    }
  };
  expectSummary(zones[0], 'SAND_A');
  expectSummary(zones[1], 'SAND_B');
});

test('missing inputs are reported, never fabricated', () => {
  const depth = Float64Array.from({ length: 5 }, (_, i) => 2000 + i * 0.5);
  const { outputs, missing } = computeWell({ DEPT: depth, GR: depth.map(() => 60) }, DEFAULT_PARAMS);
  expect(outputs.VSH).toBeDefined();
  expect(outputs.PHIE).toBeUndefined();
  expect(outputs.SW).toBeUndefined();
  expect(missing).toContain('density porosity inputs');
  expect(missing).toContain('RT (Sw)');
});

test('read-only shared well rejects zone writes (mirrors RLS)', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const shared = wells.find((w) => !w.is_own);
  await expect(backend.saveZone(shared.id, { name: 'X', topMdM: 1, baseMdM: 2 }))
    .rejects.toThrow(/Only the owner/);
  const zones = await backend.listZones(shared.id);
  await expect(backend.deleteZone(zones[0])).rejects.toThrow(/Only the owner/);
  // reads stay open — that is what org sharing grants
  expect(zones).toHaveLength(1);
  expect(zones[0].properties.phi_avg).toBe(0.21);
});

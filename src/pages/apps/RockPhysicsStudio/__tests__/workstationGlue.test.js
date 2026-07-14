/**
 * G6.4 — the service glue between the registry and the oracle-
 * validated engines: curve mapping/unit prep, Vs provenance, and the
 * scenario path that the Fluids panel drives. The end-to-end anchor is
 * the gassmann log_domain golden reproduced THROUGH the service layer
 * (in-memory backend fixture -> prep -> scenario -> substituted
 * velocities), not just engine-to-engine.
 */

import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices, meanAt } from '../services/prep';
import {
  DEFAULT_SCENARIO, DEFAULT_ROCK, sideFluid, kminFromRock, substituteInterval,
} from '../services/scenario';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'rockphysics');
const GOLDENS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

async function loadWell(backend, name) {
  const wells = await backend.listWells();
  const well = wells.find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [key, log] of Object.entries(mapped)) {
    if (log) curves[key] = await backend.downloadCurve(log);
  }
  return { well, model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}

test('fixture well with DTS builds a measured-Vs SI model', async () => {
  const { model } = await loadWell(makeInMemoryBackend(), 'KETA RP-1');
  expect(model.vsSource).toBe('measured');
  const i = zoneIndices(model.depth, 2020, 2040)[0];
  // US/M sonic and G/C3 density converted to SI exactly
  expect(close(model.vp[i], 3200)).toBe(true);
  expect(close(model.vs[i], 1800)).toBe(true);
  expect(close(model.rho[i], 2250)).toBe(true);
  expect(close(model.phi[i], 0.25)).toBe(true);
});

test('fixture well without DTS estimates Vs and flags it', async () => {
  const { model } = await loadWell(makeInMemoryBackend(), 'AKOMA-2 (org shared)');
  expect(model.vsSource).toBe('estimated');
  for (const v of model.vs) expect(Number.isFinite(v)).toBe(true);
});

test('scenario path reproduces the gassmann log_domain golden through the services', async () => {
  const G = GOLDENS.gassmann.log_domain;
  const { model, zones } = await loadWell(makeInMemoryBackend(), 'KETA RP-1');
  const zone = zones.find((z) => z.name === 'BRINE SAND');
  const indices = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  expect(indices.length).toBeGreaterThan(0);

  const flA = sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidA); // brine
  const flB = sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidB); // gas
  expect(close(flA.k, G.fl_a.k)).toBe(true);
  expect(close(flA.rho, G.fl_a.rho)).toBe(true);
  expect(close(flB.k, G.fl_b.k)).toBe(true);

  const kmin = kminFromRock({ ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  expect(kmin).toBe(G.kmin);

  const sub = substituteInterval(model, indices, kmin, flA, flB, 0.2);
  expect(sub.done).toBe(indices.length);
  expect(sub.skipped).toBe(0);
  // the fixture zone is constant, so every substituted sample (and the
  // interval mean the panel displays) IS the golden's answer
  expect(close(meanAt(sub.vp, indices), G.vp, 1e-9)).toBe(true);
  expect(close(meanAt(sub.vs, indices), G.vs, 1e-9)).toBe(true);
  expect(close(meanAt(sub.rho, indices), G.rho, 1e-9)).toBe(true);
});

test('kminFromRock: blank override falls back to the VRH mineral mix', () => {
  const quartzOnly = kminFromRock({ minerals: { quartz: 1, clay: 0 }, kminOverrideGPa: '' });
  expect(quartzOnly).toBeGreaterThan(30e9);
  expect(quartzOnly).toBeLessThan(45e9);
  expect(() => kminFromRock({ minerals: { quartz: 0 }, kminOverrideGPa: '' }))
    .toThrow(/zero/);
});

test('substituteInterval skips unphysical samples with the engine reason, never NaN-silently', async () => {
  const { model, zones } = await loadWell(makeInMemoryBackend(), 'KETA RP-1');
  const zone = zones.find((z) => z.name === 'BRINE SAND');
  const indices = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
  const flA = sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidA);
  const flB = sideFluid(DEFAULT_SCENARIO.conditions, DEFAULT_SCENARIO.fluidB);
  // a 5 GPa K_min against this rock forces the inverse's K_dry >= K_min
  // -> the engine rejects every sample and the glue reports the reason
  const sub = substituteInterval(model, indices, 5e9, flA, flB, 0.2);
  expect(sub.done).toBe(0);
  expect(sub.skipped).toBe(indices.length);
  expect(sub.firstError).toMatch(/K/);
  // and a gap sample is skipped without consuming an engine error
  const gappy = { ...model, vp: model.vp.slice() };
  gappy.vp[indices[0]] = NaN;
  const kmin = kminFromRock({ ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  const sub2 = substituteInterval(gappy, indices, kmin, flA, flB, 0.2);
  expect(sub2.done).toBe(indices.length - 1);
  expect(sub2.skipped).toBe(1);
  expect(sub2.firstError).toBeNull();
});

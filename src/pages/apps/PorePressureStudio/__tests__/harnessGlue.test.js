/**
 * P3 glue — the harness data path reproduces the oracle: the
 * in-memory backend's seeded curves (density deliberately stored in
 * G/C3, depth from the mudline) through prep's unit conversions and
 * the engine's computeProfile must land back on the goldens' pressure
 * arrays. This pins the JSON import, the mnemonic mapping and the
 * unit conversions — everything the e2e drives except the pixels.
 */

import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildProfileInput, slownessToUsPerM, densityToKgM3 } from '../services/prep';
import { computeProfile } from '../engine/profile';
import { fitNct } from '../engine/nct';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));
const W = G.well;
const P = W.params;

const close = (a, b, tol) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const PARAMS = {
  waterDepthM: P.water_depth_m,
  rhoSeawaterKgM3: P.rho_seawater,
  rhoFluidKgM3: P.rho_fluid,
  mudlineMdM: 0,
  nct: { dtMlUsPerM: P.dt_ml_us_per_m, dtMaUsPerM: P.dt_ma_us_per_m, cPerM: P.c_nct_per_m },
  method: 'eaton',
  eatonN: P.eaton_n,
  nu: P.nu,
};

async function loadInput(backend) {
  const wells = await backend.listWells();
  const logs = await backend.listLogs(wells[0].id);
  const mapped = mapLogs(logs);
  const [depth, dt, rho] = await Promise.all([
    backend.downloadCurve(mapped.DEPT),
    backend.downloadCurve(mapped.DT),
    backend.downloadCurve(mapped.RHOB),
  ]);
  return buildProfileInput(
    { depth: Array.from(depth), dt: Array.from(dt), rho: Array.from(rho) },
    { DT: mapped.DT.unit, RHOB: mapped.RHOB.unit },
    { mudlineMdM: 0 },
  );
}

test('backend -> prep -> engine reproduces the goldens well', async () => {
  const backend = makeInMemoryBackend();
  const input = await loadInput(backend);
  expect(input.zBmlM.length).toBe(W.z_bml_m.length);

  const r = computeProfile({ ...input, params: PARAMS });
  W.z_bml_m.forEach((z, i) => {
    // f64->f32? no — curves stay f64 here; tolerance covers the G/C3
    // round-trip (/1000 then *1000) and Math.pow vs Python **
    expect(close(r.overburdenPa[i], W.overburden_pa[i], 1e-9)).toBe(true);
    expect(close(r.hydrostaticPa[i], W.hydrostatic_pa[i], 1e-9)).toBe(true);
    expect(close(r.porePressurePa[i], W.pore_pressure_pa[i], 1e-9)).toBe(true);
    expect(close(r.fracPressurePa[i], W.frac_pressure_pa[i], 1e-9)).toBe(true);
  });
  expect(r.rhoSource.every((s) => s === 'log')).toBe(true);
});

test('NCT fit on hydrostatic-section picks recovers the generating trend', async () => {
  const backend = makeInMemoryBackend();
  const input = await loadInput(backend);
  // picks strictly above the ramp top: dt == dt_n there by construction
  const pickZ = [500, 1000, 1500, 2000];
  const picks = pickZ.map((z) => {
    const i = input.zBmlM.findIndex((v) => v === z);
    return { z: input.zBmlM[i], dt: input.dtUsPerM[i] };
  });
  const fit = fitNct(picks.map((p) => p.z), picks.map((p) => p.dt), P.dt_ma_us_per_m);
  expect(close(fit.dtMl, P.dt_ml_us_per_m, 1e-9)).toBe(true);
  expect(close(fit.c, P.c_nct_per_m, 1e-9)).toBe(true);
});

test('unit conversions: US/F sonic and KG/M3 density pass-through', () => {
  expect(close(slownessToUsPerM(100, 'US/F'), 100 / 0.3048, 1e-12)).toBe(true);
  expect(slownessToUsPerM(300, 'US/M')).toBe(300);
  expect(densityToKgM3(2.3, 'G/C3')).toBe(2300);
  expect(densityToKgM3(2300, 'KG/M3')).toBe(2300);
});

/**
 * Pore Pressure Studio U2 batch B (docs/upgrade/PorePressureStudio-UPGRADE.md).
 * Shipped functions only; each numeric test carries a negative control.
 */

import fs from 'fs';
import path from 'path';
import { datumToMudline, boundariesAlongHole } from '../services/alongHole';
import { layerCakeProfile } from '@/lib/velocityModels';
import { normalizeVelocity, layercakeDepthM } from '@/pages/apps/Seismolord/engine/velocityModel';
import { pseudoSonicFromLinearVelocity } from '../engine/velocitySource';
import { makeDepthFrame } from '../../../../../packages/engines/engines/welldata/checkshots';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'porepressure');
export const W = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).well;

// ---- U2-008 layer cake along the hole, seismic datum declared ------------------
describe('U2-008 layer cake sampled along a deviated hole', () => {
  const model = { type: 'layercake', layers: [{ v0: 1800, k: 0 }, { v0: 2600, k: 0.3 }] };
  const layers = normalizeVelocity(model).layers;
  // a boundary dipping east: 1,000 ms at the wellhead, +0.1 ms per metre east
  const surface = { x: 500000, y: 6700000 };
  const sampleAt = (x) => [1000 + 0.1 * (x - surface.x)];
  // a well building to 60 degrees east below 300 m TVD
  const frame = makeDepthFrame({ deviation: [{ md: 0, inc: 0, azi: 90 }, { md: 300, inc: 0, azi: 90 }, { md: 900, inc: 60, azi: 90 }, { md: 5000, inc: 60, azi: 90 }], kbM: 30 });
  const ctx = { kbM: 30 };
  const params = { waterDepthM: 100, mudlineMdM: 130, seismicDatumElevM: 0 };
  const xyAt = (srd) => (zBelowDatum) => {
    const hit = frame.tvdssToMd(zBelowDatum - srd);
    if (!hit) return null;
    const p = frame.mdToPosition(hit.md);
    return { x: surface.x + p.x, y: surface.y + p.y };
  };

  test('the boundary is read where the hole crosses it, and the times settle', () => {
    const r = boundariesAlongHole({
      sampleAt, depthsBelowDatum: (t) => t.map((v) => layercakeDepthM(layers, t, v)), xyAtDepthBelowDatum: xyAt(0), surface,
    });
    expect(r.converged).toBe(true);
    // the crossing: depth below datum of the boundary at the time read there, and the hole's position at that depth
    const z = layercakeDepthM(layers, r.boundaryTwtMs, r.boundaryTwtMs[0]);
    const p = xyAt(0)(z);
    expect(r.boundaryTwtMs[0]).toBeCloseTo(sampleAt(p.x)[0], 2);
    // negative control: the wellhead reading (the old sampling) is 1,000 ms; the hole is hundreds of metres east by then
    expect(r.boundaryTwtMs[0] - 1000).toBeGreaterThan(20);
    // and the profile below moves with it
    const along = layerCakeProfile(model, r.boundaryTwtMs, { datumToMudlineM: 100, zMaxM: 2000, stepM: 10 });
    const atHead = layerCakeProfile(model, [1000], { datumToMudlineM: 100, zMaxM: 2000, stepM: 10 });
    expect(along.layerTopsM[1]).toBeGreaterThan(atHead.layerTopsM[1] + 15);
  });

  test('a vertical well reads the wellhead value in one pass', () => {
    const vertical = (z) => ({ x: surface.x, y: surface.y, z });
    const r = boundariesAlongHole({ sampleAt, depthsBelowDatum: (t) => t.map((v) => layercakeDepthM(layers, t, v)), xyAtDepthBelowDatum: vertical, surface });
    expect(r.boundaryTwtMs[0]).toBe(1000);
    expect(r.iterations).toBe(1);
  });

  test('the seismic datum is declared: the mudline sits below the SRD by the SRD elevation plus the water depth', () => {
    expect(datumToMudline(params, ctx)).toMatchObject({ value: 100, mudlineElevM: -100 });
    expect(datumToMudline(params, ctx).note).toMatch(/taken at sea level \(SRD 0 m\)/);
    const srd = datumToMudline({ ...params, seismicDatumElevM: 50 }, ctx);
    expect(srd.value).toBe(150);
    expect(srd.note).toBeNull();
    // onshore: the ground is below the KB by the mudline MD
    expect(datumToMudline({ waterDepthM: 0, mudlineMdM: 8, seismicDatumElevM: 300 }, { kbM: 250 }).value).toBe(58);
    expect(datumToMudline({ waterDepthM: 0, mudlineMdM: 0 }, { kbM: null }).note).toMatch(/ground is taken at sea level/);
    // the trend reads its velocity 50 m deeper below the datum; negative control: sea level (the old datum) reads 30 m/s slower at 1,000 m bml
    const v = { v0: 2000, k: 0.6 };
    const at = (d) => pseudoSonicFromLinearVelocity(v, { datumToMudlineM: d, zMaxM: 1000, stepM: 1000 }).dtUsPerM[1];
    expect(1e6 / at(srd.value)).toBeCloseTo(2000 + 0.6 * (150 + 1000), 9);
    expect(1e6 / at(srd.value) - 1e6 / at(100)).toBeCloseTo(30, 9);
  });
});

// ---- U2-006 fit the method to the measured pressures ---------------------------
import { fitToCalibration, fitTarget, matchedPoints } from '../services/calibrate';
import { computeProfile } from '../engine/profile';

describe('U2-006 calibration that calibrates', () => {
  const params = {
    waterDepthM: 100, rhoSeawaterKgM3: 1025, rhoFluidKgM3: 1030, mudlineMdM: 130,
    nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, method: 'eaton', eatonN: 2.2, nu: 0.4, bowers: { A: 10, B: 0.75 },
  };
  const input = { zBmlM: W.z_bml_m, dtUsPerM: W.dt_us_per_m, rhoKgM3: W.rho_kg_m3 };
  // the measured pressures are the goldens' imposed ones (made with n = 3)
  const cal = [2700, 3000, 3300, 3700].map((z) => ({ z, pMpa: W.pore_pressure_pa[W.z_bml_m.indexOf(z)] / 1e6 }));

  test('Eaton n started at 2.2 is fitted back to 3 and the misfit drops to nothing', () => {
    const result = computeProfile({ ...input, params });
    expect(fitTarget(params).key).toBe('eatonN');
    expect(matchedPoints(cal, input, result)).toHaveLength(4);
    const r = fitToCalibration(params, input, result, cal);
    expect(r.params.eatonN).toBeCloseTo(3, 3);
    expect(r.rmsBeforeMpa).toBeGreaterThan(0.5);
    expect(r.rmsAfterMpa).toBeLessThan(0.001);
    expect(r.text).toMatch(/Fitted n 3.000 to 4 measured pressures: misfit RMS \d+\.\d\d MPa before, 0.00 MPa after/);
  });

  test('LOT points and points outside the prognosis are not fitted; with none it says so', () => {
    const result = computeProfile({ ...input, params });
    const r = fitToCalibration(params, input, result, [{ z: 3000, pMpa: 50, kind: 'lot' }, { z: 9000, pMpa: 90 }]);
    expect(r.error).toMatch(/needs a measured pressure/);
  });

  test('negative control: points 3 MPa high are not fitted to n = 3', () => {
    const result = computeProfile({ ...input, params });
    const r = fitToCalibration(params, input, result, cal.map((c) => ({ ...c, pMpa: c.pMpa + 3 })));
    expect(Math.abs(r.params.eatonN - 3)).toBeGreaterThan(0.2);
  });

  test('Bowers A and B fitted on loading points; U with sigma max held', () => {
    const bp = { ...params, method: 'bowers', bowers: { A: 14, B: 0.7 } };
    const result = computeProfile({ ...input, params: bp });
    const r = fitToCalibration(bp, input, result, cal);
    expect(r.params.bowers.A).not.toBe(14);
    expect(r.rmsAfterMpa).toBeLessThan(r.rmsBeforeMpa);
    const up = { ...params, method: 'bowers', bowers: { A: 10, B: 0.75, U: 2, sigmaMaxPa: 40e6 } };
    expect(fitTarget(up).key).toBe('bowersU');
    const ru = fitToCalibration(up, input, computeProfile({ ...input, params: up }), cal);
    expect(ru.rmsAfterMpa).toBeLessThanOrEqual(ru.rmsBeforeMpa + 1e-9);
  });
});

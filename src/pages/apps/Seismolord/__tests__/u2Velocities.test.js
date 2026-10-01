/**
 * U2-006: RMS (stacking) velocities to interval velocities (Dix), and
 * layer-cake models published to Mapping and Pore Pressure.
 *
 * Worked example (the Dix textbook case, built from its definition): three
 * flat layers with interval velocities 2000, 2500 and 3000 m/s between 0,
 * 1000, 1600 and 2000 ms TWT. Their RMS velocities, from the definition
 * Vrms^2(T) = sum(Vi^2 dti) / T, are 2000, 2200.85 and 2382.23 m/s, and the
 * reflector depths 1000, 1750 and 2350 m.
 */
import {
  parseRmsTable, dixIntervals, rmsFromIntervals, dixDepthM, fitLinearToDix, layerVelocitiesFromDix,
} from '../lib/dixVelocity';
import {
  volumeVelocity, velocityEntryFor, resolveLayerCake, boundariesOnSpec, boundariesAt, layerCakeProfile, boundarySurfaceFor,
} from '@/lib/velocityModels';
import { layercakeDepthM, twtMsToDepthM } from '../engine/velocityModel';
import { convertWithLayerCake, LAYER_CAKE_HOOK } from '@/pages/apps/MappingSurfaceStudio/services/depthConversion';

const LAYERS = [[0, 1000, 2000], [1000, 1600, 2500], [1600, 2000, 3000]];
const rmsByDefinition = () => {
  let acc = 0;
  return LAYERS.map(([t0, t1, v]) => { acc += v * v * (t1 - t0); return { twtMs: t1, vrms: Math.sqrt(acc / t1) }; });
};

describe('Dix: the worked example', () => {
  const picks = rmsByDefinition();

  test('the RMS velocities of the example', () => {
    expect(picks.map((p) => Math.round(p.vrms * 100) / 100)).toEqual([2000, 2200.85, 2382.23]);
  });

  test('Dix recovers the interval velocities and the depths', () => {
    const { intervals } = dixIntervals(picks);
    intervals.forEach((iv, i) => expect(iv.vint).toBeCloseTo(LAYERS[i][2], 9));
    expect(intervals.map((iv) => Math.round(iv.z1 * 1e6) / 1e6)).toEqual([1000, 1750, 2350]);
    expect(dixDepthM(intervals, 1300)).toBeCloseTo(1000 + 2500 * 0.15, 9);
    rmsFromIntervals(intervals).forEach((r, i) => expect(r.vrms).toBeCloseTo(picks[i].vrms, 9));
  });

  test('negative control: RMS velocities used as interval velocities put the 2000 ms reflector over 200 m shallow', () => {
    let z = 0; let tPrev = 0;
    for (const p of picks) { z += p.vrms * ((p.twtMs - tPrev) / 2000); tPrev = p.twtMs; }
    expect(2350 - z).toBeGreaterThan(200);
  });

  test('a single V0 + kZ through Dix depths of a true linear V(z) recovers it', () => {
    // instantaneous v(t) = v0 e^{k t} (one-way t) for V(z) = v0 + k z; Vrms from its definition
    const v0 = 1800; const k = 0.5;
    const ts = [400, 800, 1200, 1600, 2000, 2400];
    let acc = 0; let tPrev = 0;
    const rms = ts.map((T) => {
      const n = 2000;
      for (let i = 0; i < n; i++) {
        const t = tPrev + ((i + 0.5) / n) * (T - tPrev);
        const v = v0 * Math.exp(k * (t / 2000));
        acc += v * v * ((T - tPrev) / n);
      }
      tPrev = T;
      return { twtMs: T, vrms: Math.sqrt(acc / T) };
    });
    const { intervals } = dixIntervals(rms);
    for (const iv of intervals) expect(Math.abs(iv.z1 - twtMsToDepthM(iv.t1, { v0, k })) / iv.z1).toBeLessThan(0.002);
    const fit = fitLinearToDix(intervals);
    expect(Math.abs(fit.v0 - v0) / v0).toBeLessThan(0.02);
    expect(Math.abs(fit.k - k)).toBeLessThan(0.05);
  });

  test('layer velocities: the time-weighted mean interval velocity per layer', () => {
    const { intervals } = dixIntervals(picks);
    // layer 1 from 0 to 1300 ms: 1000 ms at 2000 and 300 ms at 2500
    const lv = layerVelocitiesFromDix(intervals, [1300]);
    expect(lv[0]).toBeCloseTo((2000 * 1000 + 2500 * 300) / 1300, 9);
    expect(lv[1]).toBeCloseTo((2500 * 300 + 3000 * 400) / 700, 9);
  });
});

describe('Dix: hostile input (PL2, PL3)', () => {
  test('units are declared at the door: seconds and feet per second convert', () => {
    const { picks, skipped } = parseRmsTable('TWT (s)\tVrms (ft/s)\n1.0\t6561.68\n1,6 7220.6\nbad line\n', { timeUnit: 's', velocityUnit: 'ft/s' });
    expect(picks[0].twtMs).toBe(1000);
    expect(picks[0].vrms).toBeCloseTo(2000, 2);
    expect(picks[1].twtMs).toBeCloseTo(1600, 9);           // decimal comma
    expect(picks[1].vrms).toBeCloseTo(2200.84, 1);
    expect(skipped.map((k) => k.line)).toEqual([4]);
    expect(parseRmsTable('1000,2000\n1600, 2201').picks).toEqual([{ twtMs: 1000, vrms: 2000 }, { twtMs: 1600, vrms: 2201 }]);
  });

  test('inconsistent picks are refused by name, never clamped', () => {
    expect(() => dixIntervals([{ twtMs: 1000, vrms: 2400 }, { twtMs: 1100, vrms: 1500 }])).toThrow(/Between 1000 and 1100 ms the RMS velocities give no real interval velocity/);
    expect(() => dixIntervals([{ twtMs: 1000, vrms: 2000 }, { twtMs: 900, vrms: 2100 }])).toThrow(/times must increase/);
    expect(() => dixIntervals([{ twtMs: 0, vrms: 2000 }])).toThrow(/must be positive/);
  });
});

describe('the published velocity contract', () => {
  const layercake = { type: 'layercake', layers: [{ v0: 1800, k: 0.2, base_horizon_id: 'h1' }, { v0: 2600, k: 0.1 }] };

  test('the row model wins over the manifest once the row is authoritative (W0.2)', () => {
    const row = { id: 'v1', name: 'KETA 3D', interp_rev: 3, velocity_model: { v0: 2100, k: 0.4 } };
    expect(volumeVelocity(row, { velocity: { v0: 1500, k: 0 } }).velocity).toEqual({ v0: 2100, k: 0.4 });
    // negative control: the manifest-only readers saw the stale model
    expect({ v0: 1500, k: 0 }).not.toEqual(volumeVelocity(row, { velocity: { v0: 1500, k: 0 } }).velocity);
    expect(volumeVelocity({ interp_rev: 0 }, { velocity: { v0: 1500, k: 0 } }).velocity).toEqual({ v0: 1500, k: 0 });
    const e = velocityEntryFor({ id: 'v1', name: 'KETA 3D', interp_rev: 1, velocity_model: layercake }, null);
    expect(e).toMatchObject({ kind: 'layercake', boundaries: [{ layer: 0, horizonId: 'h1' }] });
  });

  const spec = { x0: 0, y0: 0, dx: 100, dy: 100, nx: 4, ny: 3 };
  const boundaryGrid = Float32Array.from({ length: 12 }, (_, i) => 1200 + 10 * (i % 4)); // dips east
  const surfaces = [
    { id: 's-old', name: 'Base L1 (old)', z_domain: 'time', created_at: '2026-01-01', provenance: { app: 'seismolord', horizon: { id: 'h1' } }, origin_x: 0, origin_y: 0, dx: 100, dy: 100, nx: 4, ny: 3 },
    { id: 's-new', name: 'Base L1 (TWT ms)', z_domain: 'time', created_at: '2026-09-30', provenance: { app: 'seismolord', horizon: { id: 'h1' } }, origin_x: 0, origin_y: 0, dx: 100, dy: 100, nx: 4, ny: 3 },
    { id: 's-depth', name: 'Base L1 (depth ft)', z_domain: 'depth', created_at: '2026-10-01', provenance: { app: 'seismolord', horizon: { id: 'h1' } } },
  ];
  const entry = velocityEntryFor({ id: 'v1', name: 'KETA 3D', interp_rev: 1, velocity_model: layercake }, null);

  test('a boundary not published is named, never skipped', async () => {
    const r = await resolveLayerCake(entry, { surfaces: [], downloadGrid: async () => boundaryGrid });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/layer 1 base \(horizon h1\) is not.*Publish boundaries/);
    expect(LAYER_CAKE_HOOK(entry, { resolved: r, spec }).reason).toBe(r.reason);
  });

  test('Mapping: the newest published time surface, onto the frame, the Seismolord engine node by node', async () => {
    expect(boundarySurfaceFor(surfaces, 'h1').id).toBe('s-new');
    const r = await resolveLayerCake(entry, { surfaces, downloadGrid: async () => boundaryGrid });
    expect(r.ok).toBe(true);
    const hook = LAYER_CAKE_HOOK(entry, { resolved: r, spec });
    expect(hook.ok).toBe(true);
    const twt = Float32Array.from({ length: 12 }, () => 1600);
    const z = convertWithLayerCake({ twtMs: twt, model: layercake, boundaryTwtMs: hook.boundaryTwtMs });
    for (let i = 0; i < 12; i++) {
      expect(z[i]).toBeCloseTo(-layercakeDepthM([{ v0: 1800, k: 0.2 }, { v0: 2600, k: 0.1 }], [boundaryGrid[i]], 1600), 6);
    }
    expect(z[3]).not.toBeCloseTo(z[0], 0);   // the boundary dips, so the depth does
    expect(boundariesOnSpec(r, spec)[0][5]).toBeCloseTo(1210, 9);
    expect(boundariesAt(r, 250, 100)[0]).toBeCloseTo(1225, 9);
    expect(boundariesAt(r, 5000, 5000)[0]).toBeNull();
  });

  test('Pore Pressure: the layer-cake profile at a well agrees with the engine (time integral of the slowness)', () => {
    const layers = [{ v0: 1800, k: 0.2 }, { v0: 2600, k: 0.1 }];
    const prof = layerCakeProfile(layercake, [1200], { datumToMudlineM: 100, zMaxM: 3000, stepM: 1 });
    // integrate dt = 2 dz / V from the datum (the water column at layer 1 too) and compare with the engine
    const zTop = layercakeDepthM(layers, [1200], 1200);
    expect(prof.layerTopsM[1]).toBeCloseTo(zTop, 9);
    let t = 0;
    // water column: layer 1 velocity from the datum down to the mudline (100 m)
    const wN = 1000;
    for (let i = 0; i < wN; i++) t += (2 * (100 / wN)) / (1800 + 0.2 * ((i + 0.5) * (100 / wN)));
    for (let s = 1; s < prof.zBmlM.length; s++) {
      t += 2 * ((prof.dtUsPerM[s - 1] + prof.dtUsPerM[s]) / 2e6) * (prof.zBmlM[s] - prof.zBmlM[s - 1]);
      if (s % 500 === 0) {
        const z = 100 + prof.zBmlM[s];
        expect(Math.abs(layercakeDepthM(layers, [1200], t * 1000) - z)).toBeLessThan(0.5);
      }
    }
    // negative control: a single V(z) with the first layer's v0, k misses the deep section by far more
    expect(Math.abs(twtMsToDepthM(t * 1000, { v0: 1800, k: 0.2 }) - (100 + prof.zBmlM[prof.zBmlM.length - 1]))).toBeGreaterThan(50);
  });
});

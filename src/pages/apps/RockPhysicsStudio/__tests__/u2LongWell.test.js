/**
 * RP-U2-014 (PL10, 2026-10-01): long wells. Min/max decimation keeps a
 * one-sample spike that every-k-th thinning steps over (negative control),
 * and the engines' fast Greenberg-Castagna path gives the reference
 * composite's Vs on every sample of the 5000 m well, bit for bit.
 */
import { mapLogs, buildModel } from '../services/prep';
import { minMaxDecimate } from '../services/decimate';
import { gcSandShaleVs, greenbergCastagnaVs, gcLithVs } from '../engine/vsEstimate';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

describe('U2-014 long wells', () => {
  test('min/max decimation keeps a one-sample spike; every k-th thinning steps over it', () => {
    const n = 30000;
    const vp = new Float64Array(n);
    for (let i = 0; i < n; i++) vp[i] = 3000 + 50 * Math.sin(i / 40);
    vp[17777] = 6000; // a thin fast streak
    vp[4321] = 1500;  // a washout
    const idx = Array.from({ length: n }, (_, i) => i);
    const dec = minMaxDecimate(idx, vp, 2000);
    expect(dec.decimated).toBe(true);
    expect(dec.buckets).toBe(1000);
    expect(dec.indices.length).toBeLessThanOrEqual(2000);
    expect(dec.indices).toContain(17777);
    expect(dec.indices).toContain(4321);
    // depth order kept
    for (let k = 1; k < dec.indices.length; k++) expect(dec.indices[k]).toBeGreaterThan(dec.indices[k - 1]);
    // negative control: U1's every-k-th thinning misses both
    const step = Math.ceil(n / 2000);
    const kth = idx.filter((_, k) => k % step === 0);
    expect(kth.includes(17777) || kth.includes(4321)).toBe(false);
    // short series pass through; gaps keep the line breakable
    expect(minMaxDecimate([1, 2, 3], vp, 2000)).toEqual({ indices: [1, 2, 3], buckets: 3, decimated: false });
    const gaps = new Float64Array(100).fill(NaN);
    expect(minMaxDecimate(Array.from({ length: 100 }, (_, i) => i), gaps, 10).indices).toHaveLength(5);
  });

  test('the 5000 m well: the fast Greenberg-Castagna path gives the reference Vs on all 32,809 samples', async () => {
    const backend = makeInMemoryBackend({ long: true });
    const well = (await backend.listWells()).find((w) => w.name === 'LONG RP-3 (5000 m)');
    const logs = await backend.listLogs(well.id);
    const mapped = mapLogs(logs);
    const curves = {};
    for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
    const t0 = Date.now();
    const model = buildModel(curves, mapped);
    const buildMs = Date.now() - t0;
    expect(model.n).toBe(32809);
    const t1 = Date.now();
    let differing = 0;
    for (let i = 0; i < model.n; i++) {
      const vp = model.vp[i]; const v = Math.min(1, Math.max(0, model.vsh[i]));
      const ref = !Number.isFinite(vp) ? NaN : v === 0 ? gcLithVs(vp, 'sandstone') : v === 1 ? gcLithVs(vp, 'shale') : greenbergCastagnaVs(vp, { sandstone: 1 - v, shale: v });
      if (!Object.is(ref, model.vs[i])) differing += 1;
    }
    const refMs = Date.now() - t1;
    const t2 = Date.now();
    for (let i = 0; i < model.n; i++) gcSandShaleVs(model.vp[i], model.vsh[i]);
    const fastMs = Date.now() - t2;
    expect(differing).toBe(0);
    // eslint-disable-next-line no-console
    console.log(`U2-014 timing (32,809 samples): buildModel ${buildMs} ms; Greenberg-Castagna reference ${refMs} ms, fast path ${fastMs} ms`);
    expect(fastMs).toBeLessThan(refMs + 50);
  });
});

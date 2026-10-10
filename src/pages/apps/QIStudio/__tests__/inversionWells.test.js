import { prepareWell, pickCurve, volumeFrame } from '../services/inversionWells';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const frameOf = () => makeInMemoryBackend().loadVolumeFrame();

describe('inversion wells', () => {
  test('a complete well: ln(AI) on the volume axis, its trace and the curves named', async () => {
    const b = makeInMemoryBackend();
    const [w1] = await b.listWells();
    const loaded = await b.loadWell(w1);
    const r = await prepareWell(loaded, await frameOf(), b.downloadCurve);
    expect(r.ok).toBe(true);
    expect([r.il, r.xl]).toEqual([5, 8]); // surface (200, 125) on a 25 m grid, inline along y
    expect(r.ln_ai).toHaveLength(600);
    expect(r.curves).toBe('DT and RHOB');
    expect(r.timeSource).toBe('imported checkshots');
    // AI = rho * v: about 2.4 g/cc times 3000 to 3500 m/s
    const live = r.ln_ai.filter(Number.isFinite).map(Math.exp);
    expect(Math.min(...live)).toBeGreaterThan(6000);
    expect(Math.max(...live)).toBeLessThan(10000);
    // the log runs from 1470 m TVDSS but the first checkshot is at 1500 m (1300 ms):
    // above it the time-depth is extrapolated, so the log starts at the checkshot
    // (before 2026-10-10 it started near 1276 ms on the extrapolated times)
    const first = r.ln_ai.findIndex(Number.isFinite);
    expect(first * 4).toBeGreaterThanOrEqual(1300);
    expect(first * 4).toBeLessThan(1310);
    expect(r.timeControl).toEqual({ fromTvdssM: 1500, toTvdssM: 2400 });
  });
  test('the control range is the imported checkshots, even when a derived tie set reaches shallower', async () => {
    const { controlRange } = await import('../services/inversionWells');
    const imported = [{ tvdss_m: 137.6, twt_ms: 152 }, { tvdss_m: 1600, twt_ms: 1400 }];
    const derived = [{ tvdss_m: 35, twt_ms: 51 }, { tvdss_m: 1700, twt_ms: 1460 }];
    expect(controlRange({ checkshots: imported }, derived)).toEqual([137.6, 1600]);
    expect(controlRange({ checkshots: [] }, derived)).toEqual([35, 1700]);
    expect(controlRange({}, [])).toEqual([-Infinity, Infinity]);
  });
  test('property curves are clipped to the control range too', async () => {
    const b = makeInMemoryBackend();
    const [w1] = await b.listWells();
    const r = await prepareWell(await b.loadWell(w1), await frameOf(), b.downloadCurve, { extras: ['porosity'] });
    const first = r.porosity.values.findIndex(Number.isFinite);
    expect(first * 4).toBeGreaterThanOrEqual(1300);
  });
  test('wells that cannot be used say why', async () => {
    const b = makeInMemoryBackend();
    const [, w2, w3] = await b.listWells();
    const r2 = await prepareWell(await b.loadWell(w2), await frameOf(), b.downloadCurve);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toMatch(/time-depth/);
    const r3 = await prepareWell(await b.loadWell(w3), await frameOf(), b.downloadCurve);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toMatch(/depth reference/);
  });
  test('a digitized curve is used only when nothing else exists, and is named', () => {
    const logs = [{ mnemonic: 'RHOB_DIG', start_md_m: 0, stop_md_m: 3000, provenance: { digitized: true } }, { mnemonic: 'RHOB', start_md_m: 1000, stop_md_m: 1100 }];
    expect(pickCurve(logs, 'density').log.mnemonic).toBe('RHOB');
    expect(pickCurve(logs.slice(0, 1), 'density').edit).toBe('digitized');
  });
  test('volumeFrame refuses a manifest with no geometry', () => {
    expect(() => volumeFrame({})).toThrow(/geometry/);
  });
});

describe('property curves in time', () => {
  const { nearestToDt, porosityFraction, pickFaciesCurve } = require('../services/inversionWells');
  test('codes go to the nearest sample in time, never interpolated', () => {
    expect(nearestToDt([0, 5, 9, 14], [1, 3, 3, 2], 4, 5)).toEqual([1, 3, 3, 2, NaN]);
  });
  test('porosity: nulls dropped and percent becomes a fraction', () => {
    expect(porosityFraction([-999.25, 21, 19, 25])).toEqual([NaN, 0.21, 0.19, 0.25]);
    expect(porosityFraction([0.2, 0.3, 0.25])).toEqual([0.2, 0.3, 0.25]);
  });
  test('the facies curve and its names from the write-back provenance', () => {
    const f = pickFaciesCurve([{ mnemonic: 'GR' }, { mnemonic: 'RP_FACIES', provenance: { kind: 'facies', codes: [{ code: 1, name: 'gas sand' }, { code: 2, name: 'shale' }] } }]);
    expect(f.names).toEqual({ 1: 'gas sand', 2: 'shale' });
    expect(pickFaciesCurve([{ mnemonic: 'GR' }])).toBeNull();
  });
  test('a well read with porosity and facies', async () => {
    const b = makeInMemoryBackend();
    const [w1] = await b.listWells();
    const loaded = await b.loadWell(w1);
    loaded.logs = [...loaded.logs, { id: 'f1', mnemonic: 'RP_FACIES', start_md_m: 1500, stop_md_m: 2800, step_m: 0.5, provenance: { kind: 'facies', codes: [{ code: 1, name: 'sand' }, { code: 2, name: 'shale' }] } }];
    const dl = async (l) => (l.mnemonic === 'RP_FACIES' ? Float32Array.from({ length: 2601 }, (_, i) => (i % 400 < 200 ? 1 : 2)) : b.downloadCurve(l));
    const r = await prepareWell(loaded, await frameOf(), dl, { extras: ['porosity', 'facies'] });
    expect(r.porosity.curve).toBe('PHIE');
    expect(r.porosity.values).toHaveLength(600);
    expect(new Set(r.facies.values.filter(Number.isFinite))).toEqual(new Set([1, 2]));
    expect(r.facies.names).toEqual({ 1: 'sand', 2: 'shale' });
  });
});

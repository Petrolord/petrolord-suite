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

// F3 benchmark F-2 (QI round 3, 2026-10-15): prepareWell compares the well's
// CRS tag with the volume's before placing it. A well in another known CRS is
// converted (as Seismolord's displays do); an untagged one is placed with a
// note; a local grid against a projected CRS is refused. Negative control:
// the same coordinates read as if they were already in the volume's CRS (the
// behaviour before) land on another trace or off the survey.
describe('well CRS against the volume (F-2)', () => {
  const setup = async () => {
    const { transformPoint } = await import('@/lib/crs');
    const b = makeInMemoryBackend();
    const [w1] = await b.listWells();
    const loaded = await b.loadWell(w1);
    const src = { x: 450000, y: 5900000 }; // EPSG:32631 (F3 is in UTM 31N)
    const inVol = transformPoint('EPSG:32631', 'EPSG:32630', src.x, src.y);
    const frame0 = await frameOf();
    // the volume (EPSG:32630) has the well's converted position at inline 5, crossline 8
    const frame = { ...frame0, crs: 'EPSG:32630', affine: { ...frame0.affine, origin: { x: inVol.x - 200, y: inVol.y - 125 } } };
    const withCrs = (crs, xy = src) => ({ ...loaded, well: { ...loaded.well, crs, surface_x: xy.x, surface_y: xy.y } });
    return { b, loaded, frame, withCrs, src, inVol };
  };
  test('another known CRS is converted to the volume\'s and lands on the right trace', async () => {
    const { b, frame, withCrs, src, inVol } = await setup();
    expect(Math.hypot(inVol.x - src.x, inVol.y - src.y)).toBeGreaterThan(1000);
    const r = await prepareWell(withCrs('EPSG:32631'), frame, b.downloadCurve);
    expect(r.ok).toBe(true);
    expect([r.il, r.xl]).toEqual([5, 8]);
    expect(r.crs.status).toBe('converted');
    expect(r.crs.note).toMatch(/EPSG:32631.*EPSG:32630.*converted/);
    // negative control: the same numbers taken as EPSG:32630 (no conversion) do not land there
    const wrong = await prepareWell(withCrs('EPSG:32630'), frame, b.downloadCurve);
    expect(wrong.ok && wrong.il === 5 && wrong.xl === 8).toBe(false);
  });
  test('the same CRS places as before, with no note', async () => {
    const { b, frame, withCrs, inVol } = await setup();
    const r = await prepareWell(withCrs('EPSG:32630', inVol), frame, b.downloadCurve);
    expect([r.il, r.xl]).toEqual([5, 8]);
    expect(r.crs).toEqual({ status: 'same' });
  });
  test('an untagged well is placed unverified with a note; a local grid is refused', async () => {
    const { b, frame, withCrs, inVol } = await setup();
    const r = await prepareWell(withCrs(null, inVol), frame, b.downloadCurve);
    expect(r.ok).toBe(true);
    expect(r.crs.status).toBe('unverified');
    expect(r.crs.note).toMatch(/the well has no CRS \(the volume is in EPSG:32630\)/);
    const loc = await prepareWell(withCrs('LOCAL', inVol), frame, b.downloadCurve);
    expect(loc.ok).toBe(false);
    expect(loc.reason).toMatch(/local grid cannot be placed/);
  });
  test('volumeFrame reads the CRS tag from the manifest\'s crs block', () => {
    const g = { dt_us: 4000, il: { count: 2 }, xl: { count: 2 }, ns: 10, corners: [[0, 0], [1, 0], [0, 1]] };
    expect(volumeFrame({ geometry: { ...g, crs: { project: 'EPSG:32631', native: 'EPSG:23031' } } }).crs).toBe('EPSG:32631');
    expect(volumeFrame({ geometry: g }).crs).toBe(null);
  });
});

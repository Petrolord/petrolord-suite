// U2-002 seismic backdrop along a Well Correlation section path.
// The real traverse engine reads the synthetic KETA 3D volume through the
// sample section wells; each well is anchored on its own trace and the
// trace there is the volume's own (bit for bit).
import {
  backdropPath, assembleSectionBackdrop, BACKDROP_MAX_TRACES, liveRms,
} from '@/pages/apps/Seismolord/services/sectionBackdrop';
import {
  backdropBlocked, backdropSpans, backdropRgba, anchorCols,
} from '@/components/wells/section/seismicBackdrop';
import { describeBackdrop } from '@/components/wells/section/useSeismicBackdrop';
import { KETA3D, ketaBrickSource, ketaAmplitude } from '@/pages/apps/WellCorrelation/services/sampleSeismic';
import { makeInMemoryBackend } from '@/pages/apps/WellCorrelation/services/inMemoryBackend';

const WELLS = [
  { id: 'a', name: 'KETA-1', surface_x: 501000, surface_y: 6700200 },
  { id: 'b', name: 'KETA-2', surface_x: 502200, surface_y: 6700600 },
  { id: 'c', name: 'KETA-3', surface_x: 503500, surface_y: 6700400 },
];
const { geom } = ketaBrickSource();
const G = KETA3D.geometry;

describe('backdropPath', () => {
  test('anchors each well on the trace at its location, in section order', () => {
    const p = backdropPath(WELLS, { geometry: G, geom });
    expect(p.error).toBeUndefined();
    const at = p.anchors.map((a) => p.positions[a.col]);
    // (x - 500000) / 50 = xl, (y - 6699000) / 50 = il
    expect(at).toEqual([{ il: 24, xl: 20 }, { il: 32, xl: 44 }, { il: 28, xl: 70 }]);
    expect(p.anchors.map((a) => a.col)).toEqual([...p.anchors.map((a) => a.col)].sort((x, y) => x - y));
    expect(p.positions[0]).toEqual({ il: 24, xl: 20 });
    expect(Math.abs(p.stepM - 50)).toBeLessThan(1); // one crossline bin of ground distance
  });

  test('hostile wells are named with the reason (PL2, PL4)', () => {
    const p = backdropPath([
      ...WELLS,
      { id: 'd', name: 'FAR-1', surface_x: 900000, surface_y: 6700000 },
      { id: 'e', name: 'NOLOC', surface_x: null, surface_y: null },
      { id: 'f', name: 'GRID-1', surface_x: 501500, surface_y: 6700000, crs: 'LOCAL' },
    ], { geometry: G, geom, volumeCrs: 'EPSG:32631' });
    const why = Object.fromEntries(p.skipped.map((s) => [s.name, s.reason]));
    expect(why['FAR-1']).toBe('outside the survey');
    expect(why.NOLOC).toBe('no surface location');
    expect(why['GRID-1']).toMatch(/local grid/);
    expect(p.anchors).toHaveLength(3);
  });

  test('fewer than two wells on the survey is refused with the reason', () => {
    const p = backdropPath([WELLS[0], { id: 'd', name: 'FAR-1', surface_x: 900000, surface_y: 1 }], { geometry: G, geom });
    expect(p.error).toMatch(/needs two section wells on the survey; 1 is on it/);
  });

  test('a path longer than the cap is refused, not truncated', () => {
    const wide = {
      ...G, xl: { ...G.xl, count: 9000 }, affine: G.affine,
    };
    const p = backdropPath([
      { id: 'a', name: 'W', surface_x: 500000, surface_y: 6700000 },
      { id: 'b', name: 'E', surface_x: 500000 + 8999 * 50, surface_y: 6700000 },
    ], { geometry: wide, geom: { ...geom, nXl: 9000 } });
    expect(p.error).toMatch(new RegExp(`draws up to ${BACKDROP_MAX_TRACES}`));
  });
});

describe('assembleSectionBackdrop reads the volume through the traverse engine', () => {
  test('the trace at each well is the volume trace there, bit for bit', async () => {
    const { getBrick } = ketaBrickSource();
    const bd = await assembleSectionBackdrop({
      getBrick, geom, geometry: G, wells: WELLS,
    });
    expect(bd.ns).toBe(500);
    expect(bd.dtMs).toBe(4);
    const pos = [{ il: 24, xl: 20 }, { il: 32, xl: 44 }, { il: 28, xl: 70 }];
    bd.anchors.forEach((a, k) => {
      for (const s of [0, 100, 343, 499]) {
        expect(bd.data[a.col * bd.ns + s]).toBe(Math.fround(ketaAmplitude(pos[k].il, pos[k].xl, s)));
      }
    });
    // the Dome event peaks at the sample surface TWT under KETA-1 (1373 ms)
    const col = bd.anchors[0].col;
    let best = 0;
    for (let s = 1; s < bd.ns; s++) if (bd.data[col * bd.ns + s] > bd.data[col * bd.ns + best]) best = s;
    expect(Math.abs(best * 4 - 1373)).toBeLessThanOrEqual(4);
    expect(bd.rms).toBeCloseTo(liveRms(bd.data), 12);
    expect(bd.rms).toBeGreaterThan(0);
  });

  test('negative control: a section in another order anchors other traces', async () => {
    const { getBrick } = ketaBrickSource();
    const fwd = await assembleSectionBackdrop({ getBrick, geom, geometry: G, wells: WELLS });
    const rev = await assembleSectionBackdrop({ getBrick, geom, geometry: G, wells: [...WELLS].reverse() });
    expect(rev.anchors.map((a) => a.name)).toEqual(['KETA-3', 'KETA-2', 'KETA-1']);
    // KETA-1 is the first trace of one and the last of the other
    const k1f = fwd.anchors[0].col;
    const k1r = rev.anchors[2].col;
    expect(k1f).toBe(0);
    expect(k1r).toBe(rev.nTraces - 1);
    expect(rev.data.subarray(k1r * 500, k1r * 500 + 500)).toEqual(fwd.data.subarray(0, 500));
  });

  test('the in-memory Well Correlation backend serves it (the harness path)', async () => {
    const b = makeInMemoryBackend();
    const [vol] = await b.listSeismicVolumes();
    expect(vol.name).toBe('KETA 3D');
    const bd = await b.loadSeismicBackdrop(vol, WELLS);
    expect(bd.anchors).toHaveLength(3);
    expect(describeBackdrop(bd)).toMatch(/^Seismic backdrop from KETA 3D through 3 wells, \d+ traces \(\d+\.\d\d km\)\. Read only\.$/);
  });
});

describe('section kit: gaps, image and when it is drawn', () => {
  const boxes = [{ x0: 100, w: 80 }, { x0: 300, w: 80 }, { x0: 500, w: 80 }];

  test('column centres map to the anchor traces; tracks keep their columns', () => {
    const spans = backdropSpans(boxes, [true, true, true], [0, 30, 60]);
    expect(spans).toHaveLength(2);
    // centre of column 0 is x 140 (trace 0), centre of column 1 x 340 (trace 30): 0.15 trace per px
    expect(spans[0].dx0).toBe(180);
    expect(spans[0].dx1).toBe(300);
    expect(spans[0].sx0).toBeCloseTo(6, 9);
    expect(spans[0].sx1).toBeCloseTo(24, 9);
    // a well not on the backdrop is stepped over
    const gap = backdropSpans(boxes, [true, true, true], [0, null, 60]);
    expect(gap).toHaveLength(1);
    expect(gap[0].dx0).toBe(180);
    expect(gap[0].dx1).toBe(500);
    expect(anchorCols([{ id: 'x' }, { id: 'y' }], { anchors: [{ id: 'y', col: 4 }] })).toEqual([null, 4]);
  });

  test('drawn only on a structural TWT section, otherwise says why', () => {
    expect(backdropBlocked({ depthRef: 'twt', datumMode: 'structural' })).toBeNull();
    expect(backdropBlocked({ depthRef: 'tvdss', datumMode: 'structural' })).toMatch(/set the depth reference to TWT/);
    expect(backdropBlocked({ depthRef: 'twt', datumMode: 'flatten' })).toMatch(/flattened or stretched/);
  });

  test('image: nulls transparent, symmetric about zero, clipped', () => {
    const NULL = Math.fround(1e30);
    const rgba = backdropRgba({
      data: Float32Array.from([1, -1, 0, NULL, 10, -10]), ns: 3, nTraces: 2, rms: 1,
    }, 3);
    const px = (t, s) => Array.from(rgba.slice((s * 2 + t) * 4, (s * 2 + t) * 4 + 4));
    expect(px(0, 0)[0]).toBe(255);               // positive: red
    expect(px(0, 1)[2]).toBe(255);               // negative: blue
    expect(px(0, 0)[1]).toBe(px(0, 1)[1]);       // symmetric
    expect(px(0, 2)).toEqual([255, 255, 255, 200]);
    expect(px(1, 0)[3]).toBe(0);                 // null
    expect(px(1, 1)).toEqual([255, 0, 0, 200]);  // clipped at 3 x RMS
  });
});

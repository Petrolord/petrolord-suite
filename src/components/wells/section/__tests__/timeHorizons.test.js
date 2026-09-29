/**
 * AppUpgrade WC-U2-003: TWT from checkshots and seismic horizons at the wells
 * (shared section kit). Negative control: on origin/main there is no 'twt'
 * reference (depthOfFor returns MD) and no horizons module.
 */
import { twtAtTvdss, tvdssAtTwt, checkshotRange } from '../timeDepth';
import { depthOfFor, mdFromDisplayed, frameNotes, DEPTH_REFS } from '../sectionFrame';
import { sampleSurface, horizonAtWell, horizonCandidates, horizonLabel } from '../horizons';
import { makeDepthFrame } from '@/pages/apps/WellDataManager/engine/checkshots';

const CS = [{ tvdss_m: 0, twt_ms: 0 }, { tvdss_m: 1000, twt_ms: 950 }, { tvdss_m: 2000, twt_ms: 1850 }];

describe('time-depth through checkshots', () => {
  test('linear between stations, unknown outside them', () => {
    expect(twtAtTvdss(CS, 1500)).toBeCloseTo(1400, 9);
    expect(tvdssAtTwt(CS, 1400)).toBeCloseTo(1500, 9);
    expect(twtAtTvdss(CS, 2100)).toBeNaN();
    expect(twtAtTvdss([], 100)).toBeNaN();
    expect(checkshotRange(CS)).toMatchObject({ top: 0, base: 2000, n: 3 });
  });

  test('TWT is a section reference: MD -> TVDSS (survey, KB) -> TWT and back', () => {
    expect(DEPTH_REFS).toContain('twt');
    const dev = [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 1750, inc: 30, azi: 90 }];
    const well = { kb_m: 30, checkshots: CS, frame: makeDepthFrame({ deviation: dev, kbM: 30 }) };
    const t = depthOfFor(well, 'twt')(1700);
    const tvdss = well.frame.mdToTvdss(1700).tvdss;
    expect(t).toBeCloseTo(950 + ((tvdss - 1000) / 1000) * 900, 9);
    expect(mdFromDisplayed(t, 0, well, 'twt').md).toBeCloseTo(1700, 6);
    const vertical = { kb_m: 30, checkshots: CS, frame: null };
    expect(depthOfFor(vertical, 'twt')(1530)).toBeCloseTo(1400, 9); // TVDSS 1500
    expect(frameNotes({ kb_m: 30, checkshots: [] }, 'twt')).toEqual(['no checkshots: not drawn in time']);
  });
});

describe('a horizon at each well', () => {
  const spec = { origin_x: 1000, origin_y: 2000, dx: 100, dy: 100, nx: 5, ny: 5, rotation_deg: 0, null_value: 1e30, crs: 'EPSG:32631', xy_unit: 'm' };
  const plane = (f) => { const g = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) g.push(f(1000 + c * 100, 2000 + r * 100)); return g; };

  test('bilinear sampling honours rotation and nulls', () => {
    const g = plane((x, y) => x + 10 * y);
    expect(sampleSurface(spec, g, 1150, 2250)).toBeCloseTo(1150 + 22500, 6);
    expect(sampleSurface(spec, g, 900, 2000)).toBeNull();
    const rot = { ...spec, rotation_deg: 90 }; // local x runs north
    const gl = plane((x) => x - 1000); // value = local column * 100
    expect(sampleSurface(rot, gl, 1000, 2300)).toBeCloseTo(300, 6);
    const holes = plane(() => 5); holes[6] = 1e30;
    expect(sampleSurface(spec, holes, 1150, 2150)).toBeNull();
  });

  test('a depth horizon (elevation ft) lands at MD through the KB of a vertical well', () => {
    const row = { ...spec, z_domain: 'depth', z_unit: 'ft' };
    const g = plane(() => -1500 / 0.3048);
    const hit = horizonAtWell(row, g, { name: 'A', surface_x: 1200, surface_y: 2200, crs: 'EPSG:32631', xy_unit: 'm', kb_m: 25, frame: null, checkshots: CS });
    expect(hit.md).toBeCloseTo(1525, 6);
    expect(hit.twt).toBeCloseTo(1400, 6);
  });

  test('on a deviated well the horizon is sampled under the borehole, not the rig', () => {
    // dips 0.5 m per m east; the well drifts east below 500 m
    const row = { ...spec, origin_x: 0, origin_y: 0, dx: 250, dy: 250, nx: 9, ny: 9, z_domain: 'depth', z_unit: 'm' };
    const g = []; for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) g.push(-(1000 + 0.5 * c * 250));
    const frame = makeDepthFrame({ deviation: [{ md: 0, inc: 0, azi: 90 }, { md: 500, inc: 0, azi: 90 }, { md: 1500, inc: 40, azi: 90 }], kbM: 0 });
    const hit = horizonAtWell(row, g, { name: 'D', surface_x: 0, surface_y: 1000, crs: 'EPSG:32631', xy_unit: 'm', kb_m: 0, frame });
    const pos = frame.mdToPosition(hit.md);
    expect(pos.tvdss).toBeCloseTo(1000 + 0.5 * pos.x, 1); // on the plane where the hole is
    expect(pos.x).toBeGreaterThan(50); // the rig answer (1,000 m) would be wrong
  });

  test('a time horizon goes through the checkshots; wells it cannot place are named', () => {
    const row = { ...spec, z_domain: 'time', z_unit: 'ms' };
    const g = plane(() => 1400);
    const well = { name: 'T', surface_x: 1200, surface_y: 2200, crs: 'EPSG:32631', xy_unit: 'm', kb_m: 25, frame: null, checkshots: CS };
    expect(horizonAtWell(row, g, well).md).toBeCloseTo(1525, 6);
    expect(horizonAtWell(row, g, { ...well, checkshots: [] }).problem).toBe('no checkshots for a time horizon');
    expect(horizonAtWell(row, g, { ...well, crs: 'EPSG:2277' }).problem).toBe('in EPSG:2277, the horizon is in EPSG:32631');
    expect(horizonAtWell(row, g, { ...well, surface_x: 99999 }).problem).toBe('outside the horizon grid');
    // a well in US feet on the same grid (metres) is converted, not read as metres
    const ft = horizonAtWell({ ...row, crs: null }, g, { ...well, crs: null, xy_unit: 'ftUS', surface_x: 1200 * 3937 / 1200, surface_y: 2200 * 3937 / 1200 });
    expect(ft.md).toBeCloseTo(1525, 6);
  });

  test('only time and depth structure surfaces are offered, named for the section', () => {
    const c = horizonCandidates([
      { id: 'a', name: 'Dome (TWT ms)', z_domain: 'time', kind: 'structure', provenance: { app: 'seismolord', horizon: { name: 'Dome' } } },
      { id: 'b', name: 'Iso', z_domain: 'depth', kind: 'isochore' },
      { id: 'c', name: 'Amp', z_domain: 'attribute', kind: 'attribute' },
    ]);
    expect(c.map((x) => x.id)).toEqual(['a']);
    expect(horizonLabel(c[0])).toBe('H: Dome (TWT)');
    expect(c[0].source).toBe('Seismolord');
  });
});

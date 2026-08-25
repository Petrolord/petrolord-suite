// WD5 PPFG mud-window math + registry publish payloads (pure parts).

import {
  curveMdGrid, pickPpfgLogs, sampleCurve, buildMudWindow, mudWindowSummary,
} from '../services/ppfg';
import {
  preparePublishPayload, publishPatchFromPayload,
} from '../services/publishPlan';

const G = 9.80665;

describe('ppfg curve plumbing', () => {
  test('curveMdGrid expands start/step/n', () => {
    const md = curveMdGrid({ start_md_m: 500, step_m: 25, n_samples: 4 });
    expect(md).toEqual([500, 525, 550, 575]);
  });

  test('pickPpfgLogs keeps the latest MPa curve per mnemonic and ignores others', () => {
    const logs = [
      { mnemonic: 'GR', unit: 'API' },
      { mnemonic: 'PP', unit: 'MPA', id: 'old' },
      { mnemonic: 'PP', unit: 'MPA', id: 'new' },
      { mnemonic: 'FP', unit: 'MPA', id: 'fp' },
      { mnemonic: 'OBG', unit: 'kPa', id: 'wrong-unit' },
    ];
    const picked = pickPpfgLogs(logs);
    expect(picked.PP.id).toBe('new');
    expect(picked.FP.id).toBe('fp');
    expect(picked.OBG).toBeUndefined();
  });

  test('sampleCurve interpolates inside, nulls outside and across gaps', () => {
    const md = [100, 200, 300];
    expect(sampleCurve(md, [10, 20, 30], 150)).toBeCloseTo(15, 9);
    expect(sampleCurve(md, [10, 20, 30], 50)).toBeNull();
    expect(sampleCurve(md, [10, NaN, 30], 150)).toBeNull();
  });
});

describe('buildMudWindow', () => {
  // vertical well: MD == TVD, so the hydrostatic identity is exact
  const stations = [
    { md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 },
  ];
  // PP = hydrostatic of 1.20 g/cc EMW, FP = 1.60 g/cc, on a 100 m grid
  const md = [];
  const pp = [];
  const fp = [];
  for (let z = 500; z <= 2900; z += 100) {
    md.push(z);
    pp.push((1200 * G * z) / 1e6);
    fp.push((1600 * G * z) / 1e6);
  }
  const curves = { PP: { md, values: pp }, FP: { md, values: fp } };

  test('EMW conversion inverts the hydrostatic identity', () => {
    const rows = buildMudWindow(curves, stations, { kbElevM: 30, stepM: 100 });
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.ppEmw).toBeCloseTo(1.2, 6);
      expect(r.fpEmw).toBeCloseTo(1.6, 6);
      expect(r.windowMpa).toBeCloseTo(((400 * G) * r.tvd) / 1e6, 6);
      expect(r.tvdss).toBeCloseTo(r.tvd - 30, 9);
    }
  });

  test('needs PP or FP and a usable trajectory', () => {
    expect(buildMudWindow({}, stations)).toEqual([]);
    expect(buildMudWindow({ OBG: { md, values: pp } }, stations)).toEqual([]);
    expect(buildMudWindow(curves, [stations[0]])).toEqual([]);
  });

  test('summary reports the tightest window', () => {
    const rows = buildMudWindow(curves, stations, { stepM: 100 });
    const summary = mudWindowSummary(rows);
    // window grows with depth here, so tightest = shallowest
    expect(summary.tightest.tvd).toBeCloseTo(rows.find((r) => r.windowMpa != null).tvd, 9);
    expect(summary.toTvd).toBeGreaterThan(summary.fromTvd);
  });
});

describe('publish payloads', () => {
  const SITE = { id: 's1', crs: 'EPSG:32631', xy_unit: 'm' };
  const WELLBORE = {
    id: 'wb1', name: 'HAR-1', uwi: null, head_x: 500000, head_y: 6800000, kb_elev_m: 30,
  };
  const DESIGN = { id: 'd1', name: 'Base', revision: 3 };
  const stations = [
    { md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 30, azi: 370.123456 },
  ];

  test('payload follows the registry contract (grid azimuths normalized, md ascending)', () => {
    const p = preparePublishPayload({
      site: SITE, wellbore: WELLBORE, design: DESIGN, stations,
      publishedAt: '2026-08-25T12:00:00Z',
    });
    expect(p.surfaceX).toBe(500000);
    expect(p.kbM).toBe(30);
    expect(p.tdMdM).toBe(1000);
    expect(p.crs).toBe('EPSG:32631');
    expect(p.deviation[1].azi).toBeCloseTo(10.1235, 4);
    expect(p.crsProvenance.source).toBe('well-design-studio-wd5');
    expect(p.crsProvenance.design_id).toBe('d1');
  });

  test('patch shape maps to geo_wells columns', () => {
    const p = preparePublishPayload({
      site: SITE, wellbore: WELLBORE, design: DESIGN, stations,
    });
    const patch = publishPatchFromPayload(p);
    expect(patch.surface_x).toBe(500000);
    expect(patch.kb_m).toBe(30);
    expect(patch.td_md_m).toBe(1000);
    expect(patch.deviation).toHaveLength(2);
    expect(patch).not.toHaveProperty('surfaceX');
  });

  test('rejects unusable input loudly', () => {
    expect(() => preparePublishPayload({
      site: SITE, wellbore: WELLBORE, design: DESIGN, stations: [stations[0]],
    })).toThrow(/at least 2/);
    expect(() => preparePublishPayload({
      site: SITE, wellbore: { ...WELLBORE, head_x: null }, design: DESIGN, stations,
    })).toThrow(/wellhead/);
    expect(() => preparePublishPayload({
      site: SITE,
      wellbore: WELLBORE,
      design: DESIGN,
      stations: [{ md: 0, inc: 0, azi: 0 }, { md: 0, inc: 1, azi: 0 }],
    })).toThrow(/ascending/);
  });
});

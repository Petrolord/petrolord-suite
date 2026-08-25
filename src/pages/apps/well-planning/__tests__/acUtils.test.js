// WD4 anti-collision service logic: geomagnetic-reference resolution,
// survey-program validation, uncertainty plumbing, AC well assembly and
// run (de)serialization. Engine math itself is gated in
// packages/engines and tools/validation/drilling-validation.ts — these
// tests cover the Suite-side wiring rules.

import {
  resolveMagReference, validateProgramIntervals, computeStationUncertainty,
  eouPlanEllipses, eouSectionBand, buildAcWell, runAntiCollisionScan,
  serializeAcRun, deserializeAcRun, uncertaintyTable, DEFAULT_AC_PARAMS,
} from '../services/acUtils';
import { computeErrorModel } from '../engine/errorModel';

const MAG = {
  bTotalNT: 50000, dipDeg: 72, declinationDeg: -4, convergenceDeg: 0, aziReference: 'grid',
};

const wellboreWithCache = {
  mag_declination_deg: -4,
  grid_convergence_deg: 0.5,
  mag_model: { b_total_nt: 50000, dip_deg: 72, declination_deg: -4.1 },
};

// A simple deviated well: vertical to 300 m, build to 30 deg, hold.
function makeStations(aziDeg = 90, n = 40, step = 50) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const md = i * step;
    const inc = Math.min(30, Math.max(0, (md - 300) / 30));
    out.push({ md, inc, azi: aziDeg });
  }
  return out;
}

describe('resolveMagReference', () => {
  test('prefers the wellbore cache and stamps convergence', () => {
    const ref = resolveMagReference(null, wellboreWithCache);
    expect(ref.source).toBe('cache');
    expect(ref.bTotalNT).toBe(50000);
    expect(ref.dipDeg).toBe(72);
    expect(ref.declinationDeg).toBe(-4);       // cached column wins
    expect(ref.convergenceDeg).toBe(0.5);
  });

  test('falls back to cached mag_model declination when the column is empty', () => {
    const ref = resolveMagReference(null, { ...wellboreWithCache, mag_declination_deg: null });
    expect(ref.declinationDeg).toBe(-4.1);
  });

  test('returns null with no cache and no transformable CRS', () => {
    expect(resolveMagReference({ crs: null }, { head_x: 1, head_y: 2 })).toBeNull();
    expect(resolveMagReference(null, {})).toBeNull();
  });
});

describe('validateProgramIntervals', () => {
  test('accepts a tiling program and normalizes order', () => {
    const res = validateProgramIntervals([
      { from_md_m: 1500, to_md_m: 3000, toolcode: 'iscwsa-mwd-rev4' },
      { from_md_m: 0, to_md_m: 1500, toolcode: 'iscwsa-mwd-rev4' },
    ], { tdMdM: 3000 });
    expect(res.ok).toBe(true);
    expect(res.intervals[0].from_md_m).toBe(0);
    expect(res.intervals[1].to_md_m).toBe(3000);
  });

  test('flags gaps, unknown tools, short programs and bad starts', () => {
    expect(validateProgramIntervals([], {}).ok).toBe(false);
    expect(validateProgramIntervals([
      { from_md_m: 0, to_md_m: 1000, toolcode: 'gyro-imaginary' },
    ], { tdMdM: 1000 }).errors.join(' ')).toMatch(/unknown tool/);
    expect(validateProgramIntervals([
      { from_md_m: 0, to_md_m: 1000, toolcode: 'iscwsa-mwd-rev4' },
      { from_md_m: 1200, to_md_m: 2000, toolcode: 'iscwsa-mwd-rev4' },
    ], { tdMdM: 2000 }).errors.join(' ')).toMatch(/gaps or overlaps/);
    expect(validateProgramIntervals([
      { from_md_m: 100, to_md_m: 2000, toolcode: 'iscwsa-mwd-rev4' },
    ], { tdMdM: 2000 }).errors.join(' ')).toMatch(/start at MD 0/);
    expect(validateProgramIntervals([
      { from_md_m: 0, to_md_m: 1000, toolcode: 'iscwsa-mwd-rev4' },
    ], { tdMdM: 2000 }).errors.join(' ')).toMatch(/reaches 2000/);
  });
});

describe('computeStationUncertainty', () => {
  const stations = makeStations();

  test('single-tool path equals the plain error model', () => {
    const direct = computeErrorModel(stations, MAG);
    const res = computeStationUncertainty(stations, MAG);
    expect(res.programUsed).toBeNull();
    expect(res.sources).not.toBeNull();
    expect(res.totalCov[stations.length - 1][0][0])
      .toBeCloseTo(direct.totalCov[stations.length - 1][0][0], 10);
  });

  test('a valid program routes through compositing', () => {
    const td = stations[stations.length - 1].md;
    const res = computeStationUncertainty(stations, MAG, {
      programIntervals: [
        { from_md_m: 0, to_md_m: 1000, toolcode: 'iscwsa-mwd-rev4' },
        { from_md_m: 1000, to_md_m: td, toolcode: 'iscwsa-mwd-rev4' },
      ],
    });
    expect(res.programUsed).toEqual(['iscwsa-mwd-rev4', 'iscwsa-mwd-rev4']);
    // tie at 1000 breaks systematic correlation vs the single run
    const direct = computeErrorModel(stations, MAG);
    expect(res.totalCov[stations.length - 1][0][0])
      .not.toBeCloseTo(direct.totalCov[stations.length - 1][0][0], 6);
  });

  test('an invalid program falls back to the single run', () => {
    const res = computeStationUncertainty(stations, MAG, {
      programIntervals: [{ from_md_m: 0, to_md_m: 10, toolcode: 'iscwsa-mwd-rev4' }],
    });
    expect(res.programUsed).toBeNull();
  });

  test('throws without a geomagnetic reference', () => {
    expect(() => computeStationUncertainty(stations, null)).toThrow(/geomagnetic/);
  });
});

describe('EOU chart overlays', () => {
  const stations = makeStations();
  const { totalCov } = computeStationUncertainty(stations, MAG);
  // fake user-unit table rows aligned 1:1 (ft conversion x2 for testability)
  const rows = stations.map((s, i) => ({ md: s.md, e: i, n: 2 * i, vs: i, tvd: 3 * i }));

  test('plan ellipses land on the sampled stations in user units', () => {
    const ells = eouPlanEllipses(rows, totalCov, { k: 2, every: 10, metersToUser: (v) => v * 2 });
    expect(ells.length).toBeGreaterThan(1);
    const last = ells[ells.length - 1];
    expect(last.md).toBe(stations[stations.length - 1].md);
    expect(last.semiMajor).toBeGreaterThanOrEqual(last.semiMinor);
    // metersToUser doubling applied
    const raw = eouPlanEllipses(rows, totalCov, { k: 2, every: 10 });
    expect(last.semiMajor).toBeCloseTo(2 * raw[raw.length - 1].semiMajor, 10);
  });

  test('section band brackets the trajectory symmetrically', () => {
    const band = eouSectionBand(rows, totalCov, { k: 2 });
    expect(band.up).toHaveLength(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const half = rows[i].tvd - band.up[i].tvd;
      expect(band.down[i].tvd - rows[i].tvd).toBeCloseTo(half, 10);
      expect(half).toBeGreaterThanOrEqual(0);
    }
  });

  test('mismatched lengths return empty/null instead of lying', () => {
    expect(eouPlanEllipses(rows.slice(1), totalCov, {})).toEqual([]);
    expect(eouSectionBand(rows.slice(1), totalCov, {})).toBeNull();
  });
});

describe('AC scan end to end (synthetic pad)', () => {
  const refStations = makeStations(90);
  const nearStations = makeStations(90);   // parallel well 50 m north
  const farStations = makeStations(90);    // parallel well 500 m north

  const ref = buildAcWell({
    stations: refStations, headX: 0, headY: 0, kbElevM: 30, magRef: MAG, radius: 0.4572,
  });
  const near = buildAcWell({
    stations: nearStations, headX: 0, headY: 50, kbElevM: 25, magRef: MAG, radius: 0.3048,
  });
  const far = buildAcWell({
    stations: farStations, headX: 0, headY: 500, kbElevM: 25, magRef: MAG, radius: 0.3048,
  });

  test('positions share the TVDSS frame (KB difference honoured)', () => {
    // both wells vertical at surface: tvdss(0) = -kb_elev
    expect(ref.positions[0].tvd).toBeCloseTo(-30, 9);
    expect(near.positions[0].tvd).toBeCloseTo(-25, 9);
  });

  const results = runAntiCollisionScan(ref, [
    { id: 'far', label: 'Far well', kind: 'wp-plan', well: far },
    { id: 'near', label: 'Near well', kind: 'wp-plan', well: near },
  ], DEFAULT_AC_PARAMS);

  test('sorted worst-first with sane separation ordering', () => {
    expect(results[0].id).toBe('near');
    expect(results[0].clearance.summary.minSf)
      .toBeLessThan(results[1].clearance.summary.minSf);
    expect(Math.min(...results[1].clearance.distanceCC))
      .toBeGreaterThan(Math.min(...results[0].clearance.distanceCC));
  });

  test('serialize -> deserialize round-trips what the charts need', () => {
    const row = serializeAcRun({ designId: 'd1', results, params: DEFAULT_AC_PARAMS });
    expect(row.design_id).toBe('d1');
    expect(row.summary.offsetCount).toBe(2);
    expect(row.summary.worstOffset.id).toBe('near');
    expect(['clear', 'review', 'no-go']).toContain(row.summary.status);
    const back = deserializeAcRun(row);
    expect(back).toHaveLength(2);
    expect(back[0].clearance.md).toHaveLength(results[0].clearance.md.length);
    expect(back[0].clearance.sf[3]).toBeCloseTo(results[0].clearance.sf[3], 4);
    expect(back[0].classification.status).toBe(results[0].classification.status);
  });

  test('uncertainty table reports growing HLA sigmas', () => {
    const table = uncertaintyTable(refStations, ref.cov, { k: 1 });
    expect(table[0].sigmaL).toBeCloseTo(0, 6);
    expect(table[table.length - 1].sigmaL).toBeGreaterThan(table[5].sigmaL);
    expect(table[table.length - 1].semiMajor)
      .toBeGreaterThanOrEqual(table[table.length - 1].semiMinor);
  });
});

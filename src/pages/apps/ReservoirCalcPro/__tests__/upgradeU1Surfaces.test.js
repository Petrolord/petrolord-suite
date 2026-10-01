// ReservoirCalc Pro upgrade U1: the surface doors (RCP-U1-002, 010, 011,
// 016; carried MAP-U1-033 and EM-U1-024). The saved geo_surfaces rows of
// every release (e2e/fixtures/map/saved) and the hostile files
// (e2e/fixtures/map/hostile) are the fixtures; every test calls the
// shipped door and the shipped volume engine.

import fs from 'fs';
import path from 'path';
import { surfaceFromRegistryRow, seismolordExportUnits, pointsFromSurfaceFile, buildImportedSurface } from '../services/surfaceDoor';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';

jest.setTimeout(120000);

const root = path.resolve(__dirname, '../../../../..');
const saved = JSON.parse(fs.readFileSync(path.join(root, 'e2e/fixtures/map/saved/surfaces.json'), 'utf8')).surfaces;
const hostile = (f) => fs.readFileSync(path.join(root, 'e2e/fixtures/map/hostile', f), 'utf8');
const rowOf = (name) => saved.find((s) => s.row.name === name);

const inputs = { fluidType: 'oil', owc: -1550, ntg: 1, porosity: 1, sw: 0, fvf: 1 };
const grvOf = (surface, unitSystem = 'metric', extra = {}) => ContactVolumetricsEngine.calculate({
  topSurface: surface, constantThickness: unitSystem === 'metric' ? 500 : 500 / 0.3048, unitSystem,
  inputs: { ...inputs, owc: unitSystem === 'metric' ? -1550 : -1550 / 0.3048, ...extra }, options: { resolution: 120 },
});

describe('RCP-U1-002 registry rows of every release give one GRV', () => {
  const depthReleases = ['G4 Seismolord horizon', 'MS2 imported CPS-3', 'MS5 rotated Irap', 'MS5 digitized contours', 'T1 Top Dome structure', 'U1 state plane structure'];
  const results = {};
  beforeAll(() => {
    for (const name of depthReleases) {
      const { row, grid } = rowOf(name);
      const r = surfaceFromRegistryRow(row, Float32Array.from(grid));
      expect(r.ok).toBe(true);
      results[name] = { r, grv: grvOf(r.surface).grv };
    }
  });

  it('the US-survey-feet state plane equals the metre frame (it was 10.8x)', () => {
    const ref = results['T1 Top Dome structure'].grv;
    expect(ref).toBeGreaterThan(1e7);
    expect(Math.abs(results['U1 state plane structure'].grv / ref - 1)).toBeLessThan(0.01);
    expect(results['U1 state plane structure'].r.surface.xyToM).toBeCloseTo(1200 / 3937, 12);
  });

  it('feet depths, missing CRS, digitized and rotated rows agree (2%; rotated 6%)', () => {
    const ref = results['T1 Top Dome structure'].grv;
    const ratios = Object.fromEntries(depthReleases.map((n) => [n, +(results[n].grv / ref).toFixed(4)]));
    // the rotated 11 x 9 lattice is re-gridded across its rotated bounding
    // box, so it carries more interpolation error on this coarse fixture
    for (const name of depthReleases) {
      const tol = name === 'MS5 rotated Irap' ? 0.06 : 0.02;
      expect([name, Math.abs(ratios[name] - 1) < tol]).toEqual([name, true]);
    }
  });

  it('the rotated row places its nodes with the rotation and says so', () => {
    const { r } = results['MS5 rotated Irap'];
    const { row } = rowOf('MS5 rotated Irap');
    const p = r.surface.points.find((q) => q.z === r.surface.minZ) || r.surface.points[0];
    expect(p).toBeTruthy();
    // node (0, 1) lies 200 m along the rotated X axis from the origin
    const first = r.surface.points.slice(0, 2);
    const ang = (Math.atan2(first[1].y - first[0].y, first[1].x - first[0].x) * 180) / Math.PI;
    expect(Math.abs(ang - row.rotation_deg)).toBeLessThan(1e-6);
    expect(r.notes.join(' ')).toMatch(/rotated 30 degrees/);
  });

  it('the legacy rows keep the door notes (no CRS, no unit)', () => {
    expect(results['G4 Seismolord horizon'].r.notes.join(' ')).toMatch(/no CRS or XY unit/);
  });

  it('negative control: the feet frame read as metres is 10.76x (the old forced xyUnit m)', () => {
    const { r } = results['U1 state plane structure'];
    const asMetres = { ...r.surface, xyUnit: 'm', xyToM: undefined };
    const ratio = grvOf(asMetres).grv / results['T1 Top Dome structure'].grv;
    expect(ratio).toBeGreaterThan(10);
  });
});

describe('RCP-U1-002 rows that are not depth structures are refused with the reason', () => {
  const base = rowOf('T1 Top Dome structure');
  const grid = Float32Array.from(base.grid);
  it('an MD attribute map', () => {
    const { row, grid: g } = rowOf('T1 Top Dome MD (measured depth, m)');
    const r = surfaceFromRegistryRow(row, Float32Array.from(g));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/attribute map/);
  });
  it('a two-way-time horizon', () => {
    const r = surfaceFromRegistryRow({ ...base.row, name: 'TWT Top', z_domain: 'time', z_unit: 'ms' }, grid);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/time surface.*Depth-convert/);
  });
  it('an isochore', () => {
    const r = surfaceFromRegistryRow({ ...base.row, name: 'Iso', kind: 'isochore' }, grid);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/isochore/);
  });
  it('a structure referenced to TVD below KB', () => {
    const r = surfaceFromRegistryRow({ ...base.row, provenance: { depth_ref: 'tvd' } }, grid);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/TVD, not TVDSS/);
  });
});

describe('RCP-U1-010 a Seismolord time export is refused', () => {
  it('twt_ms is refused; depth_ft keeps XY in metres with depths in feet', () => {
    expect(seismolordExportUnits({ name: 'H1', domain: 'twt_ms' })).toMatchObject({ ok: false });
    expect(seismolordExportUnits({ name: 'H1', domain: 'twt_ms' }).reason).toMatch(/two-way-time/);
    expect(seismolordExportUnits({ domain: 'depth_ft' })).toEqual({ ok: true, xyUnit: 'm', depthUnit: 'ft' });
  });
});

describe('RCP-U1-011 the depth unit is its own choice', () => {
  it('a UTM grid in metres with depths in feet gives the metre answer (one unit for both was 3.28x)', () => {
    const { grid } = rowOf('T1 Top Dome structure');
    const { row } = rowOf('T1 Top Dome structure');
    const metres = surfaceFromRegistryRow(row, Float32Array.from(grid)).surface;
    const feetDepth = metres.points.map((p) => ({ ...p, z: p.z / 0.3048 }));
    const mixed = buildImportedSurface(feetDepth, { xyUnit: 'm', depthUnit: 'ft', zConvention: 'elevation' });
    expect(mixed.depthUnit).toBe('ft');
    expect(mixed.xyUnit).toBe('m');
    // U2-005: the registry surface now integrates on its lattice; the
    // file-import surfaces here are points, so compare on the points path
    const ref = grvOf({ ...metres, lattice: undefined }).grv;
    expect(Math.abs(grvOf(mixed).grv / ref - 1)).toBeLessThan(0.005);
    // negative control: the old one-unit model read those feet as metres
    const oneUnit = buildImportedSurface(feetDepth, { xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation' });
    expect(grvOf(oneUnit).grv).toBeLessThan(ref * 0.5);
  });
});

describe('RCP-U1-016 hostile files go through the shared file door', () => {
  it('a Petrel CPS-3 export reads as its grid (it was 20 header numbers)', () => {
    const r = pointsFromSurfaceFile(hostile('petrel_cps3_depth_m.cps'));
    expect(r.ok).toBe(true);
    expect(r.points.length).toBeGreaterThan(90);
    expect(r.notes.join(' ')).toMatch(/Petrel name line/);
  });
  it('an Irap classic grid on a US-feet state plane reads its lattice', () => {
    const r = pointsFromSurfaceFile(hostile('irap_depth_ft_stateplane_ftus.irap'));
    expect(r.ok).toBe(true);
    expect(r.points.length).toBeGreaterThan(90);
  });
  it('depth-first columns with units in the header, and a semicolon file with comma decimals', () => {
    const a = pointsFromSurfaceFile(hostile('xyz_depth_ft_first.csv'));
    expect(a.ok).toBe(true);
    expect(a.hint.zUnit).toBe('ft');
    const b = pointsFromSurfaceFile(hostile('xyz_semicolon_comma_decimal.csv'));
    expect(b.ok).toBe(true);
    expect(b.points.length).toBeGreaterThan(90);
  });
  it('a rotated survey lattice comes back as points', () => {
    const r = pointsFromSurfaceFile(hostile('xyz_rotated_survey_lattice.xyz'));
    expect(r.ok).toBe(true);
    expect(r.notes.join(' ')).toMatch(/Not a regular X\/Y grid/);
  });
  it('a ZMAP+ lines file (fault polygons) is refused as not a grid', () => {
    const r = pointsFromSurfaceFile(hostile('petrel_fault_polygons_zmap_lines.dat'));
    expect(r.ok).toBe(false);
    expect(r.fallback).toBeFalsy();
    expect(r.reason).toMatch(/lines file/);
  });
  it('a header that names TWT is refused', () => {
    const r = pointsFromSurfaceFile('X,Y,TWT (ms)\n500000,6700000,1500\n500100,6700000,1510\n500000,6700100,1520\n500100,6700100,1530\n');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/two-way time/);
  });
});

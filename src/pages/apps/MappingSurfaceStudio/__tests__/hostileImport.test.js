// PL2 hostile surface files (MAP-U1-003): every file in
// e2e/fixtures/map/hostile carries the same analytic dome (generate.mjs),
// crest -1500 m at (502000, 6700000). Each goes through the real door
// (readSurfaceFile) and planImport, and the crest node must come back
// with the right value, sign, unit and domain.
import fs from 'fs';
import path from 'path';
import { readSurfaceFile } from '../services/surfaceFileDoor';
import { planImport } from '../services/importPlan';
import { parseSurfaceFile } from '@/lib/gridding/surfaceImport';
import { quickGrv } from '../services/quickGrv';
import { xyUnitOf, metresPerXy } from '../services/xyUnits';

const dir = path.join(process.cwd(), 'e2e/fixtures/map/hostile');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const FT = 0.3048;
const at = (plan, x, y) => {
  const c = Math.round((x - plan.spec.x0) / plan.spec.dx);
  const r = Math.round((y - plan.spec.y0) / plan.spec.dy);
  return plan.grid[r * plan.spec.nx + c];
};

describe('the door reads what the vendors write', () => {
  test('Petrel CPS-3 with its "->" name line: depth positive down in metres', () => {
    const f = read('petrel_cps3_depth_m.cps');
    expect(() => parseSurfaceFile(f)).toThrow(/non-numeric/); // negative control: the bare reader refuses it
    const { g, notes } = readSurfaceFile(f);
    expect(notes.join(' ')).toMatch(/Petrel name line/);
    const plan = planImport({ g, fileName: 'x.cps', domain: 'depth', zUnit: 'm' });
    expect(plan.effSign).toBe('positive');
    expect(at(plan, 502000, 6700000)).toBeCloseTo(-1500, 2);
    expect(plan.stats.live).toBe(98); // one declared-null node
  });

  test('Kingdom ZMAP+ in negative TWT with -99999 nulls reads as positive time', () => {
    const { g } = readSurfaceFile(read('kingdom_zmap_twt_negative.zmap'));
    const plan = planImport({ g, fileName: 'x.zmap', domain: 'time' });
    expect(at(plan, 502000, 6700000)).toBeCloseTo(1400, 2);
    expect(plan.stats.live).toBe(98);
  });

  test('an XYZ header row is skipped and said', () => {
    const f = read('xyz_header_row.xyz');
    expect(() => parseSurfaceFile(f)).toThrow(/Line 1/);
    const { g, notes } = readSurfaceFile(f);
    expect(notes.join(' ')).toMatch(/Skipped 1 header row/);
    expect(at(planImport({ g, domain: 'depth', zUnit: 'm' }), 502000, 6700000)).toBeCloseTo(-1500, 2);
  });

  test('Petrel points with attributes: header block and its depth unit', () => {
    const f = read('petrel_points_with_attributes.txt');
    expect(() => parseSurfaceFile(f)).toThrow(/VERSION/);
    const { g, notes, hint } = readSurfaceFile(f);
    expect(notes.join(' ')).toMatch(/Petrel points header \(X, Y, Z\)/);
    expect(hint.zUnit).toBe('m');
    expect(at(planImport({ g, domain: 'depth', zUnit: 'm' }), 502000, 6700000)).toBeCloseTo(-1500, 2);
  });

  test('semicolons with comma decimals', () => {
    const { g, notes } = readSurfaceFile(read('xyz_semicolon_comma_decimal.csv'));
    expect(notes.join(' ')).toMatch(/Semicolon/);
    expect(at(planImport({ g, domain: 'depth', zUnit: 'm' }), 502000, 6700000)).toBeCloseTo(-1500, 2);
  });

  test('depth first, in feet, named in the header: columns remapped and the unit suggested', () => {
    const { g, notes, hint } = readSurfaceFile(read('xyz_depth_ft_first.csv'));
    expect(notes.join(' ')).toMatch(/X = Easting \(m\), Y = Northing \(m\), Z = Depth \(ft\)/);
    expect(hint.zUnit).toBe('ft');
    const plan = planImport({ g, domain: 'depth', zUnit: hint.zUnit });
    expect(plan.zUnit).toBe('ft');
    expect(at(plan, 502000, 6700000)).toBeCloseTo(-1500 / FT, 1);
  });

  test('a rotated seismic lattice is read as points to grid, with the reason (MAP-U2-003 supersedes the U1 refusal)', () => {
    const r = readSurfaceFile(read('xyz_rotated_survey_lattice.xyz'));
    expect(r.g).toBeNull();
    expect(r.notes.join(' ')).toMatch(/Not a regular X\/Y grid \(a rotated seismic lattice or scattered picks\)/);
  });

  test('a ZMAP+ lines file (fault polygons) is named as culture, not read as a broken grid', () => {
    expect(() => readSurfaceFile(read('petrel_fault_polygons_zmap_lines.dat'))).toThrow(/ZMAP\+ lines file .*Culture layers/);
  });

  test('Irap classic in feet on a US-feet state plane: same GRV as the metric CPS-3 (MAP-U1-001 end to end)', () => {
    const ft = planImport({ g: readSurfaceFile(read('irap_depth_ft_stateplane_ftus.irap')).g, domain: 'depth', zUnit: 'ft', declaredTag: 'EPSG:2274' });
    expect(ft.xyUnit).toBe('ftUS');
    expect(ft.stats.live).toBe(98);
    const m = planImport({ g: readSurfaceFile(read('petrel_cps3_depth_m.cps')).g, domain: 'depth', zUnit: 'm' });
    const toM = (p) => Float32Array.from(p.grid, (v) => (Math.abs(v) >= 1e29 ? v : v * (p.zUnit === 'ft' ? FT : 1)));
    const specOf = (p) => p.spec;
    const gm = quickGrv({ spec: specOf(m), gridM: toM(m), contactM: -1540 });
    const gf = quickGrv({ spec: specOf(ft), gridM: toM(ft), contactM: -1540, xyToM: metresPerXy(xyUnitOf(ft)) });
    expect(gm.grvM3).toBeGreaterThan(0);
    expect(gf.grvM3 / gm.grvM3).toBeCloseTo(1, 4);
  });
});

test('reader errors reach the dialog without a dash (PL12)', () => {
  expect(() => readSurfaceFile('1 2 3\n1 2 4\n1 2 5\n1 2 6\n')).toThrow(/^All points share one X: not a grid\.$/);
});

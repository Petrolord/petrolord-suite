// S4 import gates: structure resampling (surface -> TOPS), history
// shaping (MBAL cumulatives -> WCONHIST periods), trajectory conversion
// (survey -> connections) and the builder integration, plus the second
// flow-acceptance fixture:
//   GEN_SIM_FIXTURE=1 npx jest src/utils/__tests__/simS4Import.test.js
// regenerates worker/sim-worker/tests/integration/fixtures/generated/
// BUILT_S4.DATA, which the worker image validates and runs in flow.
import fs from 'fs';
import path from 'path';
import { sampleSurfaceToTops, topsPreviewCells } from '../simStructureImport';
import { historyFromRbRows, historyPreviewRows } from '../simHistoryImport';
import { parseSurveyText, buildTrajectoryConnections } from '../simTrajectoryImport';
import { defaultBuilderForm, buildDeckFromForm } from '../simDeckBuilder';
import { validateSpec } from '../simDeckGeneration';

const S4_FIXTURE = path.join(__dirname, '..', '..', '..',
  'worker', 'sim-worker', 'tests', 'integration', 'fixtures', 'generated', 'BUILT_S4.DATA');

// 21x21-node synthetic structure: 2500 m at the west edge dipping east
// at 50 m per km (metres, depth domain) — deterministic for the fixture.
const syntheticSurface = () => {
  const nx = 21;
  const ny = 21;
  const values = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r += 1) {
    for (let c = 0; c < nx; c += 1) {
      values[r * nx + c] = 2500 + c * 100 * 0.05;
    }
  }
  return {
    surface: {
      name: 'S4 synthetic', nx, ny, dx: 100, dy: 100,
      z_domain: 'depth', z_unit: 'm', xy_unit: 'm', null_value: 1e30,
    },
    values,
  };
};

describe('simStructureImport', () => {
  test('resamples a dipping surface to per-cell tops in feet', () => {
    const { surface, values } = syntheticSurface();
    const out = sampleSurfaceToTops(surface, values, { nx: 10, ny: 10 });
    expect(out.tops).toHaveLength(100);
    // 2000 m extent -> 6561.68 ft over 10 cells.
    expect(out.dxFt).toBeCloseTo(656.17, 1);
    // West column shallower than east column, monotone along I.
    expect(out.tops[0]).toBeLessThan(out.tops[9]);
    expect(out.tops[0]).toBeCloseTo(out.tops[90], 5); // no dip along J
    // 2500 m = 8202 ft; 2600 m = 8530 ft.
    expect(out.stats.minFt).toBeGreaterThan(8210);
    expect(out.stats.maxFt).toBeLessThan(8530);
    expect(out.stats.reliefFt).toBeGreaterThan(250);
    expect(out.warnings).toHaveLength(0);
  });

  test('masks the null sentinel, fills isolated holes and reports them', () => {
    const { surface, values } = syntheticSurface();
    values[10 * 21 + 10] = 1e30;
    const out = sampleSurfaceToTops(surface, values, { nx: 5, ny: 5 });
    expect(out.warnings.join(' ')).toMatch(/holes/);
    expect(out.tops.every((v) => v > 8000 && v < 9000)).toBe(true);
  });

  test('refuses time-domain surfaces, elevation grids and hole-dominated maps', () => {
    const { surface, values } = syntheticSurface();
    expect(() => sampleSurfaceToTops({ ...surface, z_domain: 'time' }, values, { nx: 5, ny: 5 }))
      .toThrow(/depth-converted/);
    const negative = values.map((v) => -v);
    expect(() => sampleSurfaceToTops(surface, negative, { nx: 5, ny: 5 }))
      .toThrow(/elevation/);
    const holey = new Float32Array(values.length).fill(1e30);
    expect(() => sampleSurfaceToTops(surface, holey, { nx: 5, ny: 5 }))
      .toThrow(/no valid values/);
  });

  test('preview grid downsamples to the cap', () => {
    const tops = Array.from({ length: 100 * 80 }, (_, i) => 8000 + (i % 100));
    const { cells, px, py } = topsPreviewCells(tops, 100, 80, 40);
    expect(px).toBe(40);
    expect(py).toBe(40);
    expect(cells).toHaveLength(1600);
    expect(cells.every((c) => Number.isFinite(c.depth))).toBe(true);
  });
});

describe('simHistoryImport', () => {
  const rbRows = () => [
    { timestep_index: 0, observation_date: '2025-01-01', cum_oil_stb: 0, cum_gas_scf: 0, cum_water_stb: 0, cum_water_inj_stb: 0 },
    { timestep_index: 1, observation_date: '2025-02-01', cum_oil_stb: 62000, cum_gas_scf: 49600000, cum_water_stb: 3100, cum_water_inj_stb: 77500 },
    { timestep_index: 2, observation_date: '2025-03-01', cum_oil_stb: 118000, cum_gas_scf: 94400000, cum_water_stb: 8700, cum_water_inj_stb: 147500 },
  ];

  test('derives interval rates, splits allocation and converts gas to Mscf', () => {
    const out = historyFromRbRows(rbRows(), {
      producers: [{ name: 'P1', frac: 0.6 }, { name: 'P2', frac: 0.4 }],
      waterInjectors: [{ name: 'I1', frac: 1 }],
    });
    expect(out.startDate).toBe('2025-01-01');
    expect(out.endDate).toBe('2025-03-01');
    expect(out.periods).toHaveLength(2);
    // Jan: 62000 STB over 31 days = 2000 STB/d field, split 60/40.
    expect(out.periods[0].prod[0]).toEqual({ name: 'P1', orat: 1200, wrat: 60, grat: 960 });
    expect(out.periods[0].prod[1].orat).toBeCloseTo(800, 3);
    // 49.6 MMscf over 31 d = 1600 Mscf/d field.
    expect(out.periods[0].prod[0].grat + out.periods[0].prod[1].grat).toBeCloseTo(1600, 3);
    expect(out.periods[0].inj[0]).toEqual({ name: 'I1', phase: 'WATER', rate: 2500 });
    expect(out.warnings).toHaveLength(0);
    expect(historyPreviewRows(out)[0].orat).toBeCloseTo(2000, 3);
  });

  test('clamps cumulative dips to zero with a warning', () => {
    const rows = rbRows();
    rows[2].cum_oil_stb = 50000; // dips below the previous cumulative
    const out = historyFromRbRows(rows, { producers: [{ name: 'P1', frac: 1 }] });
    expect(out.periods[1].prod[0].orat).toBe(0);
    expect(out.warnings.join(' ')).toMatch(/clamped/);
  });

  test('synthesizes monthly dates when MBAL rows are undated', () => {
    const rows = rbRows().map((r) => ({ ...r, observation_date: null }));
    const out = historyFromRbRows(rows, { producers: [{ name: 'P1', frac: 1 }] },
      { fallbackStartDate: '2024-06-01' });
    expect(out.startDate).toBe('2024-06-01');
    expect(out.warnings.join(' ')).toMatch(/synthetic monthly/i);
  });

  test('actionable failures: mixed dates, bad allocation, too few rows', () => {
    const mixed = rbRows();
    mixed[1].observation_date = null;
    expect(() => historyFromRbRows(mixed, { producers: [{ name: 'P1', frac: 1 }] }))
      .toThrow(/consistently/);
    expect(() => historyFromRbRows(rbRows(), { producers: [{ name: 'P1', frac: 0.5 }] }))
      .toThrow(/sum to 1/);
    expect(() => historyFromRbRows(rbRows().slice(0, 1), { producers: [{ name: 'P1', frac: 1 }] }))
      .toThrow(/at least two/);
    expect(() => historyFromRbRows(rbRows(), { producers: [] })).toThrow(/at least one producer/);
  });
});

describe('simTrajectoryImport', () => {
  const boxGrid = () => ({
    nx: 4, ny: 3, nz: 2, dx: 100, dy: 100, topsDepth: 8000,
    layers: [
      { dz: 20, poro: 0.2, permx: 100, permz: 10 },
      { dz: 30, poro: 0.18, permx: 50, permz: 5 },
    ],
  });

  test('parses survey text with comments and rejects garbage', () => {
    const { stations, errors } = parseSurveyText(
      '# header\n0 0 0\n1000, 45, 90 -- kickoff\nbad line\n2000 45 90\n',
    );
    expect(stations).toHaveLength(3);
    expect(errors.join(' ')).toMatch(/Line 4/);
    expect(parseSurveyText('100 0 0\n50 0 0').errors.join(' ')).toMatch(/increase/);
  });

  test('vertical survey completes the column, horizontal tracks a layer', () => {
    const g = boxGrid();
    const vertical = buildTrajectoryConnections({
      stations: [{ md: 0, inc: 0, azi: 0 }, { md: 8100, inc: 0, azi: 0 }],
      mdUnit: 'ft', wellheadX: 150, wellheadY: 150,
    }, g);
    expect(vertical.connections.map((c) => [c.i, c.j, c.k, c.dir]))
      .toEqual([[2, 2, 1, 'Z'], [2, 2, 2, 'Z']]);
    expect(vertical.headIJ).toEqual({ i: 2, j: 2 });
    expect(vertical.refDepthFt).toBe(8000);

    const lateral = buildTrajectoryConnections({
      stations: [{ md: 0, inc: 90, azi: 90 }, { md: 400, inc: 90, azi: 90 }],
      mdUnit: 'ft', wellheadX: 0.1, wellheadY: 150, kbToDatumFt: 8035,
    }, g);
    expect(lateral.connections.every((c) => c.k === 2 && c.dir === 'X')).toBe(true);
    expect(lateral.connections.map((c) => c.i)).toEqual([1, 2, 3, 4]);
  });

  test('metre surveys convert at the seam', () => {
    const g = boxGrid();
    // 2470 m ~ 8103 ft of vertical hole: reaches layer 2 only via metres.
    const out = buildTrajectoryConnections({
      stations: [{ md: 0, inc: 0, azi: 0 }, { md: 2470, inc: 0, azi: 0 }],
      mdUnit: 'm', wellheadX: 50, wellheadY: 50,
    }, g);
    expect(out.connections).toHaveLength(2);
    expect(out.tvdRange.max).toBeGreaterThan(8100);
  });

  test('a trajectory that misses the grid throws an actionable error', () => {
    expect(() => buildTrajectoryConnections({
      stations: [{ md: 0, inc: 0, azi: 0 }, { md: 100, inc: 0, azi: 0 }],
      mdUnit: 'ft', wellheadX: 150, wellheadY: 150,
    }, boxGrid())).toThrow(/never enters the grid/);
  });
});

// ---------------------------------------------------------------- builder ---

/** Deterministic S4 form: structure from the synthetic surface, the
 *  producer deviated via survey, MBAL-shaped history + 1y prediction. */
const s4Form = () => {
  const form = defaultBuilderForm();
  const { surface, values } = syntheticSurface();
  const sampled = sampleSurfaceToTops(surface, values, { nx: 10, ny: 10 });
  form.title = 'S4 STRUCTURE HISTORY MODEL';
  form.structure = {
    mode: 'surface', surfaceId: 'synthetic', surfaceName: surface.name,
    tops: sampled.tops, dxFt: sampled.dxFt, dyFt: sampled.dyFt, stats: sampled.stats,
  };
  // Deviated producer: build to 87 deg due east and chase the 5% dip
  // down-structure — a true lateral that tracks the top layer across
  // several columns (X-direction connections).
  form.wells[0].trajectory = {
    enabled: true,
    text: '0 0 90\n8000 0 90\n8400 87 90\n10400 87 90\n',
    mdUnit: 'ft',
    wellheadX: String(1.5 * sampled.dxFt),
    wellheadY: String(4.5 * sampled.dyFt),
    kbToDatum: '0',
  };
  form.equil = { datumDepth: '8350', datumPressure: '4300', owc: '8700', goc: '8150' };
  form.wells[1] = {
    ...form.wells[1], i: '8', j: '8', k1: '1', k2: '3', refDepth: '8300',
  };
  const history = historyFromRbRows([
    { observation_date: '2025-01-01', cum_oil_stb: 0, cum_gas_scf: 0, cum_water_stb: 0, cum_water_inj_stb: 0 },
    { observation_date: '2025-02-01', cum_oil_stb: 62000, cum_gas_scf: 49600000, cum_water_stb: 3100, cum_water_inj_stb: 77500 },
    { observation_date: '2025-03-01', cum_oil_stb: 118000, cum_gas_scf: 94400000, cum_water_stb: 8700, cum_water_inj_stb: 147500 },
    { observation_date: '2025-04-01', cum_oil_stb: 170000, cum_gas_scf: 136000000, cum_water_stb: 16400, cum_water_inj_stb: 225000 },
  ], {
    producers: [{ name: 'PROD1', frac: 1 }],
    waterInjectors: [{ name: 'INJ1', frac: 1 }],
  });
  form.history = {
    enabled: true,
    caseName: 'S4 synthetic MBAL case',
    startDate: history.startDate,
    endDate: history.endDate,
    periods: history.periods,
    predictionYears: '1',
  };
  return form;
};

describe('simDeckBuilder S4 integration', () => {
  test('structure + trajectory + history compose into one deck', () => {
    const out = buildDeckFromForm(s4Form());
    expect(out.ok).toBe(true);
    expect(validateSpec(out.spec).ok).toBe(true);
    expect(out.spec.startDate).toBe('2025-01-01');
    // Structural TOPS (not a constant) and the deviated completion.
    expect(out.spec.grid.tops).toHaveLength(100);
    expect(Math.min(...out.spec.grid.tops)).toBeLessThan(Math.max(...out.spec.grid.tops) - 200);
    const prod = out.spec.wells[0];
    expect(prod.connections.length).toBeGreaterThan(2);
    expect(prod.connections.some((c) => c.dir !== 'Z')).toBe(true);
    ['WCONHIST', 'WCONINJH', 'DATES', 'FOPRH', 'WOPRH', 'WCONPROD', 'TSTEP']
      .forEach((kw) => expect(out.deck).toContain(kw));
    expect(out.deck).toContain("1 'APR' 2025"); // history end boundary
  });

  test('grid edits invalidate a stale structure sample', () => {
    const form = s4Form();
    form.grid.nx = '12';
    const out = buildDeckFromForm(form);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/re-import the surface/);
  });

  test('history well names must exist in the model', () => {
    const form = s4Form();
    form.wells[0].name = 'RENAMED';
    const out = buildDeckFromForm(form);
    expect(out.ok).toBe(false);
    expect(out.errors.join(' ')).toMatch(/PROD1/);
  });

  test('matches the checked-in S4 flow-acceptance fixture (regen: GEN_SIM_FIXTURE=1)', () => {
    const { deck, ok, errors } = buildDeckFromForm(s4Form());
    expect(ok).toBe(true);
    if (process.env.GEN_SIM_FIXTURE === '1') {
      fs.mkdirSync(path.dirname(S4_FIXTURE), { recursive: true });
      fs.writeFileSync(S4_FIXTURE, deck);
    }
    expect(fs.existsSync(S4_FIXTURE)).toBe(true);
    expect(fs.readFileSync(S4_FIXTURE, 'utf8')).toBe(deck);
  });
});

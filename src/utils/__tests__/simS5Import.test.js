// S5 gates: per-well history import (rate CSV -> WCONHIST periods with
// no field allocation) and the 3D model preview math (grid + wells ->
// projected scene), plus the builder integration proving per-well
// periods compose into a deck with each well's own observed rates.
import { parseWellRateCsv, historyFromWellRows } from '../simWellHistoryImport';
import {
  buildGridScene, wellLineVertical, wellLineFromPath, projectScene,
  autoVertExag, nodeDepth, depthColor,
} from '../simGridViz';
import { defaultBuilderForm, buildDeckFromForm } from '../simDeckBuilder';

const CSV = [
  'date, well, oil, water, gas',
  '2024-01-01, PROD1, 1500, 100, 900',
  '2024-01-01, PROD2, 800, 50, 400',
  '2024-01-01, INJ1, , 2400,',
  '2024-02-01, PROD1, 1400, 130, 880',
  '2024-02-01, PROD2, 760, 60, 390',
  '2024-02-01, INJ1, , 2400,',
  '2024-03-01, PROD1, 1350, 160, 860',
  '# comment line',
  '2024-03-01, INJ1, , 2500,',
].join('\n');

const MODEL_WELLS = [
  { name: 'PROD1', type: 'producer' },
  { name: 'PROD2', type: 'producer' },
  { name: 'INJ1', type: 'water_injector' },
];

describe('parseWellRateCsv', () => {
  test('parses headers by alias, blank cells as null, comments ignored', () => {
    const out = parseWellRateCsv(CSV);
    expect(out.errors).toHaveLength(0);
    expect(out.rows).toHaveLength(8);
    expect(out.columns).toEqual(['date', 'well', 'oil', 'water', 'gas']);
    expect(out.rows[2]).toEqual({ date: '2024-01-01', well: 'INJ1', oil: null, water: 2400, gas: null });
  });

  test('rejects a header without date/well and flags bad cells by line', () => {
    expect(parseWellRateCsv('oil, water\n1, 2').errors[0]).toMatch(/date column and a well column/);
    const out = parseWellRateCsv('date, well, oil\n2024-01-01, P1, abc');
    expect(out.errors[0]).toMatch(/Line 2: oil value 'abc'/);
  });
});

describe('historyFromWellRows', () => {
  test('builds per-well periods with no allocation', () => {
    const { rows } = parseWellRateCsv(CSV);
    const out = historyFromWellRows(rows, MODEL_WELLS);
    expect(out.startDate).toBe('2024-01-01');
    expect(out.periods).toHaveLength(3);
    // Each producer keeps its OWN metered rates.
    const p0 = out.periods[0];
    expect(p0.prod).toEqual([
      { name: 'PROD1', orat: 1500, wrat: 100, grat: 900 },
      { name: 'PROD2', orat: 800, wrat: 50, grat: 400 },
    ]);
    expect(p0.inj).toEqual([{ name: 'INJ1', phase: 'WATER', rate: 2400 }]);
    // PROD2 has no March row: the period simply omits it (keyword
    // persistence keeps its February rate) and the import says so.
    expect(out.periods[2].prod.map((w) => w.name)).toEqual(['PROD1']);
    expect(out.warnings.join(' ')).toMatch(/keep their previous declared rate/);
    // Tail: median interval (31 days — leap-year Feb makes 29 the other) past the last date.
    expect(out.endDate).toBe('2024-04-01');
    expect(out.warnings.join(' ')).toMatch(/median interval/);
    // Preview stats are per well.
    const prod1 = out.wellSummary.find((w) => w.name === 'PROD1');
    expect(prod1.periods).toBe(3);
    expect(prod1.avgOil).toBeCloseTo((1500 + 1400 + 1350) / 3, 3);
  });

  test('volumes mode spreads interval volumes over the period days', () => {
    const rows = [
      { date: '2024-01-01', well: 'PROD1', oil: 31000, water: 0, gas: 0 },
      { date: '2024-02-01', well: 'PROD1', oil: 29000, water: 0, gas: 0 },
    ];
    const out = historyFromWellRows(rows, MODEL_WELLS, { mode: 'volumes' });
    expect(out.periods[0].prod[0].orat).toBeCloseTo(1000, 3); // 31000 / 31 days
    expect(out.periods[1].prod[0].orat).toBeCloseTo(29000 / 31, 3); // median tail = 31 d
  });

  test('scf gas unit seam divides by 1000', () => {
    const rows = [
      { date: '2024-01-01', well: 'PROD1', oil: 100, water: 0, gas: 900000 },
      { date: '2024-02-01', well: 'PROD1', oil: 100, water: 0, gas: 900000 },
    ];
    const out = historyFromWellRows(rows, MODEL_WELLS, { gasUnit: 'scf' });
    expect(out.periods[0].prod[0].grat).toBeCloseTo(900, 3);
  });

  test('actionable rejections: unknown wells, duplicates, one date, no producers', () => {
    const mk = (rows) => () => historyFromWellRows(rows, MODEL_WELLS);
    expect(mk([{ date: '2024-01-01', well: 'GHOST', oil: 1 },
      { date: '2024-02-01', well: 'GHOST', oil: 1 }])).toThrow(/GHOST/);
    expect(mk([{ date: '2024-01-01', well: 'PROD1', oil: 1 },
      { date: '2024-01-01', well: 'PROD1', oil: 2 }])).toThrow(/Duplicate row/);
    expect(mk([{ date: '2024-01-01', well: 'PROD1', oil: 1 }])).toThrow(/two dates/);
    expect(mk([{ date: '2024-01-01', well: 'INJ1', water: 5 },
      { date: '2024-02-01', well: 'INJ1', water: 5 }])).toThrow(/producer/);
  });

  test('clamps negative rates and reports shut wells', () => {
    const rows = [
      { date: '2024-01-01', well: 'PROD1', oil: -5, water: 0, gas: 0 },
      { date: '2024-02-01', well: 'PROD1', oil: 100, water: 0, gas: 0 },
    ];
    const out = historyFromWellRows(rows, MODEL_WELLS);
    expect(out.periods[0].prod[0].orat).toBe(0);
    expect(out.warnings.join(' ')).toMatch(/clamped to zero/);
    expect(out.warnings.join(' ')).toMatch(/PROD2, INJ1 — they stay shut/);
  });
});

describe('simGridViz', () => {
  const flatGrid = {
    nx: 4, ny: 3, nz: 2, dx: 500, dy: 400, topsDepth: 8000,
    layers: [{ dz: 30 }, { dz: 50 }],
  };
  // Dipping east: column i's top = 8000 + (i-1)*100.
  const dipGrid = {
    ...flatGrid,
    topsDepth: undefined,
    tops: Array.from({ length: 12 }, (_, idx) => 8000 + (idx % 4) * 100),
  };

  test('builds a full-cover quad surface with the reservoir box', () => {
    const scene = buildGridScene(flatGrid);
    expect(scene.quads).toHaveLength(12); // no decimation needed
    expect(scene.bounds).toEqual({ x: 2000, y: 1200, top: 8000, bottom: 8080 });
    expect(scene.depthSpan).toEqual({ min: 8000, max: 8000 });
    expect(scene.posts.length).toBe(8); // 4 corner verticals + bottom rectangle
  });

  test('node depths average the adjacent cell tops (smoothed display surface)', () => {
    const tops = dipGrid.tops;
    // Interior node between columns 1 and 2 averages 8000 and 8100.
    expect(nodeDepth(dipGrid, tops, 1, 1)).toBeCloseTo(8050, 6);
    // Corner node touches only cell (1,1).
    expect(nodeDepth(dipGrid, tops, 0, 0)).toBeCloseTo(8000, 6);
  });

  test('decimates large grids under the quad budget', () => {
    const big = {
      nx: 200, ny: 200, nz: 1, dx: 100, dy: 100, topsDepth: 9000, layers: [{ dz: 40 }],
    };
    const scene = buildGridScene(big, { maxQuads: 3600 });
    expect(scene.quads.length).toBeLessThanOrEqual(3600);
    expect(scene.quads.length).toBeGreaterThanOrEqual(2500);
  });

  test('vertical wells run from completion top to base with a stalk when needed', () => {
    const line = wellLineVertical({ name: 'P', type: 'producer', i: 2, j: 1, k1: 2, k2: 2 }, flatGrid);
    expect(line.path).toEqual([[750, 200, 8030], [750, 200, 8080]]);
    expect(line.stalk).toEqual([[750, 200, 8000], [750, 200, 8030]]);
    const full = wellLineVertical({ name: 'P', type: 'producer', i: 1, j: 1, k1: 1, k2: 2 }, flatGrid);
    expect(full.stalk).toBeNull();
  });

  test('deviated paths decimate to ~120 points and keep the endpoint', () => {
    const pathFt = Array.from({ length: 600 }, (_, k) => ({ x: k, y: 0, depth: 8000 + k }));
    const line = wellLineFromPath({ name: 'D', type: 'producer' }, pathFt);
    expect(line.path.length).toBeLessThanOrEqual(121);
    expect(line.path[line.path.length - 1]).toEqual([599, 0, 8599]);
  });

  test('projection: map view at 90°, deeper is lower in section view, painter order far-first', () => {
    const scene = buildGridScene(dipGrid);
    scene.wells.push(wellLineVertical({ name: 'P', type: 'producer', i: 4, j: 2, k1: 1, k2: 2 }, dipGrid));

    // Map view: no depth influence on screen y — the outline is the areal box.
    const map = projectScene(scene, { azimuthDeg: 0, elevationDeg: 90, vertExag: 5 });
    expect(map.extent.width).toBeCloseTo(2000, 4);
    expect(map.extent.height).toBeCloseTo(1200, 4);

    // Section view (elevation 0, azimuth 0): screen y = exaggerated depth.
    const sec = projectScene(scene, { azimuthDeg: 0, elevationDeg: 0, vertExag: 2 });
    const shallowQuad = sec.polys.find((p) => p.t === 0);
    const deepQuad = sec.polys.find((p) => p.t === 1);
    expect(Math.min(...deepQuad.pts.map((p) => p[1])))
      .toBeGreaterThan(Math.max(...shallowQuad.pts.map((p) => p[1])));
    // Painter order: farthest quads first.
    for (let k = 1; k < sec.polys.length; k += 1) {
      expect(sec.polys[k - 1].far + 1e-9).toBeGreaterThanOrEqual(sec.polys[k].far);
    }

    // Wells and posts project alongside.
    expect(sec.wells[0].path).toHaveLength(2);
    expect(sec.posts).toHaveLength(8);
  });

  test('flat grids color mid-ramp; auto vertical exaggeration is bounded', () => {
    const flatScene = buildGridScene(flatGrid);
    const p = projectScene(flatScene, { elevationDeg: 30 });
    expect(p.polys.every((q) => q.t === 0.5)).toBe(true);
    expect(depthColor(0)).toMatch(/^rgb\(/);
    const ve = autoVertExag(flatScene);
    expect(ve).toBeGreaterThanOrEqual(1);
    expect(ve).toBeLessThanOrEqual(50);
    expect(autoVertExag(buildGridScene(dipGrid))).toBeGreaterThanOrEqual(1);
  });
});

describe('builder integration (per-well history)', () => {
  test('per-well periods compose into WCONHIST with each well\'s own rates', () => {
    const { rows } = parseWellRateCsv(CSV);
    const form = defaultBuilderForm();
    form.wells = [
      { name: 'PROD1', type: 'producer', i: '9', j: '9', k1: '1', k2: '3', refDepth: '8000', mode: 'ORAT', rate: '1500', bhp: '1200', trajectory: null },
      { name: 'PROD2', type: 'producer', i: '5', j: '5', k1: '1', k2: '3', refDepth: '8000', mode: 'ORAT', rate: '800', bhp: '1200', trajectory: null },
      { name: 'INJ1', type: 'water_injector', i: '2', j: '2', k1: '1', k2: '3', refDepth: '8000', rate: '2400', bhp: '6500', trajectory: null },
    ];
    const hist = historyFromWellRows(rows, form.wells.map((w) => ({ name: w.name, type: w.type })));
    form.history = {
      enabled: true,
      source: 'perwell',
      caseName: 'Per-well CSV',
      startDate: hist.startDate,
      endDate: hist.endDate,
      periods: hist.periods,
      predictionYears: '1',
    };
    const out = buildDeckFromForm(form);
    expect(out.ok).toBe(true);
    expect(out.deck).toContain("'PROD1' 'OPEN' 'ORAT' 1500 100 900 /");
    expect(out.deck).toContain("'PROD2' 'OPEN' 'ORAT' 800 50 400 /");
    expect(out.deck).toContain("'INJ1' 'WATER' 'OPEN' 2400 /");
    expect(out.deck).toContain('WOPRH');
    expect(out.spec.startDate).toBe('2024-01-01');
  });
});

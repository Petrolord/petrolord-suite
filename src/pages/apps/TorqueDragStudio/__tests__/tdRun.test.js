// Service-layer closed loop: the in-memory backend's seeded golden case,
// pushed through runCase/runWear, must reproduce the oracle goldens — the
// same numbers the e2e spec asserts off the harness UI.
import fs from 'fs';
import path from 'path';
import {
  runCase, runWear, runSensitivity, buildEngineGeometry, totalStringLengthM,
  forceOut, torqueOut, depthOut, depthIn, forceLabel, torqueLabel,
} from '../services/tdRun';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const G = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
    'test-data', 'drilling', 'goldens', name), 'utf8'));

const tdGolden = G('torquedrag_cases.json');
const wearGolden = G('casingwear_cases.json');
const horizontal = tdGolden.cases.find((c) => c.name === 'horizontal');

function expectClose(a, b, rtol, atol = 0) {
  if (!Number.isFinite(a)) throw new Error(`non-finite value ${a} (expected ~ ${b})`);
  const tol = atol + rtol * Math.abs(b);
  if (Math.abs(a - b) > tol) {
    throw new Error(`expected ${a} ~ ${b} (rtol ${rtol}, atol ${atol})`);
  }
}

async function seeded() {
  const backend = makeInMemoryBackend();
  const { stations } = await backend.getDefinitiveTrajectory('wb-1');
  const [caseRow] = await backend.listCases('wb-1');
  const geometryRow = await backend.getGeometry('wb-1');
  return { backend, stations, caseRow, geometryRow };
}

test('seeded golden case reproduces the oracle summaries end to end', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { results } = runCase({ stations, caseRow, geometryRow, stepM: 1 });
  for (const op of ['trip_out', 'trip_in', 'rotate_on_bottom', 'slide_drill']) {
    const exp = horizontal.expected[op];
    expectClose(results[op].summary.hookloadN, exp.hookloadN, 1e-4, 200);
    expectClose(results[op].summary.surfaceTorqueNm, exp.surfaceTorqueNm, 1e-4, 5);
  }
});

test('buildEngineGeometry maps stored sections + friction config', async () => {
  const { caseRow, geometryRow } = await seeded();
  const geometry = buildEngineGeometry(geometryRow.hole_sections, caseRow.friction);
  expect(geometry).toHaveLength(horizontal.geometry.length);
  for (let i = 0; i < geometry.length; i += 1) {
    expect(geometry[i].fromMd).toBe(horizontal.geometry[i].fromMd);
    expect(geometry[i].toMd).toBe(horizontal.geometry[i].toMd);
    expect(geometry[i].holeIdM).toBeCloseTo(horizontal.geometry[i].holeIdM, 9);
    expect(geometry[i].frictionFactor).toBe(horizontal.geometry[i].frictionFactor);
  }
  // Per-section override wins over the cased/open defaults.
  const withOverride = buildEngineGeometry(geometryRow.hole_sections, {
    cased: 0.25, open: 0.35, overrides: [{ fromMd: 0, toMd: 5000, frictionFactor: 0.1 }],
  });
  expect(withOverride.every((g) => g.frictionFactor === 0.1)).toBe(true);
});

test('runWear reproduces the wear golden summary through the service layer', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { results } = runCase({ stations, caseRow, geometryRow, stepM: 1 });
  const wear = runWear({ results, caseRow, geometryRow });
  expect(wear).not.toBeNull();
  expectClose(wear.summary.maxWearDepthM, wearGolden.summary.maxWearDepthM, 5e-3, 1e-6);
  expectClose(wear.summary.minRemainingWallM, wearGolden.summary.minRemainingWallM, 5e-3, 1e-6);
});

test('runSensitivity sweeps the friction grid monotonically', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const rows = runSensitivity({
    stations, caseRow, geometryRow, operation: 'trip_out',
    casedValues: [0.15, 0.25], openValues: [0.25, 0.35], stepM: 10,
  });
  expect(rows).toHaveLength(4);
  const hl = (c, o) => rows.find((r) => r.cased === c && r.open === o).hookloadN;
  expect(hl(0.25, 0.35)).toBeGreaterThan(hl(0.15, 0.25));
});

test('unit helpers: SI ↔ display for m and ft wellbores', () => {
  expectClose(forceOut(4448.2216153e3, 'ft'), 1000, 1e-9);
  expectClose(forceOut(5000, 'm'), 5, 1e-12);
  expectClose(torqueOut(1355.8179483, 'ft'), 1, 1e-9);
  expectClose(depthOut(304.8, 'ft'), 1000, 1e-9);
  expectClose(depthIn(1000, 'ft'), 304.8, 1e-9);
  expect(forceLabel('ft')).toBe('klbf');
  expect(torqueLabel('m')).toBe('kN-m');
});

test('runCase surfaces actionable errors', async () => {
  const { caseRow, geometryRow } = await seeded();
  expect(() => runCase({ stations: [], caseRow, geometryRow }))
    .toThrow(/definitive design/);
  expect(() => runCase({
    stations: horizontal.stations, caseRow: { ...caseRow, string: [] }, geometryRow,
  })).toThrow(/drillstring is empty/);
  expect(totalStringLengthM(caseRow.string)).toBe(2800);
});

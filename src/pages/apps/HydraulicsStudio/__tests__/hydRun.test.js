// Service-layer closed loop: the seeded golden case through hydRun must
// reproduce the oracle goldens — the same numbers e2e asserts off the UI.
import fs from 'fs';
import path from 'path';
import {
  runHydraulics, runSurgeSwab, runHoleCleaning, safeTripSpeed,
  requiredFlowRate, nozzleTfaM2, mudModel,
  pressureOut, flowOut, flowIn, emwOut, densityIn,
} from '../services/hydRun';
import { makeInMemoryBackend, SEED_NOZZLES_MM } from '../services/inMemoryBackend';

const G = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
    'test-data', 'drilling', 'goldens', name), 'utf8'));

const golden = G('hydraulics_cases.json');
const CASE = golden.cases.find((c) => c.well === 'slant' && c.mudName === 'kcl_polymer');

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

test('seeded nozzles reproduce the golden TFA exactly', () => {
  // Golden floats are rounded to 9 dp; allow that quantum.
  expectClose(nozzleTfaM2(SEED_NOZZLES_MM), CASE.nozzleTfaM2, 1e-6, 1e-9);
});

test('hydraulics end to end matches the oracle', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const res = runHydraulics({ stations, caseRow, geometryRow });
  const exp = CASE.expected.hydraulics['q_0.025'];
  expectClose(res.summary.pumpPressurePa, exp.pumpPressurePa, 1e-6, 1);
  expectClose(res.summary.bitDpPa, exp.bitDpPa, 1e-6, 1);
  expectClose(res.summary.ecdAtTdKgM3, exp.ecdAtTdKgM3, 1e-6, 1e-4);
});

test('surge/swab sweep + safe speed through the service layer', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const ss = runSurgeSwab({ stations, caseRow, geometryRow, speeds: [0.2, 0.5, 1.0] });
  const exp = CASE.expected.surgeSwab;
  expectClose(ss.sweep[1].surgeEmwKgM3, exp['v_0.5'].surgeEmwKgM3, 1e-6, 1e-4);
  expectClose(ss.sweep[2].swabEmwKgM3, exp['v_1.0'].swabEmwKgM3, 1e-6, 1e-4);
  const vSafe = safeTripSpeed({
    stations, caseRow, geometryRow, poreEmwKgM3: exp['v_0.5'].swabEmwKgM3,
  });
  expectClose(vSafe, 0.5, 1e-3);
});

test('hole cleaning + required flow rate', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const hc = runHoleCleaning({ stations, caseRow, geometryRow });
  expectClose(hc.summary.minTransportRatio, CASE.expected.holeCleaning.minTransportRatio, 1e-6, 1e-9);
  const q = requiredFlowRate({ stations, caseRow, geometryRow, targetTr: 0.85 });
  expect(q).toBeGreaterThan(0);
});

test('mud model picker honors explicit choices', async () => {
  const { caseRow } = await seeded();
  expect(mudModel(caseRow.mud).model.type).toBe('herschelBulkley');
  expect(mudModel({ ...caseRow.mud, model: 'bingham' }).model.type).toBe('bingham');
  expect(() => mudModel({ densityKgM3: 1200 })).toThrow(/Fann/);
});

test('unit helpers', () => {
  expectClose(pressureOut(6894.757, 'ft'), 1, 1e-9);
  expectClose(flowOut(6.30902e-5, 'ft'), 1, 1e-6);
  expectClose(flowIn(600, 'ft'), 600 * 6.30902e-5, 1e-12);
  expectClose(emwOut(1198.26, 'ft'), 10, 1e-6);
  expectClose(densityIn(1.44, 'm'), 1.44, 1e-12);
});

test('actionable errors', async () => {
  const { caseRow, geometryRow } = await seeded();
  expect(() => runHydraulics({ stations: [], caseRow, geometryRow })).toThrow(/definitive design/);
  expect(() => runHydraulics({
    stations: CASE.stations,
    caseRow: { ...caseRow, flow: { flowRateM3s: 0 } },
    geometryRow,
  })).toThrow(/flow rate/);
});

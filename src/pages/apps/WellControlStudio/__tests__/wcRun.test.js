// Service-layer closed loop: the seeded golden kick through wcRun must
// reproduce the oracle goldens — the same numbers e2e asserts off the UI.
import fs from 'fs';
import path from 'path';
import {
  runVolumes, runKillSheet, runKickTolerance, scrPressurePa,
  pressureOut, volumeOut, emwOut, emwIn, depthIn,
} from '../services/wcRun';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const G = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
    'test-data', 'drilling', 'goldens', name), 'utf8'));

const golden = G('wellcontrol_cases.json');
const CASE = golden.cases.find((c) => c.well === 'slant');

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

test('volumes and TVDs match the oracle', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const v = runVolumes({ stations, caseRow, geometryRow });
  const ev = CASE.expected.volumes;
  expectClose(v.stringVolumeM3, ev.stringVolumeM3, 1e-6, 1e-9);
  expectClose(v.annulusVolumeM3, ev.annulusVolumeM3, 1e-6, 1e-9);
  expectClose(v.tvdBhM, ev.tvdBhM, 1e-6, 1e-6);
  expectClose(v.tvdShoeM, ev.tvdShoeM, 1e-6, 1e-6);
  expectClose(v.strokes.fullCycle, (ev.stringVolumeM3 + ev.annulusVolumeM3) / CASE.pump.outputM3PerStroke, 1e-6);
});

test('kill sheet through the service layer matches the moderate_gas golden', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { result } = runKillSheet({ stations, caseRow, geometryRow });
  const exp = CASE.expected.killSheets.moderate_gas;
  expectClose(result.killMudDensityKgM3, exp.killMudDensityKgM3, 1e-6, 1e-6);
  expectClose(result.icpPa, exp.icpPa, 1e-6, 1);
  expectClose(result.fcpPa, exp.fcpPa, 1e-6, 1);
  expectClose(result.totalStrokes, exp.totalStrokes, 1e-6, 1e-6);
  expect(result.influx.kind).toBe(exp.influx.kind);
  expect(scrPressurePa(caseRow)).toBe(CASE.pump.scrPressurePa);
});

test('kick tolerance + sweep match the golden', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { result, sweep } = runKickTolerance({
    stations, caseRow, geometryRow,
    sweepDensities: CASE.expected.ktSweep.map((r) => r.mudDensityKgM3),
  });
  expectClose(result.maaspPa, CASE.expected.kickTolerance.maaspPa, 1e-6, 1);
  expectClose(result.kickToleranceM3, CASE.expected.kickTolerance.kickToleranceM3, 1e-6, 1e-9);
  for (let i = 0; i < sweep.length; i += 1) {
    expectClose(sweep[i].kickToleranceM3, CASE.expected.ktSweep[i].kickToleranceM3, 1e-6, 1e-9);
  }
});

test('unit helpers', () => {
  expectClose(pressureOut(6894.757, 'ft'), 1, 1e-9);
  expectClose(volumeOut(0.1589873, 'ft'), 1, 1e-9);
  expectClose(emwOut(1198.26, 'ft'), 10, 1e-6);
  expectClose(emwIn(1.2, 'm'), 1200, 1e-12);
  expectClose(depthIn(1000, 'ft'), 304.8, 1e-9);
});

test('actionable errors', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  expect(() => runKillSheet({ stations: [], caseRow, geometryRow })).toThrow(/definitive design/);
  expect(() => runKillSheet({
    stations, caseRow: { ...caseRow, shoe: {} }, geometryRow,
  })).toThrow(/shoe MD/);
  expect(() => runKickTolerance({
    stations, caseRow: { ...caseRow, shoe: { mdM: caseRow.shoe.mdM } }, geometryRow,
  })).toThrow(/fracture EMW/);
  expect(() => scrPressurePa({ pump: { scr: [] } })).toThrow(/slow circulating/);
});

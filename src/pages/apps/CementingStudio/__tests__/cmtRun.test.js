// Service-layer closed loop: the seeded golden job through cmtRun must
// reproduce the oracle goldens — the same numbers e2e asserts off the UI.
import fs from 'fs';
import path from 'path';
import {
  runVolumes, runPlacement, runStandoff, runChecklist, resolveProgram,
  fluidModel, volumeOut, pressureOut, emwOut, depthIn,
} from '../services/cmtRun';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const G = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
    'test-data', 'drilling', 'goldens', name), 'utf8'));

const golden = G('cementing_cases.json');
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

test('job volumes match the oracle', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const vols = runVolumes({ stations, caseRow, geometryRow });
  const ev = CASE.expected.volumes;
  for (const key of ['slurryM3', 'leadM3', 'tailM3', 'displacementM3', 'sacks']) {
    expectClose(vols[key], ev[key], 1e-6, 1e-9);
  }
});

test('placement through the service layer matches the lead_tail golden', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { placement, fluids } = runPlacement({ stations, caseRow, geometryRow });
  const exp = CASE.expected.programs.lead_tail;
  expectClose(placement.endPumpPressurePa, exp.endPumpPressurePa, 1e-6, 1);
  expectClose(placement.achievedTocMd, exp.achievedTocMd, 1e-6, 1e-6);
  expectClose(placement.maxEcdPrevShoeKgM3, exp.maxEcdPrevShoeKgM3, 1e-6, 1e-4);
  expect(placement.freeFall).toBe(exp.freeFall);
  // Auto-volumes resolved from the job volumes.
  expect(fluids.find((f) => f.kind === 'lead').volumeM3).toBeGreaterThan(0);
});

test('standoff + required spacing match the oracle', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const { profile, requiredSpacingM } = runStandoff({ stations, caseRow, geometryRow });
  expectClose(profile.minStandoff, CASE.expected.standoff.minStandoff, 1e-6, 1e-9);
  expectClose(requiredSpacingM, CASE.expected.requiredSpacingM, 1e-6, 1e-6);
});

test('checklist composes', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  const list = runChecklist({ stations, caseRow, geometryRow });
  expect(list.total).toBeGreaterThanOrEqual(5);
  expect(list.items.find((i) => i.id === 'density-hierarchy').ok).toBe(true);
});

test('fluid model resolution and unit helpers', () => {
  expect(fluidModel({ fann: { theta600: 64, theta300: 38 } }).type).toBe('herschelBulkley');
  expect(fluidModel({ pvPaS: 0.02, ypPa: 5 }).type).toBe('bingham');
  expect(fluidModel({})).toBeNull();
  expectClose(volumeOut(0.1589873, 'ft'), 1, 1e-9);
  expectClose(pressureOut(6894.757, 'ft'), 1, 1e-9);
  expectClose(emwOut(1198.26, 'ft'), 10, 1e-6);
  expectClose(depthIn(100, 'ft'), 30.48, 1e-9);
});

test('actionable errors', async () => {
  const { stations, caseRow, geometryRow } = await seeded();
  expect(() => runVolumes({ stations: [], caseRow, geometryRow })).toThrow(/definitive design/);
  expect(() => runVolumes({
    stations, caseRow: { ...caseRow, casing: {} }, geometryRow,
  })).toThrow(/casing/);
  expect(() => resolveProgram({ caseRow: { fluids: { program: [] } }, vols: {} })).toThrow(/pump program/);
});

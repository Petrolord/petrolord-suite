// Service-layer closed loop: the seeded golden published-curve case through
// gmRun must reproduce the oracle goldens — the numbers e2e asserts off the
// UI.
import fs from 'fs';
import path from 'path';
import {
  assembleBaseProfile, runMem, runWindow, emwOut, depthOut,
} from '../services/gmRun';
import { preparePublishLogs, staleOwnCurves, GM_PIPELINE_VERSION } from '../services/publishGm';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

const G = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines',
    'test-data', 'drilling', 'goldens', name), 'utf8'));

const golden = G('geomech_cases.json');
const CASE = golden.cases.find((c) => c.well === 'slant');
const PROF = golden.profile;

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
  const logs = await backend.listGeoLogs('gw-1');
  const by = (m) => logs.find((l) => l.mnemonic === m);
  const published = {
    tvdM: PROF.tvdM,
    ppPa: Array.from(await backend.downloadCurve(by('PP')), (v) => v * 1e6),
    obgPa: Array.from(await backend.downloadCurve(by('OBG')), (v) => v * 1e6),
  };
  const dt = Array.from(await backend.downloadCurve(by('DT')));
  return { backend, stations, caseRow, published, dt };
}

test('published-curve base profile + MEM matches the oracle profile', async () => {
  const { caseRow, published, dt } = await seeded();
  const base = assembleBaseProfile({ source: caseRow.source, published });
  const mem = runMem({ base, dtUsPerM: dt, params: caseRow.params });
  for (let i = 0; i < PROF.tvdM.length; i += 8) {
    expectClose(mem.profile.shminPa[i], PROF.shminPa[i], 1e-4, 1e3);
    expectClose(mem.profile.shmaxPa[i], PROF.shmaxPa[i], 1e-4, 1e3);
    expectClose(mem.profile.ucsPa[i], PROF.ucsPa[i], 1e-4, 1e3);
  }
  expect(mem.quality.score).toBeGreaterThan(0);
});

test('mud window along the golden slant trajectory matches the oracle', async () => {
  const { stations, caseRow, published, dt } = await seeded();
  const base = assembleBaseProfile({ source: caseRow.source, published });
  const mem = runMem({ base, dtUsPerM: dt, params: caseRow.params });
  const win = runWindow({ stations, mem, params: caseRow.params });
  expect(win.rows.length).toBe(CASE.expected.nRows);
  for (const cp of CASE.expected.checkpoints) {
    const row = win.rows.find((r) => Math.abs(r.md - cp.md) < 1e-6);
    expect(row).toBeTruthy();
    // Float32 round-trip through the published curves costs ~1e-7 relative.
    expectClose(row.collapseEmwKgM3, cp.collapseEmwKgM3, 1e-4, 0.05);
    expectClose(row.fracInitEmwKgM3, cp.fracInitEmwKgM3, 1e-4, 0.05);
  }
  expectClose(win.tightest.md, CASE.expected.tightestMd, 1e-6, 1e-6);
  expectClose(win.tightest.widthKgM3, CASE.expected.tightestWidthKgM3, 1e-3, 0.1);
});

test('gm-1.0.0 publish round trip with overwrite-own', async () => {
  const { backend, caseRow, published, dt } = await seeded();
  const base = assembleBaseProfile({ source: caseRow.source, published });
  const mem = runMem({ base, dtUsPerM: dt, params: caseRow.params });
  const prepared = preparePublishLogs({ profile: mem.profile, params: caseRow.params, meta: { projectId: caseRow.id } });
  expect(prepared.map((l) => l.mnemonic)).toEqual(['SHMIN', 'SHMAX', 'UCS']);
  expect(prepared[0].unit).toBe('MPA');
  expect(prepared[0].provenance.pipeline_version).toBe(GM_PIPELINE_VERSION);
  await backend.publishCurves('gw-1', prepared, caseRow.id);
  const logs = await backend.listGeoLogs('gw-1');
  expect(logs.filter((l) => l.mnemonic === 'SHMIN').length).toBe(1);
  // Republish replaces only own computed curves; pp-1.0.0 rows untouched.
  const stale = staleOwnCurves(logs, prepared, caseRow.id);
  expect(stale.every((l) => l.provenance.engine === 'geomechanics-studio')).toBe(true);
  expect(stale.length).toBe(3);
  await backend.publishCurves('gw-1', prepared, caseRow.id);
  const logs2 = await backend.listGeoLogs('gw-1');
  expect(logs2.filter((l) => l.mnemonic === 'PP').length).toBe(1);
});

test('actionable errors + unit helpers', async () => {
  const { caseRow } = await seeded();
  expect(() => assembleBaseProfile({ source: { ppSource: 'published' }, published: null }))
    .toThrow(/published pp-1.0.0/);
  expect(() => assembleBaseProfile({ source: { ppSource: 'computed' }, logs: null }))
    .toThrow(/DEPT and DT/);
  const base = { tvdM: [100], svPa: [2e6], ppPa: [1e6] };
  expect(() => runMem({ base, dtUsPerM: null, params: caseRow.params }))
    .toThrow(/DT curve/);
  expectClose(emwOut(1198.26, 'ft'), 10, 1e-6);
  expectClose(depthOut(304.8, 'ft'), 1000, 1e-9);
});

// D10 closed loop: the pure wiRun service must reproduce the oracle
// golden (wellintegrity_cases.json) end to end — barrier statuses and
// category, MAWOP rows at the trajectory TVDs, balanced-plug placement,
// zone compliance and the program verdict.
import golden from '../../../../../packages/engines/test-data/drilling/goldens/wellintegrity_cases.json';
import {
  runAll, buildGoldenCaseDoc, defaultCaseDoc, annulusChartRows,
  balancedPlug, ENGINE_VERSION,
} from '../services/wiRun';
import { goldenCaseDoc, makeInMemoryBackend, HARNESS_GOLDEN } from '../services/inMemoryBackend';

function expectClose(a, b, rtol, atol = 0) {
  if (!Number.isFinite(a)) throw new Error(`non-finite value ${a} (expected ~ ${b})`);
  const tol = atol + rtol * Math.abs(b);
  if (Math.abs(a - b) > tol) {
    throw new Error(`expected ${a} ~ ${b} (rtol ${rtol}, atol ${atol})`);
  }
}

const doc = buildGoldenCaseDoc(golden);
const res = runAll({ caseDoc: doc, stations: golden.stations });

test('barrier statuses and category match the oracle', () => {
  expect(res.barriers.primary.status).toBe(golden.barrier.primaryStatus);
  expect(res.barriers.secondary.status).toBe(golden.barrier.secondaryStatus);
  expect(res.barriers.category).toBe(golden.barrier.category);
  expect(res.barriers.shared).toEqual([]);
  expect(res.kpis.status).toBe('WARN'); // yellow well + failing zone
});

test('MAWOP rows at the trajectory TVDs match the oracle', () => {
  const a = res.annuli[0];
  expect(a.result.governing).toBe(golden.annulus.mawop.governing);
  expectClose(a.result.mawopPa, golden.annulus.mawop.mawopPa, 1e-9);
  a.result.rows.forEach((r, i) => {
    const g = golden.annulus.mawop.rows[i];
    expectClose(r.tvdM, g.tvdM, 1e-9, 1e-9);
    expectClose(r.allowSurfacePa, g.allowSurfacePa, 1e-9, 1e-6);
  });
  const chart = annulusChartRows(a);
  expect(chart).toHaveLength(3);
  expect(chart.filter((c) => c.governing)).toHaveLength(1);
});

test('program compliance, placement and takeoff match the oracle', () => {
  expect(res.program.zoneCompliance.map((z) => z.pass))
    .toEqual(golden.program.zoneCompliance.map((z) => z.passZone));
  expect(res.program.pass).toBe(golden.program.programPass);
  const p1 = res.program.designs.find((d) => d.name === 'P1 reservoir primary');
  expectClose(p1.placement.slurryM3, golden.program.p1Placement.slurryM3, 1e-9);
  expectClose(p1.placement.displacementM3, golden.program.p1Placement.displacementM3, 1e-9, 1e-9);
  expectClose(res.program.takeoff.slurryM3, golden.program.p1Placement.slurryM3, 1e-9);
});

test('balanced plug hand fixture through the shim', () => {
  const f = golden.params.plugFixture;
  const out = balancedPlug(f);
  expectClose(out.pluggedTopMdM, 1820, 1e-12);
  expectClose(out.slurryM3, golden.plug.slurryM3, 1e-9);
});

test('no trajectory: TVD falls back to MD with a warning, status WARN', () => {
  const out = runAll({ caseDoc: doc, stations: null });
  expect(out.warnings.some((w) => /TVD/.test(w))).toBe(true);
  // Vertical fallback: A-annulus row TVDs equal the entered MDs.
  expect(out.annuli[0].result.rows[0].tvdM).toBe(doc.annulus.annuli[0].elements[0].mdM);
});

test('default case doc evaluates cleanly and the seed is the golden', () => {
  const def = runAll({ caseDoc: defaultCaseDoc({ tdMdM: 3000 }), stations: golden.stations });
  expect(def.barriers.category).toBe('green');
  expect(def.program.pass).toBe(true);
  expect(def.kpis.status).toBe('PASS');
  expect(ENGINE_VERSION).toBe('drilling-wi10');
  expect(goldenCaseDoc().barrier.elements).toHaveLength(HARNESS_GOLDEN.barrier.elements.length);
});

test('in-memory backend CRUD round-trip', async () => {
  const b = makeInMemoryBackend();
  const cases = await b.listCases('wb-1');
  expect(cases).toHaveLength(1);
  const created = await b.saveCase({ wellbore_id: 'wb-1', ...defaultCaseDoc() });
  expect((await b.listCases('wb-1'))).toHaveLength(2);
  await b.updateCase(created.id, { name: 'Renamed' });
  expect((await b.listCases('wb-1')).find((c) => c.id === created.id).name).toBe('Renamed');
  const run = await b.saveRun({ case_id: created.id, params: {}, results: {}, summary: {} });
  expect(await b.listRuns(created.id)).toHaveLength(1);
  await b.deleteRun(run.id);
  await b.deleteCase(created.id);
  expect((await b.listCases('wb-1'))).toHaveLength(1);
});

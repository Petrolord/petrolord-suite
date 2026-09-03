// D8 closed loop: the pure psRun service must reproduce the oracle golden
// (perfsand_cases.json) end to end — skin/PR through the catalog gun,
// underbalance, sieve/gravel/screen/advisor, sanding CDP on the golden
// curves — and the clearance verdicts must flip with the gun choice.
import golden from '../../../../../packages/engines/test-data/drilling/goldens/perfsand_cases.json';
import completionGolden from '../../../../../packages/engines/test-data/drilling/goldens/completion_cases.json';
import {
  runAll, buildGoldenCaseDoc, defaultCaseDoc, gunFromCatalog,
  parseSieveCsv, psdChartRows, cdpChartRows, GUN_CATALOG,
} from '../services/psRun';
import { goldenCaseDoc, makeInMemoryBackend, HARNESS_GOLDEN } from '../services/inMemoryBackend';
import { pickPublishedGm, publishedToCurves, pickPublishedPpfg } from '../services/prepPs';

const IN = 0.0254;

function expectClose(a, b, rtol, atol = 0) {
  if (!Number.isFinite(a)) throw new Error(`non-finite value ${a} (expected ~ ${b})`);
  const tol = atol + rtol * Math.abs(b);
  if (Math.abs(a - b) > tol) {
    throw new Error(`expected ${a} ~ ${b} (rtol ${rtol}, atol ${atol})`);
  }
}

const curves = {
  tvdM: golden.profile.tvdM, svPa: golden.profile.svPa,
  shmaxPa: golden.profile.shmaxPa, shminPa: golden.profile.shminPa,
  ppPa: golden.profile.ppPa, ucsPa: golden.profile.ucsPa,
};

async function backendPieces() {
  const backend = makeInMemoryBackend();
  const [cases, cdCases, logs, traj] = await Promise.all([
    backend.listCases('wb-1'), backend.listCdCases('wb-1'),
    backend.listGeoLogs('gw-1'), backend.getDefinitiveTrajectory('wb-1'),
  ]);
  return { backend, cases, cdCases, logs, traj };
}

test('golden case doc reproduces the oracle skin, PR and underbalance', () => {
  const doc = buildGoldenCaseDoc(golden, completionGolden);
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  const exp = golden.guns[0].expected;
  for (const k of ['sH', 'sV', 'sWb', 'sCz', 'total']) {
    expectClose(res.perforation.skin[k], exp.skin[k], 1e-9, 1e-9);
  }
  expectClose(res.perforation.pr.ratio, exp.pr.ratio, 1e-9);
  expectClose(res.perforation.underbalance.minPa, golden.underbalance.oil.minPa, 1e-9);
  expectClose(res.kpis.totalSkin, exp.skin.total, 1e-9, 1e-9);
});

test('golden sieve drives Saucier, gauge and the advisor to the oracle answers', () => {
  const doc = buildGoldenCaseDoc(golden, completionGolden);
  const res = runAll({ caseDoc: doc });
  const exp = golden.sieve.expected;
  for (const k of ['d10M', 'd40M', 'd50M', 'd90M']) {
    expectClose(res.sand.stats[k], exp[k], 1e-9, 1e-9);
  }
  expectClose(res.sand.stats.uniformity, exp.uniformity, 1e-9);
  expect(res.sand.gravel.matches.map((m) => m.mesh)).toEqual(golden.gravel.expected.matches);
  expectClose(res.sand.gpScreen.gaugeM, golden.gravel.screenGaugeThou * 25.4e-6, 1e-12);
  expect(res.sand.advisor.indication).toBe(golden.gravel.advisorIndication);
  expect(res.kpis.gravelMesh).toBe(golden.gravel.expected.matches[0]);
});

test('sanding CDP profile matches the oracle sweep, both geometries', () => {
  const doc = buildGoldenCaseDoc(golden, completionGolden);
  for (const geometry of ['perf-tunnel', 'openhole']) {
    doc.params.sanding.geometry = geometry;
    const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
    const exp = golden.sanding.cdp[geometry];
    expect(res.sanding.rows).toHaveLength(exp.rows.length);
    expectClose(res.sanding.governing.cdpPa, exp.governing.cdpPa, 1e-9);
    expectClose(res.sanding.governing.mdM, exp.governing.mdM, 1e-9);
    expectClose(res.kpis.minCdpPa, exp.governing.cdpPa, 1e-9);
  }
});

test('the Sanding tab step never drops the interval bottom', () => {
  // The Step input on the Sanding tab is a free number, and a step that does
  // not divide the interval used to truncate the sweep: 2450 to 2550 at 30 m
  // stopped at 2540 and never screened the deepest ten metres. On a base that
  // is the weak rock, that row is the one that governs.
  const doc = buildGoldenCaseDoc(golden, completionGolden);
  const rg = golden.sanding.cdpRagged;
  doc.params.sanding.geometry = rg.geometry;
  doc.params.sanding.stepMdM = rg.stepMdM;
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  expect(res.sanding.rows).toHaveLength(rg.rows.length);
  res.sanding.rows.forEach((row, i) => {
    expectClose(row.mdM, rg.rows[i].mdM, 1e-9);
    expectClose(row.cdpPa, rg.rows[i].cdpPa, 1e-9);
  });
  for (const stepMdM of [7, 13, 25, 30, 40, 99, 150]) {
    doc.params.sanding.stepMdM = stepMdM;
    const r = runAll({ caseDoc: doc, stations: golden.stations, curves });
    expectClose(r.sanding.rows[0].mdM, doc.interval.topMdM, 1e-9);
    expectClose(r.sanding.rows[r.sanding.rows.length - 1].mdM, doc.interval.bottomMdM, 1e-9);
  }
});

test('through-tubing clearance flips with the gun choice against the D7 stack', async () => {
  const { cases, cdCases } = await backendPieces();
  const doc = cases[0];
  const small = runAll({ caseDoc: doc, cdCase: cdCases[0] });
  expect(small.clearance.basis).toBe('completion');
  expect(small.clearance.status).toBe('PASS');
  expect(small.clearance.controlling).toBeTruthy();

  const big = {
    ...doc,
    gun: gunFromCatalog(GUN_CATALOG.find((g) => g.name.startsWith('2-7/8"'))),
  };
  const failed = runAll({ caseDoc: big, cdCase: cdCases[0] });
  expect(failed.clearance.status).toBe('FAIL');
  expect(failed.kpis.status).toBe('FAIL');

  // Missing linkage stays honest.
  const unlinked = runAll({ caseDoc: doc });
  expect(unlinked.clearance.missing).toBe(true);
  expect(unlinked.clearance.status).toBe('WARN');
});

test('casing-gun clearance rides the snapshotted program drift', () => {
  const doc = buildGoldenCaseDoc(golden, completionGolden);
  doc.gun = gunFromCatalog(GUN_CATALOG.find((g) => g.name.startsWith('4-5/8"')));
  const res = runAll({ caseDoc: doc });
  expect(res.clearance.basis).toBe('casing');
  expect(res.clearance.status).toBe('PASS');
  // Interval 2450-2550 sits inside the 7" liner: its drift governs.
  expect(res.clearance.controlling).toMatch(/7/);
  const bigger = { ...doc, gun: gunFromCatalog(GUN_CATALOG.find((g) => g.name.startsWith('7"'))) };
  expect(runAll({ caseDoc: bigger }).clearance.status).toBe('FAIL');
});

test('published-curve pickers assemble the sanding profile from the harness logs', async () => {
  const { backend, logs } = await backendPieces();
  const gm = pickPublishedGm(logs);
  const ppfg = pickPublishedPpfg(logs);
  expect(Object.keys(gm).sort()).toEqual(['SHMAX', 'SHMIN', 'UCS']);
  const data = {};
  for (const [k, log] of [...Object.entries(gm), ['PP', ppfg.PP], ['OBG', ppfg.OBG]]) {
    data[k] = await backend.downloadCurve(log);
  }
  const { missing, curves: assembled } = publishedToCurves({ gm, ppfg, data });
  expect(missing).toBeNull();
  // Float32 MPa round trip: agree with the golden Pa arrays to ~1e-7 rel.
  expectClose(assembled.shminPa[10], golden.profile.shminPa[10], 1e-6);
  expectClose(assembled.svPa[10], golden.profile.svPa[10], 1e-6);
  const doc = goldenCaseDoc();
  const res = runAll({ caseDoc: doc, stations: HARNESS_GOLDEN.stations, curves: assembled });
  expectClose(res.sanding.governing.cdpPa,
    golden.sanding.cdp['perf-tunnel'].governing.cdpPa, 1e-5);
});

test('save/duplicate round trip through the backend keeps results identical', async () => {
  const { backend, cases, cdCases } = await backendPieces();
  const doc = cases[0];
  const before = runAll({ caseDoc: doc, cdCase: cdCases[0] });
  const dup = await backend.saveCase({
    ...doc, id: undefined, name: 'Copy', created_at: undefined,
  });
  const after = runAll({ caseDoc: dup, cdCase: cdCases[0] });
  expectClose(after.perforation.skin.total, before.perforation.skin.total, 1e-12);
  expectClose(after.kpis.productivityRatio, before.kpis.productivityRatio, 1e-12);
  await backend.deleteCase(dup.id);
  expect(await backend.listCases('wb-1')).toHaveLength(1);
});

test('sieve CSV parser and chart row helpers', () => {
  const { points, errors } = parseSieveCsv('size_um, pct\n500, 2\n350, 6\nbad,line\n125, 45');
  expect(points).toHaveLength(3);
  expect(errors).toHaveLength(1);
  expectClose(points[0].sizeM, 500e-6, 1e-12);
  const rows = psdChartRows(points);
  expect(rows[0].sizeUm).toBeGreaterThan(rows[1].sizeUm);
  expect(cdpChartRows(null)).toEqual([]);
});

test('default case doc runs without linkage and stays honest', () => {
  const doc = defaultCaseDoc({ tdMdM: 3000 });
  const res = runAll({ caseDoc: doc });
  expect(res.perforation.skin.total).toBeGreaterThan(-10);
  expect(res.sand.stats).toBeNull();
  expect(res.sanding).toBeNull();
  expect(res.clearance.status).toBe('WARN'); // no program snapshot yet
});

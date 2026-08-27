// D9 closed loop: the pure stRun service must reproduce the oracle golden
// (stim_cases.json) end to end — closure/pRes from the curves at the
// treatment TVD, PKN/KGD geometry, Nolte balance + schedule, proppant
// pack, Cinco-Ley productivity + FOI, and the acidizing block.
import golden from '../../../../../packages/engines/test-data/drilling/goldens/stim_cases.json';
import {
  runAll, buildGoldenCaseDoc, defaultCaseDoc, widthProfileRows,
  scheduleChartRows, DARCY_M2,
} from '../services/stRun';
import { goldenCaseDoc, makeInMemoryBackend, HARNESS_GOLDEN } from '../services/inMemoryBackend';
import { pickPublishedGm, pickPublishedPpfg, publishedToCurves } from '../../PerforationSandControl/services/prepPs';

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

test('rock context, geometry, balance and schedule match the oracle', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  expectClose(res.rock.midTvdM, golden.params.midTvdM, 1e-9);
  expectClose(res.rock.closurePa, golden.params.closurePa, 1e-9);
  expectClose(res.rock.pResPa, golden.params.pResPa, 1e-9);
  expect(res.rock.source).toBe('published');

  const e = golden.geometry.pkn;
  expectClose(res.ePrimePa, golden.params.ePrimePa, 1e-9);
  expectClose(res.geometry.wMaxM, e.wMaxM, 1e-8, 1e-9);
  expectClose(res.geometry.pNetPa, e.pNetPa, 1e-8);
  expectClose(res.geometry.bhtpPa, e.bhtpPa, 1e-8);
  expectClose(res.balance.tiS, golden.balance.tiS, 1e-6);
  expectClose(res.balance.etaFrac, golden.balance.etaFrac, 1e-6);
  expectClose(res.schedule.massKg, golden.schedule.massKg, 1e-6);
  res.schedule.steps.forEach((s, i) => {
    expectClose(s.cKgM3, golden.schedule.steps[i].cKgM3, 1e-6);
  });
  expect(res.kpis.status).toBe('PASS');
});

test('KGD toggle reproduces the oracle KGD geometry', () => {
  const doc = buildGoldenCaseDoc(golden);
  doc.frac.model = 'kgd';
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  const e = golden.geometry.kgd;
  expectClose(res.geometry.wMaxM, e.wMaxM, 1e-8, 1e-9);
  expectClose(res.geometry.pNetPa, e.pNetPa, 1e-8);
});

test('proppant pack, productivity and FOI match the oracle', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  expect(res.pack.clamped).toBe(false);
  expectClose(res.pack.kfM2 / DARCY_M2, golden.proppantPack.kfDarcy, 1e-6);
  expectClose(res.pack.wpM, golden.proppantPack.wpM, 1e-6, 1e-9);
  expectClose(res.pack.kfwM3 / DARCY_M2, golden.proppantPack.kfwDarcyM, 1e-6);
  expectClose(res.productivity.cfd, golden.productivity.cfd, 1e-6);
  expectClose(res.productivity.sF, golden.productivity.sF, 1e-6, 1e-9);
  expectClose(res.productivity.pr.ratio, golden.productivity.pr.ratio, 1e-6);
  expectClose(res.kpis.foi, golden.productivity.pr.ratio, 1e-6);
});

test('acidizing block matches the oracle', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
  expectClose(res.acid.sandstone.volumeM3, golden.acidizing.sandstone.volumeM3, 1e-9);
  expectClose(res.acid.sandstone.sBefore, golden.acidizing.sandstone.sBefore, 1e-9);
  expectClose(res.acid.sandstone.sAfter, golden.acidizing.sandstone.sAfter, 1e-9, 1e-12);
  expectClose(res.acid.carbonate.skin, golden.acidizing.carbonate.skin, 1e-9);
  expectClose(res.acid.matrixRate.qM3s, golden.acidizing.qMaxM3s, 1e-6, 1e-9);
});

test('published-curve pickers feed the run from the harness logs', async () => {
  const backend = makeInMemoryBackend();
  const logs = await backend.listGeoLogs('gw-1');
  const gm = pickPublishedGm(logs);
  const ppfg = pickPublishedPpfg(logs);
  const data = {};
  for (const [k, log] of [...Object.entries(gm), ['PP', ppfg.PP], ['OBG', ppfg.OBG]]) {
    data[k] = await backend.downloadCurve(log); // eslint-disable-line no-await-in-loop
  }
  const { missing, curves: assembled } = publishedToCurves({ gm, ppfg, data });
  expect(missing).toBeNull();
  const res = runAll({ caseDoc: goldenCaseDoc(), stations: HARNESS_GOLDEN.stations, curves: assembled });
  // Float32 MPa round trip: closure agrees to ~1e-7 relative.
  expectClose(res.rock.closurePa, golden.params.closurePa, 1e-6);
  expectClose(res.productivity.cfd, golden.productivity.cfd, 1e-4);
});

test('honesty without curves, chart helpers, default doc', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runAll({ caseDoc: doc });
  expect(res.rock.source).toBe('missing');
  expect(res.pack).toBeNull();
  expect(res.productivity).toBeNull();
  expect(res.acid.matrixRate).toBeNull();
  expect(res.kpis.status).toBe('WARN');

  const full = runAll({ caseDoc: doc, stations: golden.stations, curves });
  const wp = widthProfileRows({ geometry: full.geometry, xfM: doc.frac.xfM, n: 10 });
  expectClose(wp[0].wMm, full.geometry.wMaxM * 1000, 1e-12);
  expect(wp[wp.length - 1].wMm).toBe(0);
  const sch = scheduleChartRows(full.schedule);
  expect(sch[0].cKgM3).toBe(0);
  expect(sch[sch.length - 1].cKgM3).toBeGreaterThan(0);

  const d = defaultCaseDoc({ tdMdM: 3000 });
  const dres = runAll({ caseDoc: d, stations: golden.stations, curves });
  expect(dres.kpis.status).toBeTruthy();
});

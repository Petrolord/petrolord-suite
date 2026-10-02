/**
 * RP-U2-002 (2026-10-01): the wet background trend on the intercept-gradient
 * crossplot. The trend well has a known wet truth: the gas bed's logs are
 * the Gassmann gas state of its wet rock, so taking the gas out through the
 * SW log must return the wet trend, and the fluid line fitted through the
 * engine must be the line of the wet truth. Negative control: leave the gas
 * in (no SW log) and the fit moves.
 */
import { makeInMemoryBackend, trendWellTruth, TREND_GAS } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { wetTrend, wetLogs, castagnaTrend, anomaly, MIN_INTERFACES } from '../services/wetTrend';
import { blockLogs, interfacePoints, fitFluidLine, backgroundSlope } from '../engine/avoTrend';
import { shuey } from '../engine/avo';

async function load(name, opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return buildModel(curves, mapped);
}
const all = (m) => m.depth.map((_, i) => i);

test('taking the gas out through the SW log returns the wet truth', async () => {
  const model = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
  const truth = trendWellTruth();
  const wet = wetLogs(model, all(model), DEFAULT_SCENARIO, DEFAULT_ROCK);
  expect(wet.usedSwLog).toBe(true);
  expect(wet.substituted).toBe(25); // 2000 to 2012 m at 0.5 m
  let worst = 0;
  for (let i = 0; i < model.n; i++) worst = Math.max(worst, Math.abs(wet.vp[i] - truth.vp[i]) / truth.vp[i], Math.abs(wet.vs[i] - truth.vs[i]) / truth.vs[i], Math.abs(wet.rho[i] - truth.rho[i]) / truth.rho[i]);
  expect(worst).toBeLessThan(2e-5); // the curves are stored as f32 slowness
  // in situ the gas bed is slower and lighter than its wet state
  const iGas = model.depth.findIndex((d) => d === TREND_GAS.top + 2);
  expect(model.vp[iGas]).toBeLessThan(truth.vp[iGas] - 100);
});

test('the fitted fluid line is the wet truth line; the gas top sits off it, the wet top on it', async () => {
  const model = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
  const truth = trendWellTruth();
  const t = wetTrend(model, { fromMd: 1800, toMd: 2200 }, DEFAULT_SCENARIO, DEFAULT_ROCK, { blockM: 6 });
  expect(t.error).toBeUndefined();
  expect(t.source).toBe('fit');
  expect(t.usedSwLog).toBe(true);
  expect(t.points.length).toBeGreaterThanOrEqual(MIN_INTERFACES);
  // the same fit on the wet truth, through the engine
  const ref = fitFluidLine(interfacePoints(blockLogs(truth.vp, truth.vs, truth.rho, all(model), 12)));
  expect(t.line.slope).toBeCloseTo(ref.slope, 3);
  expect(t.line.slope).toBeLessThan(0);
  // the gas top in situ (shale over gas sand) and with the gas taken out
  const top = model.depth.findIndex((d) => d === TREND_GAS.top);
  const mean = (arr, from, to) => { let s = 0; let n = 0; for (let i = from; i < to; i++) { s += arr[i]; n += 1; } return s / n; };
  const hs = (m, from, to) => [mean(m.vp, from, to), mean(m.vs, from, to), mean(m.rho, from, to)];
  const up = hs(model, top - 10, top);
  const gasAB = shuey(...up, ...hs(model, top + 1, top + 11), 0);
  const wetAB = shuey(...up, ...hs(truth, top + 1, top + 11), 0);
  const dGas = anomaly(gasAB.a, gasAB.b, t);
  const dWet = anomaly(wetAB.a, wetAB.b, t);
  expect(dGas).toBeLessThan(-0.03);
  expect(Math.abs(dWet)).toBeLessThan(3 * t.line.rmsDistance + 0.01);
  expect(Math.abs(dGas)).toBeGreaterThan(3 * Math.abs(dWet));

  // negative control: with the gas left in (the SW log not read) the fit is another line and scatters more
  const noSw = wetTrend(model, { fromMd: 1800, toMd: 2200 }, { ...DEFAULT_SCENARIO, fluidA: { ...DEFAULT_SCENARIO.fluidA, swFromLog: false } }, DEFAULT_ROCK, { blockM: 6 });
  expect(noSw.usedSwLog).toBe(false);
  expect(noSw.substituted).toBe(0);
  expect(noSw.line.rmsDistance).toBeGreaterThan(1.5 * t.line.rmsDistance);
});

test('too few interfaces: the Castagna line for the window Vs/Vp is drawn, and the reason is given', async () => {
  const model = await load('KETA RP-1');
  const t = wetTrend(model, { fromMd: 2000, toMd: 2100 }, DEFAULT_SCENARIO, DEFAULT_ROCK, { blockM: 5 });
  expect(t.source).toBe('castagna');
  expect(t.reason).toMatch(/only \d interfaces in the window \(a fit needs 8\)/);
  expect(t.usedSwLog).toBe(false);
  expect(t.line.slope).toBeCloseTo(backgroundSlope(t.vsVp), 12);
  expect(t.castagnaSlope).toBe(t.line.slope);
  // the class III golden interface is far on the hydrocarbon side of it
  expect(anomaly(-0.1118, -0.2437, t)).toBeLessThan(-0.15);
  expect(wetTrend(model, { fromMd: 5000, toMd: 5001 }, DEFAULT_SCENARIO, DEFAULT_ROCK).error).toMatch(/fewer than four samples/);
});

test('manual halfspaces get the Castagna line of the given Vs/Vp: B = -A at Vp/Vs = 2', () => {
  const t = castagnaTrend(1500, 3000);
  expect(t.line.slope).toBeCloseTo(-1, 12);
  expect(t.source).toBe('castagna');
  expect(anomaly(0.1, -0.1, t)).toBeCloseTo(0, 12);
  expect(anomaly(-0.1, -0.3, t)).toBeCloseTo(-0.4 / Math.SQRT2, 12);
  expect(castagnaTrend(0, 3000)).toBeNull();
  expect(anomaly(NaN, 1, t)).toBeNaN();
});

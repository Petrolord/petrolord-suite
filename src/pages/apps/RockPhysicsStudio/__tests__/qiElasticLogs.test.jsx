/**
 * QI programme Q1 / A2 (2026-10-06): the elastic set for a zone and a
 * locally calibrated shear trend. The maths is the vendored engines'
 * (elasticSet.js; oracle and scipy goldens there); these gates prove the
 * Suite wires the right samples, applies the trend only where there is no
 * shear log, and drives the hydrocarbon iteration with it.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel, zoneIndices } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { zoneElastic } from '../services/elasticLogs';
import { fitLocalShear, applyLocalShearTrend, brineVsOf } from '../services/localShear';
import { applyIterativeVs, shearSourceText } from '../services/iterativeVs';
import { elasticPoint } from '../engine/elasticSet';
import ElasticPanel from '../components/ElasticPanel';

jest.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, ScatterChart: Pass, Scatter: () => null, XAxis: Pass, YAxis: Pass,
    CartesianGrid: () => null, Tooltip: () => null, Label: () => null,
  };
});

async function load(name, opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}
const all = (model) => Array.from({ length: model.n }, (_, i) => i);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('zoneElastic', () => {
  test('zone means are the engine elastic set; EEI(0) is AI', async () => {
    const { model, zones } = await load('KETA RP-1');
    const idx = zoneIndices(model.depth, zones[0].top_md_m, zones[0].base_md_m);
    const e = zoneElastic(model, idx, 0);
    const i = idx[0];
    const p = elasticPoint(model.vp[i], model.vs[i], model.rho[i]);
    expect(rel(e.curves.lambdaRho[i], p.lambdaRho)).toBeLessThan(1e-12);
    expect(rel(e.means.eei, e.means.ai)).toBeLessThan(1e-9);
    expect(e.n).toBe(idx.length);
    // negative control: a non-zero chi is not AI on a rock with shear contrast across the zone
    const e30 = zoneElastic(model, all(model), 30);
    expect(Math.abs(e30.means.eei - e30.means.ai) / e30.means.ai).toBeGreaterThan(1e-3);
  });
});

describe('local shear trend', () => {
  test('fits the wet trend of TREND RP-5 (mudrock line plus scatter), leaving the gas bed out', async () => {
    const { model } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const r = fitLocalShear(model, all(model), { wellName: 'TREND RP-5', zoneName: 'whole well' });
    expect(r.error).toBeUndefined();
    expect(r.wetOnly).toBe(true);
    expect(r.hydrocarbon).toBe(25);
    expect(Math.abs(r.trend.coef[1] - 862.1)).toBeLessThan(10); // m/s per km/s
    expect(r.trend.s).toBeLessThan(25);
    expect(r.trend.label).toBe('TREND RP-5, whole well');
    // negative control: counting the gas bed as wet spoils the fit
    const spoilt = fitLocalShear({ ...model, sw: null }, all(model));
    expect(spoilt.trend.s).toBeGreaterThan(r.trend.s);
  });

  test('a well without measured shear cannot calibrate a trend', async () => {
    const { model } = await load('AKOMA-2 (org shared)');
    expect(fitLocalShear(model, all(model)).error).toMatch(/no measured shear log/);
  });

  test('applied only where there is no shear log, with a sigma curve', async () => {
    const { model: cal } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const { trend } = fitLocalShear(cal, all(cal));
    const { model: est } = await load('AKOMA-2 (org shared)');
    const out = applyLocalShearTrend(est, trend);
    expect(out.vsMethod).toBe('local');
    const i = est.vp.findIndex((v) => v > 0);
    expect(out.vs[i]).toBeCloseTo(brineVsOf(trend)(est.vp[i]), 9);
    expect(out.vsSigma[i]).toBeGreaterThan(0);
    expect(shearSourceText(out)).toMatch(/local shear trend/);
    // negative control: measured shear is never replaced
    expect(applyLocalShearTrend(cal, trend)).toBe(cal);
  });

  test('drives the hydrocarbon iteration: closer to the true gas-bed shear than Greenberg-Castagna', async () => {
    const { model: cal } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const { trend } = fitLocalShear(cal, all(cal));
    // the same well with its shear hidden: the truth is the logged gas-bed Vs
    const truth = cal.vs;
    const hidden = { ...cal, vsSource: 'estimated', vs: Array.from(cal.vp, (v) => 0.5 * v) };
    const rock = { ...DEFAULT_ROCK, minerals: { quartz: 1, calcite: 0, dolomite: 0, clay: 0 }, localVs: trend };
    const gas = all(cal).filter((i) => cal.sw[i] < 1);
    const err = (m) => gas.reduce((s, i) => s + Math.abs(m.vs[i] - truth[i]), 0) / gas.length;
    const withTrend = applyIterativeVs(applyLocalShearTrend(hidden, trend), DEFAULT_SCENARIO, rock, null);
    const withGc = applyIterativeVs({ ...hidden, vs: Array.from(cal.vp, (v) => 0.5 * v) }, DEFAULT_SCENARIO, { ...rock, localVs: null }, null);
    expect(withTrend.vsIter.applied).toBe(gas.length);
    expect(err(withTrend)).toBeLessThan(40);
    expect(err(withTrend)).toBeLessThan(err(withGc));
    expect(shearSourceText(withTrend)).toMatch(/local shear trend.*iterated through the brine state in 25 hydrocarbon samples/);
  });
});

describe('the Elastic logs panel', () => {
  test('shows the zone means, the chi control and a fit that can be put to use', async () => {
    const { model } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const zones = [{ id: 'z', name: 'whole well', top_md_m: 1800, base_md_m: 2200 }];
    const onRockChange = jest.fn();
    render(<ElasticPanel model={model} zones={zones} zoneId="z" rock={DEFAULT_ROCK} onRockChange={onRockChange} wellName="TREND RP-5" />);
    expect(screen.getByTestId('rp-elastic-means')).toBeTruthy();
    fireEvent.change(screen.getByTestId('rp-elastic-chi'), { target: { value: '0' } });
    expect(screen.getByTestId('rp-elastic-mean-eei').textContent).toBe(screen.getByTestId('rp-elastic-mean-ai').textContent);
    fireEvent.click(screen.getByTestId('rp-local-shear-fit'));
    expect(screen.getByTestId('rp-local-shear-result').textContent).toMatch(/^Vs = .*25 hydrocarbon-bearing samples were left out\./);
    fireEvent.click(screen.getByTestId('rp-local-shear-use'));
    expect(onRockChange).toHaveBeenCalledWith(expect.objectContaining({ localVs: expect.objectContaining({ label: 'TREND RP-5, whole well', form: 'linear' }) }));
  });

  test('a saved trend shows as in use and can be stopped', async () => {
    const { model } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const { trend } = fitLocalShear(model, all(model), { wellName: 'TREND RP-5', zoneName: 'whole well' });
    const onRockChange = jest.fn();
    render(<ElasticPanel model={model} zones={[{ id: 'z', name: 'w', top_md_m: 1800, base_md_m: 2200 }]} zoneId="z" rock={{ ...DEFAULT_ROCK, localVs: trend }} onRockChange={onRockChange} />);
    expect(screen.getByTestId('rp-local-shear-saved').textContent).toMatch(/In use: TREND RP-5, whole well/);
    fireEvent.click(screen.getByTestId('rp-local-shear-clear'));
    expect(onRockChange).toHaveBeenCalledWith(expect.objectContaining({ localVs: null }));
  });
});

describe('published provenance names the shear basis', () => {
  test('a well on the local trend publishes vs_method local-trend and the trend; Greenberg-Castagna stays as it was', async () => {
    const { preparePublishLogs } = await import('../services/publish');
    const { model: cal } = await load('TREND RP-5 (wet trend, gas bed)', { trend: true });
    const { trend } = fitLocalShear(cal, all(cal), { wellName: 'TREND RP-5', zoneName: 'whole well' });
    const { model: est, zones } = await load('AKOMA-2 (org shared)');
    const idx = zoneIndices(est.depth, zones[0].top_md_m, zones[0].base_md_m);
    const sub = { vp: est.vp, vs: est.vs, rho: est.rho };
    const meta = { scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, kmin: 37e9 };
    const local = applyLocalShearTrend(est, trend);
    const vsLog = preparePublishLogs(local, { ...sub, vs: local.vs }, idx, zones[0], meta).find((l) => l.mnemonic === 'VS_SUB');
    expect(vsLog.provenance.vs_method).toBe('local-trend');
    expect(vsLog.provenance.vs_trend.label).toBe('TREND RP-5, whole well');
    expect(vsLog.description).toMatch(/local shear trend from TREND RP-5, whole well/);
    // negative control: without the trend the label is Greenberg-Castagna and there is no trend
    const gc = preparePublishLogs(est, sub, idx, zones[0], meta).find((l) => l.mnemonic === 'VS_SUB');
    expect(gc.provenance.vs_method).toBe('greenberg-castagna');
    expect(gc.provenance.vs_trend).toBeNull();
  });
});

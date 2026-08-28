/**
 * Monte Carlo reproducibility, driven through the real DCA context.
 *
 * The engine gate (packages/engines/__tests__/dca.montecarlo.seed.test.js)
 * proves the sampler honours an injected seed. This one proves DCA Studio
 * actually injects it: before the wiring, runForecast called the sampler with
 * no generator, so clicking Run Monte Carlo twice on one unchanged fit gave
 * two different P10/P50/P90 and no reported EUR could be re-derived.
 *
 * The whole path runs for real here (project, well, import, fit, forecast);
 * only persistence is mocked, since it is the one step that talks to Supabase.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/utils/declineCurve/dcaDataPersistence', () => ({
  saveProject: jest.fn().mockResolvedValue(undefined),
  loadProject: jest.fn().mockResolvedValue(null),
  listProjects: jest.fn().mockResolvedValue([]),
  deleteProject: jest.fn().mockResolvedValue(undefined),
  migrateLegacyLocalProjects: jest.fn().mockResolvedValue(0),
}));

import { DeclineCurveProvider, useDeclineCurve, DEFAULT_MC_SEED } from '@/contexts/DeclineCurveContext';

// Three years of monthly rates on a clean exponential decline (qi 500 stb/d,
// 12 %/yr), with a small deterministic wobble so the regression has residuals
// to build confidence intervals from. No Math.random: the fixture itself has
// to be reproducible for the assertions below to mean anything.
const DATA = Array.from({ length: 36 }, (_, i) => {
  const date = new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10);
  const clean = 500 * Math.exp(-0.00035 * i * 30.4);
  const wobble = 1 + 0.02 * Math.sin(i * 1.7);
  return { date, oilRate: clean * wobble };
});

let api = null;
const Probe = () => {
  api = useDeclineCurve();
  return null;
};

const mountProvider = async () => {
  // The provider loads its project list on mount, so the first render settles
  // asynchronously.
  await act(async () => {
    render(
      <DeclineCurveProvider>
        <Probe />
      </DeclineCurveProvider>,
    );
  });
};

const setUpFittedWell = async () => {
  await mountProvider();

  await act(async () => { await api.createProject('MC seed gate'); });
  await act(async () => { api.addWell('Seed-1'); });
  const wellId = Object.keys(api.wells)[0];
  await act(async () => { api.importProductionData(wellId, DATA); });
  await act(async () => { await api.runFit(); });

  const fit = api.streamState.oil.fitResults;
  expect(fit).toBeTruthy();
  expect(fit.confidenceIntervals?.hasIntervals).toBe(true);

  await act(async () => { api.updateForecastConfig('probabilisticMode', true); });
};

const runProbabilisticForecast = async () => {
  await act(async () => { await api.runForecast(); });
  const probabilistic = api.streamState.oil.forecastResults?.probabilistic;
  expect(probabilistic).toBeTruthy();
  return probabilistic;
};

describe('DCA Studio: a Monte Carlo forecast can be repeated', () => {
  jest.setTimeout(30000);

  it('defaults every stream to the shared seed', async () => {
    await mountProvider();
    for (const stream of ['oil', 'gas', 'water']) {
      expect(api.streamState[stream].forecastConfig.mcSeed).toBe(DEFAULT_MC_SEED);
    }
  });

  it('two runs on one unchanged fit return the same P10/P50/P90', async () => {
    await setUpFittedWell();

    const first = await runProbabilisticForecast();
    const second = await runProbabilisticForecast();

    expect(second.p10).toBe(first.p10);
    expect(second.p50).toBe(first.p50);
    expect(second.p90).toBe(first.p90);
    expect(second.mean).toBe(first.mean);
    expect(second.distribution).toEqual(first.distribution);

    // The seed that produced them travels with the numbers, so the results
    // panel and any saved scenario can quote it.
    expect(first.seed).toBe(DEFAULT_MC_SEED);
    expect(second.seed).toBe(DEFAULT_MC_SEED);
  });

  it('changing the seed draws a different realization of the same fit', async () => {
    await setUpFittedWell();

    const first = await runProbabilisticForecast();
    await act(async () => { api.updateForecastConfig('mcSeed', 20260827); });
    const second = await runProbabilisticForecast();

    expect(second.seed).toBe(20260827);
    expect(second.distribution).not.toEqual(first.distribution);
    // Same fit, so the two realizations stay in the same neighbourhood.
    expect(second.p50 / first.p50).toBeGreaterThan(0.8);
    expect(second.p50 / first.p50).toBeLessThan(1.25);
  });

  it('the economic-limit uncertainty setting reaches the sampler', async () => {
    await setUpFittedWell();
    // Long enough that the curve actually reaches the economic limit; on the
    // default 3650-day cap this fit is still producing 139 stb/d at the end,
    // so where the limit sits could not matter.
    await act(async () => { api.updateForecastConfig('durationDays', 20000); });

    // Same seed throughout, so any difference between these runs is the
    // setting itself. If the engine ignored it, or the context dropped it,
    // both runs would draw the limit the same way and match exactly.
    await act(async () => { api.updateForecastConfig('economicLimitUncertainty', 0.5); });
    const wide = await runProbabilisticForecast();
    await act(async () => { api.updateForecastConfig('economicLimitUncertainty', 0); });
    const fixed = await runProbabilisticForecast();

    expect(wide.economicLimitUncertainty).toBe(0.5);
    expect(fixed.economicLimitUncertainty).toBe(0);
    expect(fixed.distribution).not.toEqual(wide.distribution);

    // Holding the limit fixed is still reproducible.
    const again = await runProbabilisticForecast();
    expect(again.distribution).toEqual(fixed.distribution);
  });

  it('sample curves start at the fit t0, not at "now"', async () => {
    await setUpFittedWell();
    const { sampleCurves } = await runProbabilisticForecast();
    const t0 = new Date(api.streamState.oil.fitResults.t0 || DATA[0].date).getTime();

    expect(sampleCurves.length).toBeGreaterThan(0);
    expect(sampleCurves[0][0].date.getTime()).toBe(t0);
  });
});

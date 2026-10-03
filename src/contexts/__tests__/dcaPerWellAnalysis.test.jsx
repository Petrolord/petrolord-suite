/**
 * DCA-U1-001 and DCA-U1-003, driven through the real DCA context.
 *
 * 001: the fit, the forecast and the fit window were held once per project.
 * Opening a second well showed the first well's fit and forecast over the
 * second well's data, and a scenario saved there carried the first well's
 * numbers under the second well's name. Each well now holds its own.
 *
 * 003: a fit and a forecast keep what they were made on; an edit to the
 * data, the window, the model, the b limits or the excluded points makes
 * them out of date, they are not saved as a scenario, and putting the input
 * back restores them.
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

import { DeclineCurveProvider, useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { loadProject } from '@/utils/declineCurve/dcaDataPersistence';
import { migrateDcaPayload, analysisStatus, prepareFitData } from '@/utils/declineCurve/dcaModel';

// Ekene-1 primary decline: 120 stb/d, 0.0012 per day, exponential.
const EKENE = Array.from({ length: 36 }, (_, i) => {
  const date = new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10);
  const t = (Date.UTC(2020, i, 1) - Date.UTC(2020, 0, 1)) / 86400000;
  return { date, oilRate: 120 * Math.exp(-0.0012 * t) * (1 + 0.01 * Math.sin(i * 1.3)) };
});
// a second well, steeper
const OTHER = Array.from({ length: 24 }, (_, i) => {
  const date = new Date(Date.UTC(2021, i, 1)).toISOString().slice(0, 10);
  return { date, oilRate: 800 / (1 + 0.5 * 0.004 * i * 30.4) ** 2 };
});

let api = null;
const Probe = () => { api = useDeclineCurve(); return null; };

const mount = async () => {
  await act(async () => { render(<DeclineCurveProvider><Probe /></DeclineCurveProvider>); });
};

const twoWells = async () => {
  await mount();
  await act(async () => { await api.createProject('Per-well gate'); });
  await act(async () => { api.addWell('Ekene-1'); });
  const w1 = api.currentWellId;
  await act(async () => { api.importProductionData(w1, EKENE); });
  await act(async () => { api.addWell('Other-2'); });
  const w2 = api.currentWellId;
  await act(async () => { api.importProductionData(w2, OTHER); });
  await act(async () => { api.setCurrentWellId(w1); });
  return { w1, w2 };
};

describe('DCA-U1-001: the analysis belongs to the well', () => {
  jest.setTimeout(30000);

  it('a second well does not show the first well\'s fit or forecast', async () => {
    const { w1, w2 } = await twoWells();
    await act(async () => { await api.runFit(); });
    await act(async () => { await api.runForecast(); });
    expect(api.streamState.oil.fitResults.qi).toBeCloseTo(120, -1);
    expect(api.streamState.oil.forecastResults).toBeTruthy();

    await act(async () => { api.setCurrentWellId(w2); });
    expect(api.streamState.oil.fitResults).toBeNull();
    expect(api.streamState.oil.forecastResults).toBeNull();
    // and the window is the second well's own data range
    expect(api.fitWindow.startDate).toBe(OTHER[0].date);

    await act(async () => { await api.runFit(); });
    expect(api.streamState.oil.fitResults.qi).toBeGreaterThan(500);

    await act(async () => { api.setCurrentWellId(w1); });
    expect(api.streamState.oil.fitResults.qi).toBeCloseTo(120, -1);
    expect(api.fitWindow.startDate).toBe(EKENE[0].date);
  });

  it('a scenario is saved with the numbers of the well it names', async () => {
    const { w2 } = await twoWells();
    await act(async () => { await api.runFit(); });
    await act(async () => { await api.runForecast(); });
    await act(async () => { api.setCurrentWellId(w2); });
    // nothing fitted on this well: nothing to save
    await act(async () => { api.createScenario('Wrong well'); });
    expect(api.scenarios).toHaveLength(0);
    await act(async () => { await api.runFit(); });
    await act(async () => { await api.runForecast(); });
    await act(async () => { api.createScenario('Other base'); });
    expect(api.scenarios).toHaveLength(1);
    expect(api.scenarios[0].wellName).toBe('Other-2');
    expect(api.scenarios[0].fitResults.qi).toBeGreaterThan(500);
  });

  it('a project saved before per-well fits opens with its fit on the well it was fitted on', async () => {
    const legacyFit = { qi: 800, Di: 0.004, b: 0.5, modelType: 'Hyperbolic', R2: 0.99, RMSE: 1, t0: OTHER[0].date };
    const payload = {
      id: 'p1', name: 'Saved in September',
      wells: { a: { id: 'a', name: 'Ekene-1', data: EKENE }, b: { id: 'b', name: 'Other-2', data: OTHER } },
      streamState: { oil: { fitResults: legacyFit, modelType: 'Auto', constraints: { minB: 0, maxB: 1 }, forecastConfig: { economicLimit: 10 }, forecastResults: null } },
      fitWindow: { startDate: OTHER[0].date, endDate: OTHER[23].date },
    };
    const migrated = migrateDcaPayload(payload);
    expect(migrated.payloadVersion).toBe(2);
    expect(migrated.streamState).toBeUndefined();
    expect(migrated.wells.b.analysis.streams.oil.fitResults).toEqual(legacyFit);
    expect(migrated.wells.b.analysis.carried).toMatch(/saved before fits were kept per well/);
    expect(migrated.wells.a.analysis.streams.oil.fitResults).toBeNull();
    // an earlier release recorded no basis: the fit says so and is not reportable
    const st = analysisStatus(migrated.wells.b, 'oil');
    expect(st.fit).toBe('unrecorded');
    expect(st.reportable).toBe(false);

    loadProject.mockResolvedValueOnce(payload);
    await mount();
    await act(async () => { await api.openProject('p1'); });
    await act(async () => { api.setCurrentWellId('b'); });
    expect(api.streamState.oil.fitResults.qi).toBe(800);
    await act(async () => { api.setCurrentWellId('a'); });
    expect(api.streamState.oil.fitResults).toBeNull();
  });
});

describe('DCA-U1-003: a result says when it is out of date', () => {
  jest.setTimeout(30000);

  it('editing the window withdraws the fit and the forecast; putting it back restores them', async () => {
    await twoWells();
    await act(async () => { await api.runFit(); });
    await act(async () => { await api.runForecast(); });
    expect(api.status.fit).toBe('current');
    expect(api.status.forecast).toBe('current');
    expect(api.status.reportable).toBe(true);

    const before = { ...api.fitWindow };
    await act(async () => { api.setFitWindow((w) => ({ ...w, startDate: EKENE[6].date })); });
    expect(api.status.fit).toBe('stale');
    expect(api.status.fitReasons).toContain('the fit window changed');
    expect(api.status.forecast).toBe('stale');
    expect(api.status.reportable).toBe(false);

    // a forecast is refused on an out-of-date fit
    const forecastBefore = api.streamState.oil.forecastResults.forecastAt;
    await act(async () => { await api.runForecast(); });
    expect(api.streamState.oil.forecastResults.forecastAt).toBe(forecastBefore);
    // and so is a scenario
    await act(async () => { api.createScenario('Stale'); });
    expect(api.scenarios).toHaveLength(0);

    await act(async () => { api.setFitWindow(before); });
    expect(api.status.fit).toBe('current');
    expect(api.status.forecast).toBe('current');
  });

  it('a forecast setting withdraws the forecast and keeps the fit', async () => {
    await twoWells();
    await act(async () => { await api.runFit(); });
    await act(async () => { await api.runForecast(); });
    await act(async () => { api.updateForecastConfig('economicLimit', 5); });
    expect(api.status.fit).toBe('current');
    expect(api.status.forecast).toBe('stale');
    expect(api.status.forecastReasons).toContain('the forecast settings changed');
  });

  it('an excluded point leaves the fit with its reason and is counted', async () => {
    await twoWells();
    await act(async () => { api.excludePoint(EKENE[10].date, 'choke change'); });
    await act(async () => { await api.runFit(); });
    const fit = api.streamState.oil.fitResults;
    expect(fit.points.excludedByUser).toBe(1);
    expect(fit.points.used).toBe(35);
    expect(fit.points.imported).toBe(36);
    await act(async () => { api.restorePoint(EKENE[10].date); });
    expect(api.status.fit).toBe('stale');
    expect(api.status.fitReasons).toContain('points were excluded or restored');
  });
});

describe('prepareFitData: every row is accounted for (RL5)', () => {
  it('used plus left out equals imported', () => {
    const data = [
      { date: '2020-01-01', oilRate: 100 }, { date: '2020-02-01', oilRate: 0 }, { date: '2020-03-01', oilRate: -3 },
      { date: '2020-04-01', oilRate: 90 }, { date: '2020-05-01', oilRate: null }, { date: '2020-06-01', oilRate: 80 },
      { date: '2020-07-01', oilRate: 75 },
    ];
    const { summary, rows, points } = prepareFitData(data, 'oil', { startDate: '2020-01-01', endDate: '2020-06-30' }, [{ date: '2020-04-01', reason: 'test' }]);
    expect(summary).toEqual({ imported: 7, withRate: 6, nonPositive: 2, outsideWindow: 1, excludedByUser: 1, used: 2 });
    expect(points.map((p) => p.date)).toEqual(['2020-01-01', '2020-06-01']);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.date === '2020-04-01').reason).toBe('test');
    expect(summary.used + summary.nonPositive + summary.outsideWindow + summary.excludedByUser + (summary.imported - summary.withRate)).toBe(summary.imported);
  });
});

/**
 * dai_forecast_runs persistence (D4): organization scoped, author kept,
 * refusals reported; the saved run payload (inputs, seed, engine pin,
 * summary, fingerprint); and the CSV report (full precision, refusals,
 * undefined-metric reasons, the exceedance definition, warnings as rows).
 */
const mockCalls = [];
let mockResult = { data: [], error: null };
const mockQ = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'then') return (res) => res(mockResult);
    return (...args) => { mockCalls.push([prop, ...args]); return mockQ; };
  },
});
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: (...a) => { mockCalls.push(['from', ...a]); return mockQ; } } }));

import {
  createForecastRunsService, NO_ORG_MESSAGE, FORECAST_RUNS_TABLE, FORECAST_RUNS_MIGRATION,
} from '@/utils/dataAi/forecastRunsService';
import {
  serializeStudy, studyFromPayload, fingerprint, STUDY_SCHEMA,
} from '@/utils/dataAi/forecastStudy';
import {
  defaultSpec, parseSpec, runFit, runIntervals, runCompare, runField, ENGINE_COMMIT,
} from '@/utils/dataAi/forecastWorkflows';
import { forecastTableFromSnapshot, MAX_SAVED_UPLOAD_VALUES } from '@/utils/dataAi/forecastData';
import { buildForecastCsv, CSV_COLUMNS } from '@/utils/dataAi/forecastReport';
import { EKENE } from './fixtures/forecast/ekene';

beforeEach(() => { mockCalls.length = 0; mockResult = { data: [], error: null }; });

const makeTable = () => ({
  label: 'ekene.csv', source: 'upload', unit: 'stb per month', step: 'month', valueName: 'oil_stb', wells: EKENE.map((w) => ({ name: w.well, labels: w.rate.map((_, i) => `m${i}`), values: w.rate.slice() })), notes: ['n1'],
});
const table = makeTable();
const spec = { ...defaultSpec(), well: 'EKENE-P01', backtest: { ...defaultSpec().backtest, firstOrigin: '18' } };
const parsed = parseSpec(spec);
const series = table.wells[0];
const results = {
  fit: { result: runFit({ series, parsed }) },
  intervals: { result: runIntervals({ series, parsed }) },
  compare: { result: runCompare({ series, parsed }) },
  field: { result: runField({ table, parsed }) },
};

describe('dai_forecast_runs service', () => {
  it('lists only the current organization, newest first', async () => {
    mockResult = { data: [{ id: 'a', name: 'A', source: 'upload', summary: { wells: 3 }, created_at: 't0', updated_at: 't1', created_by: 'u1' }], error: null };
    const list = await createForecastRunsService(() => 'org-1').list();
    expect(FORECAST_RUNS_TABLE).toBe('dai_forecast_runs');
    expect(FORECAST_RUNS_MIGRATION).toBe('20260924160000_d4_dai_forecast_runs');
    expect(mockCalls).toContainEqual(['from', 'dai_forecast_runs']);
    expect(mockCalls).toContainEqual(['eq', 'organization_id', 'org-1']);
    expect(mockCalls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(list).toEqual([{ id: 'a', name: 'A', source: 'upload', summary: { wells: 3 }, createdAt: 't0', updatedAt: 't1', createdBy: 'u1' }]);
  });

  it('saves under the organization, lifts source and summary into columns, and never sends the author', async () => {
    mockResult = { error: null };
    const payload = serializeStudy({
      name: '  Ekene decline  ', source: 'upload', dataRef: { fileName: 'ekene.csv' }, table, spec, results,
    });
    await createForecastRunsService(() => 'org-1').save('r1', payload);
    const upsert = mockCalls.find((c) => c[0] === 'upsert');
    expect(upsert[1]).toMatchObject({
      id: 'r1', organization_id: 'org-1', name: 'Ekene decline', source: 'upload', summary: payload.summary, payload,
    });
    expect(upsert[1]).not.toHaveProperty('created_by');
    expect(upsert[1]).toHaveProperty('schema_version', 1);
  });

  it('names an unnamed run, refuses to save without an organization, and reports a refused delete', async () => {
    mockResult = { error: null };
    await createForecastRunsService(() => 'org-1').save('r2', { name: ' ' });
    expect(mockCalls.find((c) => c[0] === 'upsert')[1].name).toBe('Untitled forecast run');
    await expect(createForecastRunsService(() => null).save('r1', { name: 'x' })).rejects.toThrow(NO_ORG_MESSAGE);
    expect(NO_ORG_MESSAGE).toBe('Forecast runs are saved to your organization. Join or select an organization to save one.');
    mockResult = { data: [], error: null };
    await expect(createForecastRunsService(() => 'org-1').remove('r1'))
      .rejects.toThrow('Only the author of a forecast run or an organization owner or admin can delete it.');
  });
});

describe('the saved run payload', () => {
  it('keeps the series, the spec with seed and paths, and the engine pin, and reads back', () => {
    const payload = serializeStudy({
      name: 'E', source: 'upload', dataRef: { fileName: 'ekene.csv' }, table, spec, results,
    });
    expect(payload.schema).toBe(STUDY_SCHEMA);
    expect(payload.engine.commit).toBe(ENGINE_COMMIT);
    expect(payload.summary.engineCommit).toBe(ENGINE_COMMIT);
    expect(payload.summary.fingerprint).toBe(fingerprint(table));
    expect(payload.summary.intervals).toMatchObject({ seed: 42, nSims: 1000, method: 'damped' });
    expect(payload.summary.fit.methods.damped.params).toEqual(results.fit.result.fits.damped.params);
    expect(payload.summary.fit.methods.damped.atBounds).toEqual(results.fit.result.fits.damped.optimiser.atBounds);
    expect(payload.summary.compare.ranking).toEqual(results.compare.result.result.ranking);
    expect(payload.summary.field.summary).toEqual(results.field.result.summary);
    const back = studyFromPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.spec).toEqual(spec);
    expect(back.engine).toEqual(payload.engine);
    const t = forecastTableFromSnapshot(back.snapshot);
    expect(t.wells.map((w) => w.values)).toEqual(table.wells.map((w) => w.values));
    expect(fingerprint(t)).toBe(fingerprint(table));
  });

  it('drops an upload too large to keep and says so', () => {
    const big = { ...makeTable(), wells: [{ name: 'B', labels: [], values: new Array(MAX_SAVED_UPLOAD_VALUES + 1).fill(1) }] };
    const payload = serializeStudy({
      name: 'B', source: 'upload', dataRef: {}, table: big, spec, results: {},
    });
    expect(payload.snapshot).toBeNull();
    expect(payload.snapshotOmitted).toBe(true);
  });

  it('changes the fingerprint when one value changes', () => {
    const t2 = makeTable();
    t2.wells[1].values[7] += 1e-9;
    expect(fingerprint(t2)).not.toBe(fingerprint(table));
    expect(fingerprint(makeTable())).toBe(fingerprint(table));
  });
});

describe('the CSV report', () => {
  const csv = buildForecastCsv({
    runName: 'E', table, spec, results,
  });
  const lines = csv.trim().split('\n');

  it('has one header and full-precision engine values', () => {
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    const d = results.fit.result.fits.damped;
    expect(csv).toContain(`fit,EKENE-P01,damped,,,,sse,${String(d.sse)},`);
    expect(csv).toContain(`param,EKENE-P01,damped,,,,alpha,${String(d.params.alpha)},estimated`);
    const pi = results.intervals.result.result;
    expect(csv).toContain(`interval,EKENE-P01,damped,,60,,P90 h 1,${String(pi.P90[0])},`);
    expect(csv).toContain(pi.definition);
    expect(csv).toContain(`engine commit,${ENGINE_COMMIT}`);
  });

  it('writes the reason MAPE is undefined on the shut-in, and every well of the field', () => {
    const ses = results.compare.result.result.rows.find((r) => r.method === 'ses');
    expect(ses.mape).toBeNull();
    expect(csv).toContain(ses.notes.mape);
    expect(csv).toMatch(/^metric,EKENE-P01,ses,,,,mape,,$/m);
    ['EKENE-P01', 'EKENE-P02', 'EKENE-P03'].forEach((w) => expect(csv).toMatch(new RegExp(`^meta,${w},,,,,ranking,`, 'm')));
  });

  it('carries the hold toggle and the held parameters in the saved run and the CSV, and leaves them out when off', () => {
    const on = {
      ...spec, params: { ...spec.params, damped: { alpha: '', beta: '', phi: '0.9' } }, backtest: { ...spec.backtest, holdTyped: true },
    };
    const cmp = runCompare({ series, parsed: parseSpec(on) });
    expect(cmp.held).toEqual({ damped: { phi: 0.9 } });
    const r = { compare: { result: cmp } };
    const payload = serializeStudy({
      name: 'E', source: 'upload', dataRef: {}, table, spec: on, results: r,
    });
    expect(payload.summary.compare.heldTyped).toEqual({ damped: { phi: 0.9 } });
    expect(payload.summary.compare.metrics.damped.mase).toBe(cmp.result.rows.find((x) => x.method === 'damped').mase);
    expect(studyFromPayload(JSON.parse(JSON.stringify(payload))).spec.backtest.holdTyped).toBe(true);
    const c = buildForecastCsv({ runName: 'E', table, spec: on, results: r });
    expect(c).toContain(`meta,EKENE-P01,,,,,backtest parameters held,"{""damped"":{""phi"":0.9}}",${cmp.result.basis.held}`);
    expect(c).toContain('""holdTyped"":true');
    // off: no held row, and an older save without the field opens with it off
    expect(csv).not.toContain('backtest parameters held');
    expect(serializeStudy({
      name: 'E', source: 'upload', dataRef: {}, table, spec, results,
    }).summary.compare.heldTyped).toBeNull();
    const old = JSON.parse(JSON.stringify(serializeStudy({
      name: 'E', source: 'upload', dataRef: {}, table, spec, results: {},
    })));
    delete old.spec.backtest.holdTyped;
    expect(studyFromPayload(old).spec.backtest.holdTyped).toBe(false);
  });

  it('writes engine refusals and warnings as rows', () => {
    const bad = parseSpec({ ...spec, params: { ...spec.params, holt: { alpha: '2', beta: '' } } });
    const r = { fit: { result: runFit({ series, parsed: bad }) } };
    r.fit.result.fits.damped = { ...r.fit.result.fits.damped, warnings: ['the compass search stopped'] };
    const c = buildForecastCsv({ runName: 'E', table, spec, results: r });
    expect(c).toContain('refused,EKENE-P01,holt,,,,fit,,alpha must be a number from 0 to 1 (inclusive)');
    expect(c).toContain('warning,,,,,,fit damped,,the compass search stopped');
  });
});

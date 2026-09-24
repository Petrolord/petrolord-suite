/**
 * Production Forecasting ML Workbench (D4): the worker protocol.
 *
 * The worker file is a one-line shell around handleForecastMessage, so these
 * test the handler and the page-side client: every job posts the same
 * result a direct call to the workflow gives, the field job reports progress
 * per well, errors and unknown jobs come back as error messages, ids keep
 * concurrent runs apart, and a worker is terminated when its job ends. The
 * client is driven with a fake worker that runs the real handler through a
 * structured clone, the way a module worker would.
 */
import fs from 'fs';
import path from 'path';
import { handleForecastMessage, runForecastAsync, JOBS } from '@/utils/dataAi/forecastJobs';
import {
  defaultSpec, parseSpec, runFit, runIntervals, runCompare, runField,
} from '@/utils/dataAi/forecastWorkflows';
import { createForecastWorker } from '@/utils/dataAi/forecastWorkerFactory';
import { EKENE } from './fixtures/forecast/ekene';

const table = {
  label: 'ekene', source: 'upload', unit: '', step: 'month', wells: EKENE.map((w) => ({ name: w.well, labels: w.rate.map((_, i) => String(i)), values: w.rate })), notes: [],
};
const series = table.wells[0];
const parsed = parseSpec(defaultSpec());
const collect = (msg) => { const out = []; handleForecastMessage(msg, (m) => out.push(m)); return out; };

describe('handleForecastMessage', () => {
  it('runs each job as its workflow', () => {
    expect(collect({ type: 'run', id: 1, job: 'fit', payload: { series, parsed } })[0].result).toEqual(runFit({ series, parsed }));
    expect(collect({ type: 'run', id: 2, job: 'intervals', payload: { series, parsed } })[0].result).toEqual(runIntervals({ series, parsed }));
    expect(collect({ type: 'run', id: 3, job: 'compare', payload: { series, parsed } })[0].result).toEqual(runCompare({ series, parsed }));
    expect(Object.keys(JOBS).sort()).toEqual(['compare', 'field', 'fit', 'intervals']);
  });

  it('posts progress per well for the field job, then the result', () => {
    const out = collect({ type: 'run', id: 7, job: 'field', payload: { table, parsed } });
    const progress = out.filter((m) => m.type === 'progress');
    expect(progress.map((m) => m.done)).toEqual([1, 2, 3]);
    progress.forEach((m) => { expect(m.id).toBe(7); expect(m.total).toBe(3); expect(m.phase).toBe('wells'); });
    expect(out[out.length - 1]).toEqual({ type: 'done', id: 7, job: 'field', result: runField({ table, parsed }) });
  });

  it('passes an engine refusal through as a result, and a thrown error as an error message', () => {
    const bad = parseSpec({ ...defaultSpec(), intervals: { ...defaultSpec().intervals, seed: '-1' } });
    expect(collect({ type: 'run', id: 5, job: 'intervals', payload: { series, parsed: bad } })[0].result.result.error)
      .toBe('seed must be a whole number from 0 to 4294967295');
    const e = collect({ type: 'run', id: 6, job: 'fit', payload: {} });
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('error');
    expect(e[0].id).toBe(6);
  });

  it('answers an unknown job with an error and ignores anything that is not a run', () => {
    expect(collect({ type: 'run', id: 9, job: 'neural-net', payload: {} }))
      .toEqual([{ type: 'error', id: 9, job: 'neural-net', message: 'Unknown Forecasting ML Workbench job neural-net.' }]);
    expect(collect({ type: 'ping' })).toEqual([]);
    expect(collect(null)).toEqual([]);
  });
});

/** A stand-in module worker that runs the real handler asynchronously. */
function fakeWorker() {
  const w = {
    terminated: false,
    posted: [],
    onmessage: null,
    onerror: null,
    postMessage(msg) {
      w.posted.push(msg);
      setTimeout(() => handleForecastMessage(JSON.parse(JSON.stringify(msg)), (m) => w.onmessage && !w.terminated && w.onmessage({ data: JSON.parse(JSON.stringify(m)) })), 0);
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

describe('runForecastAsync', () => {
  it('uses the worker, reports progress, resolves with the structured-clone result and terminates it', async () => {
    const w = fakeWorker();
    const progress = [];
    const { promise } = runForecastAsync('field', { table, parsed }, { createWorker: () => w, onProgress: (p) => progress.push(p.done) });
    const result = await promise;
    expect(w.posted).toHaveLength(1);
    expect(w.posted[0]).toMatchObject({ type: 'run', job: 'field' });
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toEqual(JSON.parse(JSON.stringify(runField({ table, parsed }))));
    expect(w.terminated).toBe(true);
  });

  it('runs inline with the same result when no worker can be made (jest maps the factory to null)', async () => {
    expect(createForecastWorker()).toBeNull();
    const { promise } = runForecastAsync('compare', { series, parsed }, { createWorker: createForecastWorker });
    expect(await promise).toEqual(runCompare({ series, parsed }));
  });

  it('keeps two concurrent runs apart by id', async () => {
    const a = runForecastAsync('fit', { series, parsed });
    const b = runForecastAsync('intervals', { series: table.wells[1], parsed });
    const [ra, rb] = await Promise.all([a.promise, b.promise]);
    expect(ra).toEqual(runFit({ series, parsed }));
    expect(rb).toEqual(runIntervals({ series: table.wells[1], parsed }));
  });

  it('rejects on a worker error message and on cancel, terminating the worker', async () => {
    const w = fakeWorker();
    await expect(runForecastAsync('nope', {}, { createWorker: () => w }).promise).rejects.toThrow('Unknown Forecasting ML Workbench job nope.');
    expect(w.terminated).toBe(true);
    const w2 = fakeWorker();
    const run = runForecastAsync('field', { table, parsed }, { createWorker: () => w2 });
    run.cancel();
    await expect(run.promise).rejects.toThrow('cancelled');
    expect(w2.terminated).toBe(true);
  });
});

describe('the worker shell', () => {
  it('is one handler call and nothing else', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'workers', 'forecast.worker.js'), 'utf8');
    expect(src).toContain("import { handleForecastMessage } from '../forecastJobs';");
    expect(src).toContain('self.onmessage = (e) => handleForecastMessage(e.data, (m) => self.postMessage(m));');
  });
});

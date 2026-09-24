/**
 * ML Workbench (D2): the worker protocol.
 *
 * The worker file is a one-line shell around handleMlMessage, so these test
 * the handler and the page-side client: every job posts the same result a
 * direct call to the workflow gives, progress arrives per fold, errors and
 * unknown jobs come back as error messages, ids keep concurrent runs apart,
 * and a worker is terminated when its job ends. The client is driven with a
 * fake worker that runs the real handler, the way a module worker would.
 */
import fs from 'fs';
import path from 'path';
import { handleMlMessage, runMlAsync, JOBS } from '@/utils/dataAi/mlJobs';
import {
  defaultSpec, parseSpec, evaluate, fitFinal, importance, learning, leakage, predictWith,
} from '@/utils/dataAi/mlWorkflows';
import { buildDesign } from '@/utils/dataAi/mlData';
import { createMlWorker } from '@/utils/dataAi/mlWorkerFactory';

// a small table: three wells, a linear target with noise from a fixed list
const NOISE = [0.3, -0.2, 0.1, -0.4, 0.25, -0.15, 0.05, 0.35, -0.3, 0.2];
const table = (() => {
  const group = []; const depth = []; const A = []; const B = []; const T = [];
  ['W-1', 'W-2', 'W-3', 'W-4'].forEach((w, k) => {
    for (let i = 0; i < 20; i += 1) {
      group.push(w); depth.push(1000 + i);
      const a = i + k * 3; const b = (i * 7) % 11;
      A.push(a); B.push(b); T.push(2 + 0.5 * a - 0.8 * b + NOISE[(i + k) % 10]);
    }
  });
  return { source: 'upload', label: 't', ref: {}, wells: [], group, depth, depthUnit: 'm', columns: { A, B, T }, units: {}, notes: [] };
})();
const spec = { ...defaultSpec(), target: 'T', features: [{ name: 'A', log: false }, { name: 'B', log: false }], validation: { scheme: 'kfold', k: '4', testFraction: '0.25', seed: '3' } };
const design = buildDesign(table, spec);
const parsed = parseSpec(spec);

const collect = (msg) => { const out = []; handleMlMessage(msg, (m) => out.push(m)); return out; };

describe('handleMlMessage', () => {
  it('posts progress per fold, then the evaluate result equal to direct workflow calls', () => {
    const out = collect({ type: 'run', id: 7, job: 'evaluate', payload: { design, parsed, task: 'regression' } });
    const progress = out.filter((m) => m.type === 'progress');
    expect(progress.map((m) => m.done)).toEqual([0, 1, 2, 3, 4]);
    progress.forEach((m) => { expect(m.id).toBe(7); expect(m.total).toBe(4); expect(m.phase).toBe('fold'); });
    const done = out[out.length - 1];
    expect(done).toEqual({
      type: 'done', id: 7, job: 'evaluate',
      result: { evaluation: evaluate({ design, parsed, task: 'regression' }), final: fitFinal({ design, parsed }) },
    });
  });

  it('runs each diagnostic job as its workflow', () => {
    expect(collect({ type: 'run', id: 1, job: 'leakage', payload: { design, parsed } })[0].result).toEqual(leakage({ design, parsed }));
    expect(collect({ type: 'run', id: 2, job: 'importance', payload: { design, parsed } })[0].result).toEqual(importance({ design, parsed }));
    expect(collect({ type: 'run', id: 3, job: 'learning', payload: { design, parsed } })[0].result).toEqual(learning({ design, parsed }));
    const final = fitFinal({ design, parsed });
    const X = [[1, 2], [3, 4]];
    expect(collect({ type: 'run', id: 4, job: 'predict', payload: { final, X } })[0].result).toEqual(predictWith(final, X));
    expect(Object.keys(JOBS).sort()).toEqual(['evaluate', 'importance', 'leakage', 'learning', 'predict']);
  });

  it('passes an engine refusal through as a result, and a thrown error as an error message', () => {
    const bad = parseSpec({ ...spec, validation: { scheme: 'kfold', k: '9', testFraction: '', seed: '3' } });
    const r = collect({ type: 'run', id: 5, job: 'evaluate', payload: { design, parsed: bad, task: 'regression' } });
    expect(r[r.length - 1].result.evaluation.error).toBe('k must be a whole number from 2 to 4 (the number of distinct groups)');
    const e = collect({ type: 'run', id: 6, job: 'evaluate', payload: {} });
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('error');
    expect(e[0].id).toBe(6);
  });

  it('answers an unknown job with an error and ignores anything that is not a run', () => {
    expect(collect({ type: 'run', id: 9, job: 'train-a-transformer', payload: {} }))
      .toEqual([{ type: 'error', id: 9, job: 'train-a-transformer', message: 'Unknown ML Workbench job train-a-transformer.' }]);
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
      setTimeout(() => handleMlMessage(JSON.parse(JSON.stringify(msg)), (m) => w.onmessage && !w.terminated && w.onmessage({ data: JSON.parse(JSON.stringify(m)) })), 0);
    },
    terminate() { w.terminated = true; },
  };
  return w;
}

describe('runMlAsync', () => {
  it('uses the worker, reports progress, resolves with the structured-clone result and terminates it', async () => {
    const w = fakeWorker();
    const progress = [];
    const { promise } = runMlAsync('evaluate', { design, parsed, task: 'regression' }, { createWorker: () => w, onProgress: (p) => progress.push(p.done) });
    const result = await promise;
    expect(w.posted).toHaveLength(1);
    expect(w.posted[0]).toMatchObject({ type: 'run', job: 'evaluate' });
    expect(progress).toEqual([0, 1, 2, 3, 4]);
    const direct = evaluate({ design, parsed, task: 'regression' });
    expect(result.evaluation.pooled).toEqual(direct.pooled);
    expect(result.evaluation.oof).toEqual(direct.oof);
    expect(w.terminated).toBe(true);
  });

  it('runs inline with the same result when no worker can be made (jest maps the factory to null)', async () => {
    expect(createMlWorker()).toBeNull();
    const { promise } = runMlAsync('leakage', { design, parsed }, { createWorker: createMlWorker });
    expect(await promise).toEqual(leakage({ design, parsed }));
  });

  it('keeps two concurrent runs apart by id', async () => {
    const a = runMlAsync('learning', { design, parsed });
    const b = runMlAsync('importance', { design, parsed });
    const [ra, rb] = await Promise.all([a.promise, b.promise]);
    expect(ra).toEqual(learning({ design, parsed }));
    expect(rb).toEqual(importance({ design, parsed }));
  });

  it('rejects on a worker error message and on cancel, terminating the worker', async () => {
    const w = fakeWorker();
    await expect(runMlAsync('nope', {}, { createWorker: () => w }).promise).rejects.toThrow('Unknown ML Workbench job nope.');
    expect(w.terminated).toBe(true);
    const w2 = fakeWorker();
    const run = runMlAsync('evaluate', { design, parsed, task: 'regression' }, { createWorker: () => w2 });
    run.cancel();
    await expect(run.promise).rejects.toThrow('cancelled');
    expect(w2.terminated).toBe(true);
  });
});

describe('the worker shell', () => {
  it('is one handler call and nothing else', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'workers', 'ml.worker.js'), 'utf8');
    expect(src).toContain("import { handleMlMessage } from '../mlJobs';");
    expect(src).toContain('self.onmessage = (e) => handleMlMessage(e.data, (m) => self.postMessage(m));');
  });
});

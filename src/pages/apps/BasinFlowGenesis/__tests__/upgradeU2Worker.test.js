/**
 * BF-U2-009 (BF-U1-031): the run goes to a Web Worker with progress and
 * Cancel. The worker runs handleRunMessage (the exact code tested here);
 * the client is driven with a fake worker that answers through the same
 * protocol, so the result, the progress and the cancel path are the
 * shipped ones.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { handleRunMessage, engineInputs } from '../services/runWorkerProtocol';
import { runBasin, RunCancelled } from '../services/runClient';
import { referenceBasinRow } from '../services/backend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const r = referenceBasinRow();
const state = { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings, results: { big: true }, scenarios: [{ id: 's' }] };

/** A worker double: postMessage runs the protocol on a later tick. */
const fakeWorker = ({ hold = false } = {}) => {
  const w = { terminated: false, posted: null };
  w.postMessage = (msg) => {
    w.posted = msg;
    if (hold) return;
    setTimeout(() => handleRunMessage(msg, (m) => { if (!w.terminated && w.onmessage) w.onmessage({ data: m }); }), 0);
  };
  w.terminate = () => { w.terminated = true; };
  return w;
};

test('the worker computes exactly what the page computes, sends only the engine inputs and reports progress', async () => {
  const direct = await SimulationEngine.run(engineInputs(state));
  const w = fakeWorker();
  const seen = [];
  const res = await runBasin(state, { workerFactory: () => w, onProgress: (p) => seen.push(p) });
  expect(res.meta.ranIn).toBe('worker');
  expect(Object.keys(w.posted.inputs).sort()).toEqual(['erosionEvents', 'heatFlow', 'settings', 'stratigraphy']);
  expect(JSON.stringify(res.data)).toBe(JSON.stringify(direct.data));
  expect(seen.length).toBeGreaterThan(10);
  expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(99);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  expect(w.terminated).toBe(true);
}, 120000);

test('Cancel terminates the worker and rejects as cancelled', async () => {
  const w = fakeWorker({ hold: true });
  const ctl = new AbortController();
  const p = runBasin(state, { workerFactory: () => w, signal: ctl.signal });
  await new Promise((res) => setTimeout(res, 0));
  ctl.abort();
  await expect(p).rejects.toBeInstanceOf(RunCancelled);
  expect(w.terminated).toBe(true);
});

test('an engine error comes back as an error; no worker runs on the page and says so', async () => {
  const w = fakeWorker();
  await expect(runBasin({ stratigraphy: [] }, { workerFactory: () => w })).rejects.toThrow(/Stratigraphy is missing/);
  const page = await runBasin(state, { workerFactory: () => null });
  expect(page.meta.ranIn).toBe('page');
}, 120000);

/**
 * PETRO-U2-011 in the Studio: a long well's run splits by depth across
 * workers (here fake workers speaking the real message protocol through
 * handleRunMessage) and joins to the same result as one inline run: the
 * percentile curves bit for bit, the zone statistics to 1e-12.
 */
import { handleRunMessage, runProbabilisticAsync, splitRanges, workerCount, specForEngine } from '../services/probabilistic';
import { DEFAULT_PARAMS } from '../engine/pipeline';

const N = 6001;
const curves = { DEPT: new Float64Array(N), GR: new Float64Array(N), RHOB: new Float64Array(N), NPHI: new Float64Array(N), DT: new Float64Array(N), RT: new Float64Array(N) };
for (let i = 0; i < N; i++) {
  const d = 1000 + i * 0.1524; curves.DEPT[i] = d;
  const sand = Math.sin(d / 7) > 0.2; const phi = sand ? 0.18 + 0.06 * Math.sin(d / 3) : 0.06; const sw = sand ? 0.3 : 1;
  curves.GR[i] = sand ? 25 : 110; curves.RHOB[i] = 2.65 - 1.65 * phi; curves.NPHI[i] = sand ? phi : 0.33; curves.DT[i] = 182 + phi * 474; curves.RT[i] = sand ? 0.05 / (phi * phi * sw * sw) : 2;
}
const zones = [{ id: 'a', name: 'A', top_md_m: 1100, base_md_m: 1600 }, { id: 'b', name: 'B', top_md_m: 1500, base_md_m: 1900 }];
const spec = specForEngine({ rw: { vary: true, type: 'triangular', q10: 0.04, q50: 0.05, q90: 0.06 }, cutPhi: { vary: true, type: 'uniform', min: 0.06, max: 0.1 } });
const payload = { curves, params: DEFAULT_PARAMS, zoneParamList: [], spec, opts: { n: 20, seed: 4, zones } };

class FakeWorker {
  postMessage(msg) { setTimeout(() => handleRunMessage(msg, (m) => this.onmessage?.({ data: m })), 0); }
  terminate() { this.terminated = true; }
}

test('ranges and worker count', () => {
  expect(splitRanges(10, 3)).toEqual([[0, 2], [3, 5], [6, 9]]);
  expect(splitRanges(2, 4)).toEqual([[0, 0], [1, 1]]);
  expect(workerCount({ hardwareConcurrency: 8 })).toBe(4);
  expect(workerCount({ hardwareConcurrency: 2 })).toBe(1);
  expect(workerCount(null)).toBe(1);
});

test('three workers join to the inline run', async () => {
  const inline = await runProbabilisticAsync(payload, { createWorker: null }).promise;
  const made = [];
  const progress = [];
  const par = await runProbabilisticAsync(payload, { createWorker: () => { const w = new FakeWorker(); made.push(w); return w; }, workers: 3, onProgress: (p) => progress.push(p) }).promise;
  expect(made.length).toBe(4); // one probe, three workers
  expect(made.every((w) => w.terminated)).toBe(true);
  for (const [key, arr] of Object.entries(inline.curves)) {
    for (let j = 0; j < N; j++) {
      if (Number.isNaN(arr[j])) expect(Number.isNaN(par.curves[key][j])).toBe(true);
      else if (par.curves[key][j] !== arr[j]) throw new Error(`${key}[${j}]`);
    }
  }
  inline.zones.forEach((z, i) => {
    const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
    for (const f of ['net_m', 'ntg', 'hcpv_m']) expect(rel(par.zones[i].outcomes[f].p50, z.outcomes[f].p50)).toBeLessThan(1e-12);
  });
  expect(progress.some((p) => p.workers === 3)).toBe(true);
}, 300000);

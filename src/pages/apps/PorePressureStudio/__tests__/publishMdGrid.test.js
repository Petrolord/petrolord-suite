// The published MD grid on float32 registry depths (2026-10-13). A
// prognosis on Ekene-8 (14,370 samples at 0.1524 m from 60.05 m MD) was
// published with 318 values and 14,052 nulls: the median of float32 MD
// differences missed the true step by about 4 micrometres, and the error
// passed the grid tolerance after some 300 samples.
import { mdGrid, preparePublishLogs } from '../services/publish';

const START = 60.0456008911133;
const STEP = 0.152400970458984;
const N = 14370;
// the registry hands depths over as float32
const f32Depths = (n = N, start = START, step = STEP) => Array.from(new Float32Array(Array.from({ length: n }, (_, i) => start + i * step)));

/** The pre-fix grid: median step only (the negative control). */
function medianOnlyGrid(mdM) {
  const diffs = [];
  for (let i = 1; i < mdM.length; i++) diffs.push(mdM[i] - mdM[i - 1]);
  const s = [...diffs].sort((a, b) => a - b);
  const step = s[Math.floor((s.length - 1) / 2)];
  const count = Math.round((mdM[mdM.length - 1] - mdM[0]) / step) + 1;
  const index = new Array(count).fill(-1);
  for (let i = 0; i < mdM.length; i++) {
    const k = Math.round((mdM[i] - mdM[0]) / step);
    if (k >= 0 && k < count && Math.abs(mdM[i] - (mdM[0] + k * step)) <= 0.01 * step && index[k] < 0) index[k] = i;
  }
  return { index, stepM: step };
}

describe('publish MD grid on float32 depths', () => {
  test('negative control: the median-only grid drops almost every sample (the reported defect)', () => {
    const g = medianOnlyGrid(f32Depths());
    const kept = g.index.filter((i) => i >= 0).length;
    expect(kept).toBeLessThan(1000);
  });

  test('every sample keeps its own MD, and the step is the log step', () => {
    const md = f32Depths();
    const g = mdGrid(md);
    expect(g.index.length).toBe(N);
    expect(g.index.every((i, k) => i === k)).toBe(true);
    expect(Math.abs(g.stepM - STEP)).toBeLessThan(1e-7);
    // the deepest sample sits on its grid node to float32 precision
    expect(Math.abs(g.startMdM + (N - 1) * g.stepM - md[N - 1])).toBeLessThan(3e-4);
  });

  test('a gap stays a gap at its own depth on a long float32 log', () => {
    const all = f32Depths(30000);
    const md = all.filter((_, i) => i < 10000 || i >= 10500);
    const g = mdGrid(md);
    expect(g.index.length).toBe(30000);
    expect(g.index.slice(10000, 10500).every((i) => i === -1)).toBe(true);
    expect(g.index[10500]).toBe(10000);
    expect(g.index[29999]).toBe(29499);
  });

  test('published curves carry values to TD', () => {
    const md = f32Depths(5000);
    const input = { zBmlM: md.map((m) => m - 60), mdM: md, tvdFrom: 'survey' };
    const pa = md.map((m) => m * 1e4);
    const result = { porePressurePa: pa, fracPressurePa: pa, overburdenPa: pa };
    const logs = preparePublishLogs(input, result, { method: 'eaton', eatonN: 3, nu: 0.4, mudlineMdM: 60 }, { projectId: 'p' });
    const pp = logs.find((l) => l.mnemonic === 'PP');
    expect(pp.nullCount).toBe(0);
    expect(pp.data[4999]).toBeCloseTo(md[4999] * 1e-2, 3);
  });
});

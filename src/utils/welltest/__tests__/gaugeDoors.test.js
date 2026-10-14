// 2026-10-14: the shut-in read off the gauge record, and a rate history file.
import { findTestStart, readRateHistoryCsv } from '@/utils/welltest/gaugeImport';
import { getModel, evaluateRateHistory, evaluateBuildupFromHistory } from '@/utils/welltest/models/modelCatalog';

const RES = { phi: 0.2, mu: 1.8, ct: 1.27e-5, rw: 0.51, h: 21, B: 1.21, q: 100, pi: 2120 };
const P = { k: 225, skin: 4, C: 0.005 };
const logspace = (a, b, n) => Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));

// a clean-up with an early one-hour shut-in, read every 6 minutes in flow and from 10 s after the final shut-in
function record(steps = [{ start: 0, q: 40 }, { start: 4, q: 0 }, { start: 5, q: 70 }, { start: 13, q: 100 }], ts = 25) {
  const model = getModel('homogeneous');
  const flowT = Array.from({ length: 250 }, (_, i) => Number((0.1 * (i + 1)).toFixed(4))).filter((t) => t <= ts);
  const flow = evaluateRateHistory({ model, params: P, reservoir: RES, steps, times: flowT });
  const dts = logspace(10 / 3600, 48, 60);
  const bu = evaluateBuildupFromHistory({ model, params: P, reservoir: RES, steps, shutInTime: ts, dts });
  return [{ t: 0, p: RES.pi }, ...flowT.map((t, i) => ({ t: t + 0.5, p: flow[i].pw })), ...dts.map((dt, i) => ({ t: ts + 0.5 + dt, p: bu[i].pws }))];
}

describe('findTestStart', () => {
  test('finds the final shut-in, not the clean-up shut-in with a bigger step on a coarser clock', () => {
    const r = findTestStart(record(), 'up');
    expect(r.ok).toBe(true);
    expect(r.t).toBeCloseTo(25.5, 9);
    expect(r.dtNext * 3600).toBeCloseTo(10, 6);
  });

  test('a rate cut before the shut-in rises almost as fast: the last change is the one the buildup follows', () => {
    const r = findTestStart(record([{ start: 0, q: 40 }, { start: 4, q: 0 }, { start: 5, q: 100 }, { start: 17, q: 40 }], 21), 'up');
    expect(r.ok).toBe(true);
    expect(r.t).toBeCloseTo(21.5, 9);
    expect(r.candidates).toBeGreaterThan(1);
  });

  test('finds the start of flow of a drawdown', () => {
    const rows = [...Array.from({ length: 11 }, (_, i) => ({ t: i * 0.1, p: 3000 })), ...logspace(0.003, 20, 40).map((t) => ({ t: 1 + t, p: 3000 - 40 * Math.log10(1 + t / 0.003) }))];
    const r = findTestStart(rows, 'down');
    expect(r.ok).toBe(true);
    expect(r.t).toBeCloseTo(1.0, 9);
  });

  test('a record that starts inside the buildup is refused with the reason', () => {
    const rows = record().filter((r) => r.t > 25.5);
    const r = findTestStart(rows, 'up');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/came before the file starts/);
  });

  test('a smooth record is refused rather than cut at random', () => {
    const steps = [3, 3.2, 2.8, 3.1, 2.9, 3.3, 3, 2.7, 3.2, 3, 3.1, 2.9];
    let p = 2000;
    const rows = [{ t: 0, p }, ...steps.map((d, i) => { p += d; return { t: i + 1, p }; })];
    const r = findTestStart(rows, 'up');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/No change stands out/);
  });
});

describe('readRateHistoryCsv', () => {
  test('reads the start and rate columns by header, ignoring a note column', () => {
    const r = readRateHistoryCsv('start_hr,oil_rate_stbd,note\n0,40,clean-up\n4,0,shut in\n5,70,"20/64 in"\n13,100,24/64\n25,0,buildup\n');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ t: '0', q: '40' }, { t: '4', q: '0' }, { t: '5', q: '70' }, { t: '13', q: '100' }, { t: '25', q: '0' }]);
    expect(r.timeCol).toBe('start_hr');
    expect(r.rateCol).toBe('oil_rate_stbd');
  });

  test('columns in either order, and a file without headers is time then rate', () => {
    expect(readRateHistoryCsv('Rate (STB/D),Time (hr)\n450,0\n0,36\n').rows).toEqual([{ t: '0', q: '450' }, { t: '36', q: '0' }]);
    expect(readRateHistoryCsv('0,450\n36,0\n').rows).toEqual([{ t: '0', q: '450' }, { t: '36', q: '0' }]);
  });

  test('refuses a file it cannot place', () => {
    expect(readRateHistoryCsv('well,choke\nA,16\n').ok).toBe(false);
    expect(readRateHistoryCsv('').ok).toBe(false);
  });
});

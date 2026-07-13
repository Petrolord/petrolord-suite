/**
 * G2.6 — digitizer engine: axis calibration (linear + log), trace
 * ordering, uniform resampling, and the full digitizeCurve payload.
 * Exact synthetic geometry so every expected value is hand-derivable.
 */

import {
  makeAxis, traceToSamples, resampleUniform, digitizeCurve,
} from '../engine/digitizer';

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe('makeAxis', () => {
  test('linear pixel->value', () => {
    // pixel 100 -> 2000 m, pixel 500 -> 2400 m => 1 px = 1 m
    const ax = makeAxis(100, 2000, 500, 2400, false);
    expect(close(ax(100), 2000)).toBe(true);
    expect(close(ax(300), 2200)).toBe(true);
    expect(close(ax(500), 2400)).toBe(true);
  });
  test('log axis interpolates in log10', () => {
    // pixel 0 -> 0.1 ohm, pixel 100 -> 100 ohm (3 decades)
    const ax = makeAxis(0, 0.1, 100, 100, true);
    expect(close(ax(0), 0.1)).toBe(true);
    expect(close(ax(100), 100)).toBe(true);
    expect(close(ax(50), 10 ** 0.5)).toBe(true); // geometric midpoint
  });
  test('guards', () => {
    expect(() => makeAxis(50, 1, 50, 2)).toThrow(/different pixels/);
    expect(() => makeAxis(0, -1, 100, 10, true)).toThrow(/positive/);
  });
});

test('traceToSamples orders by depth and collapses duplicates', () => {
  const depthAxis = (py) => py;         // pixel == depth
  const valueAxis = (px) => px / 10;
  const s = traceToSamples(
    [{ x: 100, y: 30 }, { x: 50, y: 10 }, { x: 80, y: 20 }, { x: 40, y: 10 }],
    depthAxis, valueAxis,
  );
  // depth 10 appears twice -> last wins (value 40/10 = 4)
  expect(s).toEqual([{ depth: 10, value: 4 }, { depth: 20, value: 8 }, { depth: 30, value: 10 }]);
});

describe('resampleUniform', () => {
  test('linear ramp resamples exactly', () => {
    const samples = [{ depth: 2000, value: 0 }, { depth: 2010, value: 100 }]; // 10 v/m
    const r = resampleUniform(samples, 2);
    expect(r.startMdM).toBe(2000);
    expect(r.stopMdM).toBe(2010);
    expect(r.stepM).toBe(2);
    expect(r.data.length).toBe(6);
    expect(Array.from(r.data)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  test('piecewise segments pick the right interval', () => {
    const samples = [{ depth: 0, value: 0 }, { depth: 10, value: 10 }, { depth: 20, value: 0 }];
    const r = resampleUniform(samples, 5); // 0,5,10,15,20
    expect(Array.from(r.data)).toEqual([0, 5, 10, 5, 0]);
  });
  test('guards', () => {
    expect(() => resampleUniform([{ depth: 1, value: 1 }], 1)).toThrow(/at least two/);
    expect(() => resampleUniform([{ depth: 0, value: 0 }, { depth: 1, value: 1 }], 0)).toThrow(/step must be positive/);
  });
});

test('digitizeCurve: full payload with digitized provenance', () => {
  const log = digitizeCurve({
    points: [{ x: 20, y: 100 }, { x: 60, y: 300 }, { x: 40, y: 200 }],
    depthCal: [{ pixel: 100, value: 2000 }, { pixel: 300, value: 2200 }], // 1px=1m
    valueCal: [{ pixel: 0, value: 0 }, { pixel: 100, value: 100 }],        // 1px=1 unit
    valueLog: false,
    step: 25,
    mnemonic: 'GR',
    unit: 'GAPI',
    sourceImage: 'scan.png',
  });
  expect(log.mnemonic).toBe('GR');
  expect(log.unit).toBe('GAPI');
  expect(log.data).toBeInstanceOf(Float32Array);
  expect(log.provenance.digitized).toBe(true);
  expect(log.provenance.value_scale).toBe('linear');
  expect(log.provenance.n_trace_points).toBe(3);
  // depth cal 1px=1m from 2000: y 100->300 maps to 2000..2200,
  // step 25 => 9 samples
  expect(log.nSamples).toBe(9);
  expect(log.startMdM).toBe(2000);
  expect(log.stopMdM).toBe(2200);
  // value == x pixel exactly; trace y=100,200,300 -> x=20,40,60 linear
  expect(log.data[0]).toBeCloseTo(20, 4);
  expect(log.data[8]).toBeCloseTo(60, 4);
  expect(log.data[4]).toBeCloseTo(40, 4); // midpoint
});

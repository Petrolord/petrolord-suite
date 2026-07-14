/**
 * G2.4 — crossplot math: polygon tagging, sample extraction, Pickett
 * helpers. The depth-window fit must recover the type well's exact
 * water line (m = 2, a*Rw = 0.05) from its clean Sw = 1 leg — the same
 * numbers the e2e asserts off the UI.
 */

import fs from 'fs';
import path from 'path';
import {
  pointInPolygon, crossplotSamples, faciesCurve,
  ND_LITHOLOGY_LINES, pickettIsoSwLine, pickettFitDepthWindow,
} from '../engine/crossplot';
import { computeWell, DEFAULT_PARAMS } from '../engine/pipeline';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));

const close = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

describe('pointInPolygon / faciesCurve', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  test('inside, outside, first-match priority, NaN passthrough', () => {
    expect(pointInPolygon(0.5, 0.5, square)).toBe(true);
    expect(pointInPolygon(1.5, 0.5, square)).toBe(false);
    const overlapping = [
      { polygon: square },
      { polygon: [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]] }, // nested — must lose to first
    ];
    const f = faciesCurve([0.5, 2, NaN], [0.5, 2, 0.5], overlapping);
    expect(f[0]).toBe(0);
    expect(Number.isNaN(f[1])).toBe(true);
    expect(Number.isNaN(f[2])).toBe(true);
  });
  test('concave polygon', () => {
    const lShape = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    expect(pointInPolygon(0.5, 1.5, lShape)).toBe(true);
    expect(pointInPolygon(1.5, 1.5, lShape)).toBe(false);
  });
});

test('crossplotSamples keeps only finite pairs and carries depth', () => {
  const s = crossplotSamples([1, NaN, 3], [4, 5, NaN], [10, 11, 12]);
  expect(s).toEqual([{ i: 0, x: 1, y: 4, depthM: 10 }]);
});

test('ND lithology lines: three named two-point segments in plot range', () => {
  expect(ND_LITHOLOGY_LINES.map((l) => l.name)).toEqual(['Sandstone', 'Limestone', 'Dolomite']);
  for (const l of ND_LITHOLOGY_LINES) {
    expect(l.pts).toHaveLength(2);
    for (const p of l.pts) {
      expect(p.x).toBeGreaterThanOrEqual(-0.05);
      expect(p.x).toBeLessThanOrEqual(0.5);
      expect(p.y).toBeGreaterThan(1.8);
      expect(p.y).toBeLessThan(3);
    }
  }
});

test('pickettIsoSwLine endpoints satisfy Archie exactly', () => {
  const p = { a: 1, m: 2, n: 2, rw: 0.05 };
  const line = pickettIsoSwLine(0.5, p, 0.05, 0.3);
  for (const { x: rt, y: phi } of line.pts) {
    // Sw = ((a*Rw)/(phi^m*Rt))^(1/n) must give back 0.5
    expect(close(((p.a * p.rw) / (phi ** p.m * rt)) ** (1 / p.n), 0.5)).toBe(true);
  }
});

test('depth-window Pickett fit recovers the type well water line exactly', () => {
  const { outputs } = computeWell(
    { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') },
    DEFAULT_PARAMS,
  );
  // clean water leg of SAND B: Sw target = 1, shale fraction < 0.01
  const fit = pickettFitDepthWindow(curve('DEPT'), outputs.PHIE, curve('RT'), 2075, 2078);
  expect(fit.nPoints).toBeGreaterThanOrEqual(5);
  expect(close(fit.m, 2)).toBe(true);
  expect(close(fit.aRw, 0.05)).toBe(true);
});

test('degenerate window throws the domain error', () => {
  expect(() => pickettFitDepthWindow([1, 2], [0.2, 0.2], [5, 5], 0, 10)).toThrow(/degenerate/);
  expect(() => pickettFitDepthWindow([1, 2], [0.2, 0.2], [5, 5], 100, 200)).toThrow(/at least two/);
});

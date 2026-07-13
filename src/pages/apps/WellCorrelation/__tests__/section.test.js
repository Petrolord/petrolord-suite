/**
 * G3.0 — cross-section geometry. Exact closed-form arithmetic, so the
 * expected values are hand-derived from the synthetic 3-well section
 * (services/sampleSection.js). No Python oracle: there is no numerical
 * method to cross-check (see the plan §4 rationale).
 */

import {
  topMd, computeFlattening, displayedDepth, correlationPolyline,
  zoneSpan, displayedRange, depthToY, columnX, allTopNames,
} from '../engine/section';
import { sampleWells } from '../services/sampleSection';

const wells = sampleWells();
const [w1, w2, w3] = wells;
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

test('topMd looks up by name; missing -> null', () => {
  expect(topMd(w1, 'Top Dome')).toBe(1500);
  expect(topMd(w3, 'Mid Shale')).toBeNull(); // W3 lacks it by construction
});

test('allTopNames = union in first-seen order', () => {
  expect(allTopNames(wells)).toEqual(['Top Dome', 'Mid Shale', 'Base Sand']);
});

describe('computeFlattening', () => {
  test('structural: every shift 0', () => {
    const f = computeFlattening(wells, { mode: 'structural' });
    expect(f.map((x) => x.shift)).toEqual([0, 0, 0]);
    expect(f.every((x) => x.hasDatumTop)).toBe(true);
  });

  test('flatten on Top Dome to datum 1500: Top Dome aligns across all wells', () => {
    const datum = { mode: 'flatten', topName: 'Top Dome', datumM: 1500 };
    const f = computeFlattening(wells, datum);
    // shift = 1500 - md(Top Dome): W1 0, W2 -40, W3 +30
    expect(f[0].shift).toBe(0);
    expect(f[1].shift).toBe(-40);
    expect(f[2].shift).toBe(30);
    // the datum top now displays at exactly 1500 m in every well
    for (const w of wells) {
      const shift = f.find((x) => x.id === w.id).shift;
      expect(close(displayedDepth(topMd(w, 'Top Dome'), shift), 1500)).toBe(true);
    }
  });

  test('flatten: a well missing the datum top is flagged, shift null', () => {
    const f = computeFlattening(wells, { mode: 'flatten', topName: 'Mid Shale', datumM: 1600 });
    const w3f = f.find((x) => x.id === 'corr-w3');
    expect(w3f.shift).toBeNull();
    expect(w3f.hasDatumTop).toBe(false);
    // displayedDepth falls back to true MD when shift is null
    expect(displayedDepth(1470, w3f.shift)).toBe(1470);
  });

  test('guards', () => {
    expect(() => computeFlattening(wells, { mode: 'nope' })).toThrow(/Unknown datum/);
    expect(() => computeFlattening(wells, { mode: 'flatten' })).toThrow(/needs a top name/);
    expect(() => computeFlattening(wells, { mode: 'flatten', topName: 'Top Dome' })).toThrow(/datum depth/);
  });
});

describe('correlationPolyline', () => {
  test('flattened Top Dome is a FLAT line across all three wells', () => {
    const f = computeFlattening(wells, { mode: 'flatten', topName: 'Top Dome', datumM: 1500 });
    const line = correlationPolyline(wells, f, 'Top Dome');
    expect(line.map((p) => p.wellIndex)).toEqual([0, 1, 2]);
    expect(line.every((p) => close(p.displayed, 1500))).toBe(true);
  });

  test('a top absent in one well only connects the wells that have it', () => {
    const f = computeFlattening(wells, { mode: 'structural' });
    const line = correlationPolyline(wells, f, 'Mid Shale');
    expect(line.map((p) => p.wellId)).toEqual(['corr-w1', 'corr-w2']); // not W3
    expect(line[0].displayed).toBe(1580);
    expect(line[1].displayed).toBe(1610);
  });
});

describe('zoneSpan', () => {
  test('structural span between Top Dome and Base Sand', () => {
    expect(zoneSpan(w1, 0, 'Top Dome', 'Base Sand')).toEqual({ top: 1500, base: 1660 });
  });
  test('flattening shifts the span with the well', () => {
    // W2 shift -40 flattening on Top Dome
    expect(zoneSpan(w2, -40, 'Top Dome', 'Base Sand')).toEqual({ top: 1500, base: 1665 });
  });
  test('reversed top order still returns top<base; missing top -> null', () => {
    expect(zoneSpan(w1, 0, 'Base Sand', 'Top Dome')).toEqual({ top: 1500, base: 1660 });
    expect(zoneSpan(w3, 0, 'Top Dome', 'Mid Shale')).toBeNull();
  });
});

test('displayedRange spans tops (+ optional log ranges) under flattening', () => {
  const f = computeFlattening(wells, { mode: 'structural' });
  // tops only: min = W3 Top Dome 1470, max = W2 Base Sand 1705
  expect(displayedRange(wells, f)).toEqual([1470, 1705]);
  // with a log range that exceeds the tops
  const r = displayedRange(wells, f, { 'corr-w1': [1400, 1750] });
  expect(r).toEqual([1400, 1750]);
});

test('depthToY / columnX are linear and exact at the endpoints', () => {
  expect(depthToY(1500, 1500, 1700, 40, 400)).toBe(40);
  expect(depthToY(1700, 1500, 1700, 40, 400)).toBe(440);
  expect(depthToY(1600, 1500, 1700, 40, 400)).toBe(240);
  expect(columnX(0, 3, 50, 900)).toBe(50);
  expect(columnX(1, 3, 50, 900)).toBe(350);
});

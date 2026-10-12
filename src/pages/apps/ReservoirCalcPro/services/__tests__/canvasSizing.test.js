// RCP preview sizing (2026-10-12): the page root has a height of its own,
// canvases get whole device pixels at DPR 2, and the split view stacks in a
// tall pane.
import { RCP_ROOT_CLASS, hasDefiniteHeight, canvasBackingSize, splitDirection } from '../canvasSizing';

describe('page root height', () => {
  test('the root class gives a definite height', () => {
    expect(hasDefiniteHeight(RCP_ROOT_CLASS)).toBe(true);
  });
  test('negative control: the old h-full root (auto under the min-h-full dashboard scope) is caught', () => {
    expect(hasDefiniteHeight('h-full')).toBe(false);
    expect(hasDefiniteHeight('min-h-full')).toBe(false);
    expect(hasDefiniteHeight('min-h-screen')).toBe(false);
  });
});

describe('canvasBackingSize', () => {
  test('whole device pixels at DPR 2', () => {
    expect(canvasBackingSize(589.5, 964, 2)).toEqual({ width: 1179, height: 1928, dpr: 2 });
    expect(canvasBackingSize(311.3, 630.4, 2)).toEqual({ width: 623, height: 1261, dpr: 2 });
  });
  test('DPR is capped at 2 and falls back to 1', () => {
    expect(canvasBackingSize(100, 50, 3)).toEqual({ width: 200, height: 100, dpr: 2 });
    expect(canvasBackingSize(100, 50, undefined)).toEqual({ width: 100, height: 50, dpr: 1 });
    expect(canvasBackingSize(100, 50, 0)).toEqual({ width: 100, height: 50, dpr: 1 });
  });
  test('an unmeasured canvas is 1 x 1, never 0 or NaN', () => {
    expect(canvasBackingSize(0, 0, 2)).toEqual({ width: 1, height: 1, dpr: 2 });
    expect(canvasBackingSize(NaN, -5, 2)).toEqual({ width: 1, height: 1, dpr: 2 });
  });
  test('negative control: the old sizing (r.width * dpr, unrounded) gave fractional backing sizes', () => {
    const old = (w, dpr) => Math.max(1, w * Math.min(dpr || 1, 2));
    expect(Number.isInteger(old(311.3, 2))).toBe(false);
    expect(Number.isInteger(canvasBackingSize(311.3, 10, 2).width)).toBe(true);
  });
});

describe('splitDirection', () => {
  test('side by side only in a wide pane', () => {
    expect(splitDirection(1920, 1000)).toBe('row');
    expect(splitDirection(1500, 1000)).toBe('row');
  });
  test('stacked in a pane that is not much wider than tall (1920x1080 app layout)', () => {
    expect(splitDirection(1178, 964)).toBe('column');
    expect(splitDirection(624, 652)).toBe('column');
    expect(splitDirection(438, 684)).toBe('column');
  });
  test('an unmeasured pane keeps side by side', () => {
    expect(splitDirection(0, 0)).toBe('row');
    expect(splitDirection(NaN, 500)).toBe('row');
  });
  test('negative control: a lower threshold would split the 1920x1080 pane into slivers', () => {
    expect(splitDirection(1178, 964, 1.0)).toBe('row');
  });
});

describe('the page uses the root class', () => {
  // read as text: the page pulls in ESM-only deps jest does not transform
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../ReservoirCalcPro.jsx'), 'utf8');
  test('the live page root takes RCP_ROOT_CLASS from canvasSizing', () => {
    expect(src).toMatch(/import \{ RCP_ROOT_CLASS \} from '\.\/services\/canvasSizing'/);
    expect(src).toMatch(/data-testid="rcp-theme-scope" className=\{RCP_ROOT_CLASS\}/);
  });
  test('negative control: the old literal h-full root is gone', () => {
    expect(src).not.toMatch(/data-testid="rcp-theme-scope" className="h-full"/);
  });
});

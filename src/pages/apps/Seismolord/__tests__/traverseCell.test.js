import { traverseCell } from '../lib/traverseCell';

describe('traverseCell (2026-10-12: 3D horizons on 2D lines)', () => {
  const nIl = 128; const nXl = 168;
  test('a fractional 2D line position reads the nearest cell', () => {
    expect(traverseCell({ il: 27.0001, xl: 90.9999 }, nIl, nXl)).toBe(27 * nXl + 91);
    expect(traverseCell({ il: 26.6, xl: 90.4 }, nIl, nXl)).toBe(27 * nXl + 90);
  });
  test('negative control: the raw fractional index reads no pick', () => {
    const grid = new Float32Array(nIl * nXl).fill(300);
    expect(grid[27.0001 * nXl + 90.9999]).toBeUndefined();
    expect(grid[traverseCell({ il: 27.0001, xl: 90.9999 }, nIl, nXl)]).toBe(300);
  });
  test('off the survey or null is -1', () => {
    expect(traverseCell(null, nIl, nXl)).toBe(-1);
    expect(traverseCell({ il: -0.6, xl: 3 }, nIl, nXl)).toBe(-1);
    expect(traverseCell({ il: 3, xl: 167.6 }, nIl, nXl)).toBe(-1);
  });
  test('a whole-cell traverse is unchanged', () => {
    expect(traverseCell({ il: 5, xl: 6 }, nIl, nXl)).toBe(5 * nXl + 6);
  });
});

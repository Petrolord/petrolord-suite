import {
  linspace, logspace, linearInterp, findSignChanges, brentSolve, linearFit, clamp, num,
} from '../numerics';

describe('nodal numerics', () => {
  test('linspace hits both ends with even spacing', () => {
    const g = linspace(0, 10, 6);
    expect(g).toHaveLength(6);
    expect(g[0]).toBe(0);
    expect(g[5]).toBe(10);
    expect(g[1]).toBeCloseTo(2, 12);
  });

  test('logspace is log-even and endpoint exact', () => {
    const g = logspace(1, 1000, 4);
    expect(g[0]).toBeCloseTo(1, 12);
    expect(g[1]).toBeCloseTo(10, 9);
    expect(g[2]).toBeCloseTo(100, 9);
    expect(g[3]).toBeCloseTo(1000, 9);
  });

  test('linearInterp interpolates and clamps', () => {
    const xs = [0, 10, 20];
    const ys = [0, 100, 400];
    expect(linearInterp(xs, ys, 5)).toBeCloseTo(50, 12);
    expect(linearInterp(xs, ys, 15)).toBeCloseTo(250, 12);
    expect(linearInterp(xs, ys, -5)).toBe(0);
    expect(linearInterp(xs, ys, 50)).toBe(400);
  });

  test('linearInterp handles descending x', () => {
    expect(linearInterp([20, 10, 0], [400, 100, 0], 15)).toBeCloseTo(250, 12);
  });

  test('findSignChanges locates straddles', () => {
    expect(findSignChanges([3, 1, -2, -1, 4])).toEqual([1, 3]);
    expect(findSignChanges([1, 2, 3])).toEqual([]);
  });

  test('brentSolve finds cos(x) = x', () => {
    const { root, converged } = brentSolve((x) => Math.cos(x) - x, 0, 1);
    expect(converged).toBe(true);
    expect(root).toBeCloseTo(0.7390851332151607, 8);
  });

  test('brentSolve rejects a non-bracketing interval', () => {
    const { converged } = brentSolve((x) => x * x + 1, -1, 1);
    expect(converged).toBe(false);
  });

  test('linearFit recovers an exact line', () => {
    const fit = linearFit([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
  });

  test('clamp and num behave', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(num('2.5', 0)).toBe(2.5);
    expect(num('x', 7)).toBe(7);
  });
});

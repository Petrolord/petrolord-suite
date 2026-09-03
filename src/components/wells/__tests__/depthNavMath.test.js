import { zoomAbout, panBy, dragEdge, centerOn, clampView, hitNav, decimateProfile, stepPan, isFull } from '../depthNavMath';

const E = [2000, 2100];

test('zoomAbout matches the TrackViewer formula and returns null at full extent', () => {
  expect(zoomAbout(null, 2050, 0.8, E)).toEqual([2010, 2090]);
  expect(zoomAbout([2010, 2090], 2050, 1.25, E)).toBeNull();
  expect(zoomAbout([2040, 2060], 2050, 0.8, E)).toEqual([2042, 2058]);
  // the 2 m floor keeps the previous window
  expect(zoomAbout([2049, 2051], 2050, 0.8, E)).toEqual([2049, 2051]);
});

test('panBy clamps at both ends without changing the span', () => {
  expect(panBy([2010, 2030], 5, E)).toEqual([2015, 2035]);
  expect(panBy([2010, 2030], -50, E)).toEqual([2000, 2020]);
  expect(panBy([2070, 2090], 50, E)).toEqual([2080, 2100]);
  expect(clampView([1990, 2200], E)).toEqual(E);
});

test('dragEdge keeps the opposite edge and enforces the minimum span', () => {
  expect(dragEdge([2020, 2060], 'top', 2030, E)).toEqual([2030, 2060]);
  expect(dragEdge([2020, 2060], 'top', 2059.5, E)).toEqual([2058, 2060]);
  expect(dragEdge([2020, 2060], 'base', 2200, E)).toEqual([2020, 2100]);
  expect(dragEdge([2000, 2060], 'base', 2100, E)).toBeNull();
});

test('centerOn and stepPan clamp near the ends; null stays null', () => {
  expect(centerOn([2000, 2020], 2095, E)).toEqual([2080, 2100]);
  expect(centerOn(null, 2050, E)).toBeNull();
  expect(stepPan([2000, 2020], E, 0.1)).toEqual([2002, 2022]);
  expect(isFull(null, E)).toBe(true);
  expect(isFull([2000, 2100], E)).toBe(true);
  expect(isFull([2000, 2050], E)).toBe(false);
});

test('hitNav bands: handles win over the body', () => {
  const h = 100;
  expect(hitNav(20, [2020, 2060], E, h)).toBe('top');
  expect(hitNav(40, [2020, 2060], E, h)).toBe('body');
  expect(hitNav(62, [2020, 2060], E, h)).toBe('base');
  expect(hitNav(90, [2020, 2060], E, h)).toBe('outside');
});

test('decimateProfile keeps min and max per row and leaves NaN gaps', () => {
  const depth = Float64Array.from([2000, 2001, 2002, 2050, 2051, 2099]);
  const vals = Float64Array.from([10, 30, NaN, 5, 7, 100]);
  const { mins, maxs } = decimateProfile(depth, vals, E, 10);
  expect(mins[0]).toBe(10); expect(maxs[0]).toBe(30);
  expect(mins[5]).toBe(5); expect(maxs[5]).toBe(7);
  expect(Number.isNaN(mins[3])).toBe(true);
  expect(maxs[9]).toBe(100);
});

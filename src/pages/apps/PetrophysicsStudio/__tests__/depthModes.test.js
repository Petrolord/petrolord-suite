import { toDisplay, fromDisplay, depthLabel } from '../viewer/depthModes';

test('toDisplay/fromDisplay round trip in ft and are identity in m', () => {
  expect(toDisplay(2000, 'm')).toBe(2000);
  expect(fromDisplay(toDisplay(2000, 'ft'), 'ft')).toBeCloseTo(2000, 9);
  expect(toDisplay(0.3048, 'ft')).toBeCloseTo(1, 12);
});

test('depthLabel formats units and non-finite values', () => {
  expect(depthLabel(2040, 'm')).toBe('2040.0 m');
  expect(depthLabel(2040, 'ft')).toBe('6692.9 ft');
  expect(depthLabel(NaN, 'ft')).toBe('—');
});

// ---- PT8 depth tracks (2026-09-05) -----------------------------------------
// MD / TVD / TVDSS as their own gutter columns, converted through the same
// welldata frame the checkshot door and the LAS depth columns use.
import { makeDepthAxes, DEPTH_TRACK_KEYS, DEPTH_TRACK_TITLE } from '../viewer/depthModes';

const vertical = { kb_m: 30, deviation: null };
const deviated = {
  kb_m: 30,
  deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 3000, inc: 60, azi: 90 }],
};

test('MD alone is the default, and an empty or unknown set still yields an axis', () => {
  for (const keys of [[], null, ['nonsense']]) {
    const axes = makeDepthAxes(keys, { well: vertical });
    expect(axes.map((a) => a.key)).toEqual(['md']);
  }
  expect(DEPTH_TRACK_KEYS).toEqual(['md', 'tvd', 'tvdss']);
  expect(DEPTH_TRACK_TITLE.tvdss).toBe('TVDSS');
});

test('a well with no survey is vertical: TVD = MD and TVDSS = MD - KB', () => {
  const [md, tvd, tvdss] = makeDepthAxes(['md', 'tvd', 'tvdss'], { well: vertical });
  expect(md.valueOf(2000)).toBeCloseTo(2000, 9);
  expect(tvd.valueOf(2000)).toBeCloseTo(2000, 9);
  expect(tvdss.valueOf(2000)).toBeCloseTo(1970, 9);   // KB 30
  expect(md.title).toBe('MD (m)');
  expect(tvdss.title).toBe('TVDSS (m)');
});

test('a deviated well reads TVD shallower than MD below the kickoff', () => {
  const [, tvd, tvdss] = makeDepthAxes(['md', 'tvd', 'tvdss'], { well: deviated });
  expect(tvd.valueOf(500)).toBeCloseTo(500, 6);        // still vertical
  expect(tvd.valueOf(2500)).toBeLessThan(2500);        // past the kickoff
  expect(tvdss.valueOf(2500)).toBeCloseTo(tvd.valueOf(2500) - 30, 9);
  // past the last station the final tangent continues rather than failing
  expect(Number.isFinite(tvd.valueOf(4000))).toBe(true);
  expect(tvd.valueOf(4000)).toBeGreaterThan(tvd.valueOf(3000));
});

test('labels are in the display unit while values stay metres', () => {
  const [md, tvdss] = makeDepthAxes(['md', 'tvdss'], { well: vertical, unit: 'ft' });
  expect(md.valueOf(2000)).toBeCloseTo(2000, 9);       // metres, for the navigator
  expect(md.labelOf(2000)).toBeCloseTo(2000 / 0.3048, 6);
  expect(md.title).toBe('MD (ft)');
  expect(tvdss.labelOf(2000)).toBeCloseTo(1970 / 0.3048, 6);
});

test('the requested column order is kept, and unknown keys are dropped from it', () => {
  const axes = makeDepthAxes(['tvdss', 'md', 'nope'], { well: vertical });
  expect(axes.map((a) => a.key)).toEqual(['tvdss', 'md']);
});

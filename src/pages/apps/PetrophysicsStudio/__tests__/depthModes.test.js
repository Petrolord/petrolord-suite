import { toDisplay, fromDisplay, depthLabel, makeTvdLookup } from '../viewer/depthModes';

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

test('makeTvdLookup is null without a survey', () => {
  expect(makeTvdLookup([])).toBeNull();
});

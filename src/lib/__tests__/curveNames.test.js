import { nextFreeName, digitizedCurveName, nameKey } from '@/lib/curveNames';

test('nextFreeName appends the next free :n suffix, case-insensitively', () => {
  expect(nextFreeName('GR', [])).toBe('GR');
  expect(nextFreeName('gr', ['GR', 'GR:2'])).toBe('gr:3');
  expect(nameKey(' gr ')).toBe('GR');
});

test('digitizedCurveName always yields a new _DIG name', () => {
  expect(digitizedCurveName('GR', [])).toBe('GR_DIG');
  expect(digitizedCurveName('GR', ['GR_DIG'])).toBe('GR_DIG:2');
  expect(digitizedCurveName('gr:3', ['GR'])).toBe('GR_DIG');
  expect(digitizedCurveName('GR_DIG', ['gr_dig'])).toBe('GR_DIG:2');
  expect(digitizedCurveName('', [])).toBe('CURVE_DIG');
});

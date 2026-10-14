/** Monte Carlo money reads like the Results Viewer (video programme, 2026-10-14). */
import { fmtM } from '../EpeMonteCarloPanel';

test('three significant figures, sign before the currency', () => {
  expect(fmtM(-1036000)).toBe('-$1.04M');
  expect(fmtM(1980235)).toBe('$1.98M');
  expect(fmtM(4100000)).toBe('$4.1M');
  expect(fmtM(97500)).toBe('$97.5K');
  expect(fmtM(2.4e9)).toBe('$2.4B');
  expect(fmtM(null)).toBe('N/A');
});

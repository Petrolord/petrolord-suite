// PT7: the limits the edge function enforces (1600 px, 1.5 MB) are pinned
// here on the pure helpers so the client never sends a 413.

import { planDownscale, dataUrlBytes, fitsBudget, SCAN_MAX_SIDE, SCAN_MAX_BYTES } from '../services/scanImage';

test('planDownscale caps the long side at 1600 and never upscales', () => {
  expect(planDownscale(800, 600)).toEqual({ scale: 1, width: 800, height: 600 });
  expect(planDownscale(3200, 1000)).toEqual({ scale: 0.5, width: 1600, height: 500 });
  expect(planDownscale(1000, 4000)).toEqual({ scale: 0.4, width: 400, height: 1600 });
  expect(planDownscale(5000, 5000, { maxSide: 100 })).toEqual({ scale: 0.02, width: 100, height: 100 });
  expect(SCAN_MAX_SIDE).toBe(1600);
});

test('dataUrlBytes decodes the base64 length and fitsBudget applies the 1.5 MB cap', () => {
  expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
  expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2);
  expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1);
  expect(dataUrlBytes('nonsense')).toBe(0);
  const big = `data:image/png;base64,${'A'.repeat(Math.ceil((SCAN_MAX_BYTES + 3000) * 4 / 3))}`;
  expect(fitsBudget(big)).toBe(false);
  expect(fitsBudget('data:image/png;base64,AAAA')).toBe(true);
});

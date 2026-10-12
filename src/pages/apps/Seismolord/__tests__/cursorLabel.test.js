import { latticeNumber } from '../lib/cursorLabel';

test('a traverse position reads to 0.1 of a line (2026-10-12: "IL 1101.0001279215835")', () => {
  expect(latticeNumber(1000, 101.0001279215835, 1)).toBe(101 + 1000);
  expect(latticeNumber(1960, 103.999995146516, 1)).toBe(2064);
  expect(latticeNumber(1960, 52.46, 1)).toBe(2012.5);
  expect(String(latticeNumber(1000, 101.0001279215835, 1))).toBe('1101');
});

test('a whole line stays whole, with a step', () => {
  expect(latticeNumber(1000, 27, 1)).toBe(1027);
  expect(latticeNumber(100, 3, 2)).toBe(106);
});

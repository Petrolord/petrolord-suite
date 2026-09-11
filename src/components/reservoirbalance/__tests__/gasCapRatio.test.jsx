// The gas cap ratio m writer (2026-09-11).
//
// Before this field existed, a case created as "oil with gas cap" reached the
// engine with m undefined unless the user ran a history match, and the engine
// reads a missing m as 0 — the undersaturated material balance, not a small gas
// cap. The distinction the parser has to preserve is therefore "not stated"
// (null, which the engine warns about) versus "stated as zero".
import { parseGasCapM } from '../PvtRock.jsx';

describe('parseGasCapM', () => {
  test('blank is "not stated", which must reach the engine as null', () => {
    expect(parseGasCapM('')).toBeNull();
    expect(parseGasCapM('   ')).toBeNull();
    expect(parseGasCapM(null)).toBeNull();
    expect(parseGasCapM(undefined)).toBeNull();
  });

  test('a stated ratio survives as a number', () => {
    expect(parseGasCapM('0.3')).toBe(0.3);
    expect(parseGasCapM('1')).toBe(1);
    expect(parseGasCapM(0.45)).toBe(0.45);
  });

  test('an explicit zero is a decision and is kept as 0, not turned into null', () => {
    // Number(null) is 0 and Number('') is 0, which is exactly how a blank field
    // becomes a silent m = 0 elsewhere in this app. Not here.
    expect(parseGasCapM('0')).toBe(0);
    expect(parseGasCapM(0)).toBe(0);
  });

  test('nonsense and negatives are rejected rather than coerced', () => {
    expect(parseGasCapM('abc')).toBeNull();
    expect(parseGasCapM('-0.2')).toBeNull();
  });
});

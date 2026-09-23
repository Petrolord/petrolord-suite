/**
 * Reason figures for reading (D1): qcDisplay.js shortens the engine's
 * shortest round-trip decimals on screen without changing what a reason
 * says. The reasons below are the engine's own, produced by calling the
 * vendored engine, so a change in its wording shows up here.
 */
import * as Q from '../../../../packages/engines/engines/dataai/quality.js';
import { displayNumber, displayReason, roundFigure } from '@/utils/dataAi/qcDisplay';

describe('roundFigure', () => {
  it('leaves integers exactly as printed', () => {
    ['0', '3', '-12', '1338506', '10000000000000000'].forEach((t) => expect(roundFigure(t)).toBe(t));
  });

  it('rounds to at most 6 decimals and trims trailing zeros', () => {
    expect(roundFigure('2.9999999999999996')).toBe('3');
    expect(roundFigure('0.30000000000000004')).toBe('0.3');
    expect(roundFigure('1.23456789')).toBe('1.234568');
    expect(roundFigure('-4.1000000001')).toBe('-4.1');
    expect(roundFigure('1338506.2')).toBe('1338506.2');
    expect(roundFigure('2.5')).toBe('2.5');
  });

  it('keeps at least 4 significant figures on a small number, so it never reads as 0', () => {
    expect(roundFigure('0.0000012345678')).toBe('0.000001235');
    expect(roundFigure('-0.00001234567')).toBe('-0.00001235');
    expect(roundFigure('0.000001')).toBe('0.000001');
  });

  it('keeps 6 significant figures in exponent form', () => {
    expect(roundFigure('1.2345678901234e-7')).toBe('1.23457e-7');
    expect(roundFigure('2e-7')).toBe('2e-7');
    expect(roundFigure('1.5e+21')).toBe('1.5e+21');
  });
});

describe('displayNumber', () => {
  it('formats numbers by the same rule and names the infinities', () => {
    expect(displayNumber(0.1 + 0.2)).toBe('0.3');
    expect(displayNumber(7)).toBe('7');
    expect(displayNumber(Infinity)).toBe('infinity');
    expect(displayNumber(-Infinity)).toBe('minus infinity');
    expect(displayNumber(null)).toBe('');
    expect(displayNumber(NaN)).toBe('');
  });
});

describe('displayReason', () => {
  it('shows a figure unrounded when rounding would tie it with a different figure it is compared with', () => {
    // 2.9999999999999996 > 3 would read "3 ... 3" after rounding.
    expect(displayReason('value 12.3456789 has z = 3.0000000000000004, beyond the threshold 3'))
      .toBe('value 12.345679 has z = 3.0000000000000004, beyond the threshold 3');
    expect(displayReason('squared distance 7.3777589082278725, beyond the chi-square 0.975 quantile 7.377758908227871 on 2 degrees of freedom'))
      .toBe('squared distance 7.3777589082278725, beyond the chi-square 0.975 quantile 7.377758908227871 on 2 degrees of freedom');
  });

  it('keeps 2.9999999999999996 apart from the 3 it is compared with', () => {
    expect(displayReason('step 2.9999999999999996 from entry 4 differs from the expected 3 by more than 0.0000001'))
      .toBe('step 2.9999999999999996 from entry 4 differs from the expected 3 by more than 0.0000001');
    expect(displayReason('step 2.9999999999999996 from entry 4 differs from the expected 2.5 by more than 0.1'))
      .toBe('step 3 from entry 4 differs from the expected 2.5 by more than 0.1');
  });

  it('rounds figures that stay distinct, and leaves integers, entries and identifiers alone', () => {
    expect(displayReason('cumulative falls from 1338506.2000000002 at entry 19 to 1338456.2'))
      .toBe('cumulative falls from 1338506.2 at entry 19 to 1338456.2');
    expect(displayReason('Ekene-03 normalises to EKENE3, as does EKENE 3')).toBe('Ekene-03 normalises to EKENE3, as does EKENE 3');
    expect(displayReason('values[5] is missing')).toBe('values[5] is missing');
    expect(displayReason('step 0.30000000000000004 from entry 2 differs from the expected 0.1 by more than 1e-7.'))
      .toBe('step 0.3 from entry 2 differs from the expected 0.1 by more than 1e-7.');
  });

  it('passes through text with no figures, and empty values', () => {
    expect(displayReason('no figures here')).toBe('no figures here');
    expect(displayReason('')).toBe('');
    expect(displayReason(undefined)).toBe('');
  });

  it('never changes a comparison the engine printed: each shown figure keeps the order of the raw figures', () => {
    const reasons = [];
    const pop = [1, 1, 1, 1, 1, 1, 1, 1, 1, 4];
    [2.9, 2.9999999].forEach((threshold) => Q.zScores({ values: pop, threshold, sd: 'population' }).flags.forEach((f) => reasons.push(f.reason)));
    Q.hampel({ values: [1.1, 1.2, 1.15, 1.18, 9.123456789, 1.17, 1.16, 1.19, 1.14], halfWindow: 3, nSigma: 3 }).flags.forEach((f) => reasons.push(f.reason));
    Q.indexCheck({ index: [0.1, 0.2, 0.3, 0.4, 0.5, 0.7] }).flags.forEach((f) => reasons.push(f.reason));
    expect(reasons).toHaveLength(4);
    const figures = (s) => [...s.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w])/g)].map((m) => Number(m[0]));
    reasons.forEach((raw) => {
      const shown = displayReason(raw);
      const a = figures(raw);
      const b = figures(shown);
      expect(b).toHaveLength(a.length);
      for (let i = 0; i < a.length; i += 1) {
        expect(b[i]).toBeCloseTo(a[i], 6);
        for (let j = 0; j < a.length; j += 1) {
          expect(Math.sign(b[i] - b[j])).toBe(Math.sign(a[i] - a[j]));
        }
      }
    });
  });

  it('on the engine: the population-SD z of 2.9999999999999996 reads 3, unless its threshold would also read 3', () => {
    const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 4];
    const r = Q.zScores({ values, threshold: 2.9, sd: 'population' });
    // The repaired ceiling: sqrt(n - 1) = 3 with the population SD.
    expect(r.maxPossibleAbsZ).toBe(3);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].statistic).toBe(2.9999999999999996);
    expect(r.flags[0].reason).toBe('value 4 has z = 2.9999999999999996, beyond the threshold 2.9');
    expect(displayReason(r.flags[0].reason)).toBe('value 4 has z = 3, beyond the threshold 2.9');

    const tight = Q.zScores({ values, threshold: 2.9999999, sd: 'population' });
    expect(tight.flags[0].reason).toBe('value 4 has z = 2.9999999999999996, beyond the threshold 2.9999999');
    // Rounded, both would read 3 and the sentence would say 3 is beyond 3.
    expect(displayReason(tight.flags[0].reason)).toBe('value 4 has z = 2.9999999999999996, beyond the threshold 2.9999999');
  });

  it('on the engine: Hampel and index reasons shorten their float noise', () => {
    const h = Q.hampel({ values: [1.1, 1.2, 1.15, 1.18, 9.123456789, 1.17, 1.16, 1.19, 1.14], halfWindow: 3, nSigma: 3 });
    expect(h.flags[0].reason).toBe('value 9.123456789 is 7.943456789000001 from its window median 1.18, beyond 3 x 1.4826 x MAD = 0.08895600000000008');
    expect(displayReason(h.flags[0].reason)).toBe('value 9.123457 is 7.943457 from its window median 1.18, beyond 3 x 1.4826 x MAD = 0.088956');
    const idx = Q.indexCheck({ index: [0.1, 0.2, 0.3, 0.4, 0.5, 0.7] });
    expect(displayReason(idx.flags[0].reason)).toBe('step 0.2 from entry 4 differs from the expected 0.1 by more than 1e-7');
  });
});

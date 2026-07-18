/**
 * MB7 — Ramagost-Farshad corrected p/z (checked on Pletcher constants).
 */
import { ramagostCorrectedPz } from '../pzRamagost';

const ARGS = {
  pi: 6411,
  swi: 0.15,
  cw: 3e-6,
  cf: 6e-6,
};

describe('ramagostCorrectedPz', () => {
  it('applies (1 - ce·Δp) with the engine effective-compressibility form', () => {
    const out = ramagostCorrectedPz({
      ...ARGS,
      pOverZ: [5728.2, 2803.7],
      pressure: [6411, 2638],
    });
    // ce = (0.15·3e-6 + 6e-6)/0.85 = 7.5882e-6 per psi.
    const ce = (0.15 * 3e-6 + 6e-6) / 0.85;
    expect(out[0]).toBeCloseTo(5728.2, 6); // no correction at pi
    expect(out[1]).toBeCloseTo(2803.7 * (1 - ce * (6411 - 2638)), 6);
    expect(out[1]).toBeLessThan(2803.7);
  });

  it('passes nulls through and rejects unusable inputs', () => {
    const out = ramagostCorrectedPz({
      ...ARGS,
      pOverZ: [5728.2, null],
      pressure: [6411, 2638],
    });
    expect(out[1]).toBeNull();
    expect(ramagostCorrectedPz({ ...ARGS, pi: 0, pOverZ: [1], pressure: [1] })).toBeNull();
    expect(ramagostCorrectedPz({ ...ARGS, swi: 1, pOverZ: [1], pressure: [1] })).toBeNull();
  });
});

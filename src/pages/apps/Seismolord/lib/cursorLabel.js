// The cursor's inline or crossline number. On a traverse or a 2D line the
// cursor sits between lattice lines, so the position is fractional and
// carried float noise into the readout ("IL 1101.0001279215835"). It reads
// to 0.1 of a line; on an inline, crossline or time slice it stays whole.
export function latticeNumber(min, idx, step) {
  const v = min + idx * step;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : v;
}

/**
 * Material Balance Studio (MB7) — Ramagost-Farshad corrected p/z.
 * Pure function, jest guarded.
 *
 * For abnormally pressured gas reservoirs the rock and connate-water
 * compressibility term matters on the p/z plot. Ramagost-Farshad (1981)
 * corrects each point as
 *
 *   (p/z)_corr = (p/z) · (1 − ce·(pi − p)),  ce = (Swi·cw + cf)/(1 − Swi)
 *
 * which is the same effective-compressibility form the engine's Efw term
 * uses (Pletcher Eq. 4), so the overlay is consistent with the regression.
 * The corrected points fall on the depletion straight line even when the
 * raw p/z curves from formation compaction.
 */
export function ramagostCorrectedPz({ pOverZ, pressure, pi, swi, cw, cf }) {
  if (!Number.isFinite(pi) || pi <= 0) return null;
  if (!Number.isFinite(swi) || swi < 0 || swi >= 1) return null;
  if (!Number.isFinite(cw) || cw < 0 || !Number.isFinite(cf) || cf < 0) return null;
  const ce = (swi * cw + cf) / (1 - swi);
  if (!Array.isArray(pOverZ) || !Array.isArray(pressure)) return null;
  return pOverZ.map((pz, i) => {
    const p = pressure[i];
    if (!Number.isFinite(pz) || !Number.isFinite(p)) return null;
    return pz * (1 - ce * (pi - p));
  });
}

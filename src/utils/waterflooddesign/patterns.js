// The flood patterns of Waterflood Design Studio and the areal sweep
// correlation each one uses, in words for the screen, the report and the
// wf-forecast-1 contract. Pure.
export const PATTERN_LABELS = Object.freeze({
  'five-spot': 'five-spot',
});

export const patternLabel = (key) => PATTERN_LABELS[key || 'five-spot'] || String(key);

/** The areal sweep correlation of a pattern, with its source. */
export function arealSweepCorrelationText(key) {
  switch (key || 'five-spot') {
    default:
      return "five-spot: EA at breakthrough from Craig's data (Willhite's regression, Ahmed eq. 14-64), growth after breakthrough by Dyes, Caudle and Erickson (Ahmed eq. 14-66)";
  }
}

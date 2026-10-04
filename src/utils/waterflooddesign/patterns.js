// The flood patterns of Waterflood Design Studio and the areal sweep
// correlation each one uses, in words for the screen, the report and the
// wf-forecast-1 contract (WF-U2-002). The engine is forecastPattern with
// pattern.patternType (packages/engines/engines/waterflood/patternForecast.js).
// Pure.
//
// Source of the line drive correlations, read in full: T. Ahmed, Reservoir
// Engineering Handbook, 3rd ed. (2006), ch. 14, eq. 14-67 and its coefficient
// table (Fassihi 1986, a regression of the Dyes, Caudle and Erickson 1954
// charts). The mobility ratio of Ahmed's areal sweep procedure is eq. 14-61,
// Craig's basis (krw at the average saturation behind the front at
// breakthrough). A nine-spot is not offered: no published correlation could
// be read for it (Ahmed cites Muskat's nine-spot theory without a form).
export const PATTERN_KEYS = Object.freeze(['five-spot', 'direct-line', 'staggered-line']);

export const PATTERN_LABELS = Object.freeze({
  'five-spot': 'five-spot',
  'direct-line': 'direct line drive',
  'staggered-line': 'staggered line drive',
});

export const PATTERN_TITLES = Object.freeze({
  'five-spot': 'Five-spot',
  'direct-line': 'Direct line drive',
  'staggered-line': 'Staggered line drive',
});

export const patternKeyOf = (key) => (PATTERN_KEYS.includes(key) ? key : 'five-spot');
export const patternLabel = (key) => PATTERN_LABELS[patternKeyOf(key)];
export const patternTitle = (key) => PATTERN_TITLES[patternKeyOf(key)];
export const isLineDrive = (key) => patternKeyOf(key) !== 'five-spot';

/** The areal sweep correlation of a pattern, with its source. */
export function arealSweepCorrelationText(key) {
  const k = patternKeyOf(key);
  if (k === 'five-spot') {
    return "five-spot: EA at breakthrough from Craig's data (Willhite's regression, Ahmed eq. 14-64), growth after breakthrough by Dyes, Caudle and Erickson (Ahmed eq. 14-66)";
  }
  return `${PATTERN_LABELS[k]}: Fassihi's regression of the Dyes, Caudle and Erickson charts (Ahmed eq. 14-67), EA = 1 / (1 + A) with A from M and the producing water cut; EA at breakthrough at a water cut of 0, after breakthrough solved against each step's water cut`;
}

/** The validity row of the report's limits for a line drive. */
export const LINE_DRIVE_RANGE = 'M 0.1 to 10 (the range of the Dyes, Caudle and Erickson charts as stated in secondary sources; Ahmed does not print it)';

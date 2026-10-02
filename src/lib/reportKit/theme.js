/**
 * Report Kit: page geometry and colours. A4 portrait in millimetres, the
 * jsPDF default, as the Well Test Analysis report prints.
 */

export const NAVY = Object.freeze([15, 23, 42]);
export const SLATE = Object.freeze([100, 116, 139]);
export const BODY = Object.freeze([60, 60, 60]);

export const PAGE = Object.freeze({
  left: 14,
  right: 196,
  width: 182,
  top: 20,
  bottom: 280,
  footerY: 290,
});

// Series colours dark enough for a white plot (the house chart standard;
// the same hues the screen charts use through utils/chartTheme).
export const SERIES_RGB = Object.freeze({
  blue: [37, 99, 235],
  red: [220, 38, 38],
  emerald: [5, 150, 105],
  violet: [124, 58, 237],
  amber: [217, 119, 6],
  cyan: [8, 145, 178],
  slate: [51, 65, 85],
  pink: [190, 24, 93],
});

/** The palette in drawing order, for series that carry no colour of their own. */
export const SERIES_CYCLE = Object.freeze([
  SERIES_RGB.blue, SERIES_RGB.red, SERIES_RGB.emerald, SERIES_RGB.violet,
  SERIES_RGB.amber, SERIES_RGB.cyan, SERIES_RGB.slate, SERIES_RGB.pink,
]);

// Plot furniture
export const PLOT_GRID = Object.freeze([226, 232, 240]);
export const PLOT_FRAME = Object.freeze([100, 116, 139]);
export const PLOT_TEXT = Object.freeze([51, 65, 85]);
export const PLOT_MUTED = Object.freeze([71, 85, 105]);
export const BAND_RGB = Object.freeze([148, 163, 184]);

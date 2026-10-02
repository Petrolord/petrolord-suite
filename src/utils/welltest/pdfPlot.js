/**
 * Vector plots for the Well Test Analysis Studio PDF report (tester round 2,
 * 2026-10-02). The drawing now lives in the shared Report Kit
 * (src/lib/reportKit/plot.js and text.js), which was taken from this file;
 * this module keeps the studio's names for it and the studio's colours.
 */
import { SERIES_RGB } from '@/lib/reportKit/theme.js';

export { pdfText } from '@/lib/reportKit/text.js';
export { drawPlot, niceTicks, decadeTicks, tickText } from '@/lib/reportKit/plot.js';

// The studio's chart colours (components/welltest/primitives LINE), as RGB.
export const PLOT_RGB = Object.freeze({
  dp: SERIES_RGB.blue,
  derivative: SERIES_RGB.red,
  model: SERIES_RGB.emerald,
  modelDeriv: SERIES_RGB.violet,
  fit: SERIES_RGB.amber,
  rate: SERIES_RGB.cyan,
  pressure: SERIES_RGB.slate,
  temperature: SERIES_RGB.pink,
});

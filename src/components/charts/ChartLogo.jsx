import React from 'react';
import { CHART_LOGO_PATH, CHART_LOGO_STYLE } from '@/utils/chartTheme';

/**
 * Petrolord chart watermark.
 * Drop inside any chart container (must be position: relative) to brand it.
 * Bottom-right corner brand mark. Default 40px tall (2026-08-26 owner
 * directive): noticeable, but small enough not to spill into the plot
 * area when overlaid on a chart.
 */
const ChartLogo = ({ style = {} }) => (
  <img
    src={CHART_LOGO_PATH}
    alt="Petrolord"
    style={{ ...CHART_LOGO_STYLE, ...style }}
  />
);

export default ChartLogo;

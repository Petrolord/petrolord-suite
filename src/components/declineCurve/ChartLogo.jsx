import React from 'react';
import { CHART_LOGO_PATH, CHART_LOGO_STYLE } from '@/utils/chartTheme';

/**
 * Petrolord chart watermark.
 * Drop inside any chart container (must be position: relative) to brand it.
 * Subtle by design — 24px tall, 0.45 opacity, bottom-right corner.
 */
const ChartLogo = ({ style = {} }) => (
  <img
    src={CHART_LOGO_PATH}
    alt="Petrolord"
    style={{ ...CHART_LOGO_STYLE, ...style }}
  />
);

export default ChartLogo;

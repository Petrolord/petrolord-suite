import React from 'react';
import { CHART_LOGO_PATH, CHART_LOGO_STYLE } from '@/utils/chartTheme';

/**
 * Petrolord chart watermark.
 * Drop inside any chart container (must be position: relative) to brand it.
 * Bottom-right corner brand mark. Sized for visibility per the 2026-08-17
 * owner directive (default 180px tall, ~2.5x the previous size).
 */
const ChartLogo = ({ style = {} }) => (
  <img
    src={CHART_LOGO_PATH}
    alt="Petrolord"
    style={{ ...CHART_LOGO_STYLE, ...style }}
  />
);

export default ChartLogo;

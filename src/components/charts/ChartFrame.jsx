import React from 'react';
import { ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';

/**
 * Standard Petrolord chart frame.
 *
 * White chart surface with a reserved footer band for the ChartLogo watermark,
 * so the logo never overlaps the plot area or the X-axis annotations. Use this
 * to wrap any Recharts chart across the Suite instead of placing ChartLogo
 * directly over a ResponsiveContainer.
 *
 *   <ChartFrame height={260}>
 *     <LineChart data={...}> ... </LineChart>
 *   </ChartFrame>
 *
 * `height` is the plot height in px (ResponsiveContainer needs a fixed height
 * because the parent's height is content-driven). The logo sits in a ~48px band
 * below that, clear of the axis labels.
 */
const LOGO_BAND = 56; // px reserved below the plot for the watermark

const ChartFrame = ({ height = 260, className = '', children }) => (
  <div
    className={`relative bg-white rounded-b-lg ${className}`}
    style={{ paddingBottom: LOGO_BAND }}
  >
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
    <ChartLogo style={{ height: '36px', bottom: '14px', opacity: 0.55 }} />
  </div>
);

export default ChartFrame;

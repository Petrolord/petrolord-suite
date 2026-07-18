import React, { useId } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';

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
 *
 * Optional `exportFilename` (MB7, kit-level and backward compatible): when
 * set, a small download button in the top-right captures the frame (chart +
 * watermark) as a PNG named `<exportFilename>.png`, via the shared
 * exportChartAsImage helper (html2canvas) the DCA and MBAL plots use.
 */
const LOGO_BAND = 56; // px reserved below the plot for the watermark

const ChartFrame = ({ height = 260, className = '', exportFilename = null, children }) => {
  const frameId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const elementId = `chart-frame-${frameId}`;
  return (
    <div
      className={`relative bg-white rounded-b-lg ${className}`}
      style={{ paddingBottom: LOGO_BAND }}
      id={exportFilename ? elementId : undefined}
    >
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      <ChartLogo style={{ height: '36px', bottom: '14px', opacity: 0.55 }} />
      {exportFilename && (
        <button
          type="button"
          onClick={() => exportChartAsImage(elementId, exportFilename)}
          title="Download chart as PNG"
          aria-label="Download chart as PNG"
          className="absolute top-2 right-2 p-1.5 rounded border border-slate-200 bg-white/90 text-slate-500 hover:text-slate-800 hover:bg-white shadow-sm"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default ChartFrame;

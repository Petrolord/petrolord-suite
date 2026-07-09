// src/utils/chartTheme.js
// Petrolord Suite Chart Theme — white-background industry standard
// Use these constants across every chart in every app in the Suite

export const CHART_COLORS = {
  // Backgrounds
  background: '#ffffff',
  plotArea: '#ffffff',

  // Grid and axes
  grid: '#e2e8f0',          // slate-200
  axisLine: '#94a3b8',      // slate-400
  axisText: '#334155',      // slate-700
  axisLabel: '#0f172a',     // slate-900 (bold labels)

  // Tooltip
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1', // slate-300
  tooltipText: '#0f172a',   // slate-900

  // Legend
  legendText: '#334155',    // slate-700
};

// Stream-specific color palettes — chosen for distinguishability in both
// screen viewing and B&W printing. Each stream gets 3 roles:
// - primary: historical scatter points
// - fitted: fitted-model overlay line
// - forecast: forecast projection line
export const STREAM_PALETTES = {
  oil: {
    primary: '#059669',   // emerald-600 (darker for white bg legibility)
    fitted:  '#d97706',   // amber-600
    forecast:'#2563eb',   // blue-600
  },
  gas: {
    primary: '#d97706',   // amber-600
    fitted:  '#2563eb',   // blue-600
    forecast:'#db2777',   // pink-600
  },
  water: {
    primary: '#2563eb',   // blue-600
    fitted:  '#d97706',   // amber-600
    forecast:'#059669',   // emerald-600
  },
};

// Get stream-specific colors. Safe fallback to oil if stream unknown.
export const getStreamPalette = (stream) => {
  return STREAM_PALETTES[stream] || STREAM_PALETTES.oil;
};

// Standard chart typography
export const CHART_TYPOGRAPHY = {
  axisFontSize: 11,
  labelFontSize: 12,
  tooltipFontSize: 12,
  legendFontSize: 11,
  annotationFontSize: 10,
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
};

// Standard margins — use these on every ComposedChart / LineChart / BarChart
export const CHART_MARGINS = {
  standard:    { top: 20, right: 30, left: 20, bottom: 50 },
  compact:     { top: 10, right: 20, left: 10, bottom: 40 },
  withLegend:  { top: 20, right: 30, left: 20, bottom: 60 },
  // Pair with LEGEND_PROPS (and, for bottom-titled X-axes, XAXIS_LABEL_HEIGHT).
  // The legend reserves its own band via `height`, and the X-axis reserves its
  // ticks/title via `height`, so a small bottom margin is enough — the two never
  // collide. Prefer this over `withLegend` for any chart that shows a legend.
  legend:      { top: 20, right: 30, left: 20, bottom: 8 },
};

// Standard Legend props — reserve an explicit band at the bottom so the legend
// never overlaps the X-axis tick labels or axis title. Spread onto <Legend />.
export const LEGEND_PROPS = {
  verticalAlign: 'bottom',
  height: 36,
  wrapperStyle: {
    fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
    color: CHART_COLORS.legendText,
    paddingTop: 8,
  },
};

// X-axis `height` to use when the axis carries a title below its ticks, so the
// ticks and the title get dedicated room instead of colliding with the legend.
export const XAXIS_LABEL_HEIGHT = 46;

// Convenience: the full style bundle for Recharts CartesianGrid
export const GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: CHART_COLORS.grid,
};

// Convenience: tooltip content style
export const TOOLTIP_STYLE = {
  backgroundColor: CHART_COLORS.tooltipBg,
  borderColor: CHART_COLORS.tooltipBorder,
  borderRadius: '6px',
  fontSize: `${CHART_TYPOGRAPHY.tooltipFontSize}px`,
  color: CHART_COLORS.tooltipText,
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

// Annotation box style (for in-chart parameter displays)
export const ANNOTATION_BOX_CLASSNAME =
  'absolute top-2 right-2 bg-white/95 border border-slate-300 rounded px-2 py-1.5 ' +
  'text-[10px] text-slate-700 font-mono shadow-sm pointer-events-none';

// === Petrolord Chart Branding ===
// Path to the watermark logo. Vite serves /public assets at the root.
export const CHART_LOGO_PATH = '/petrolord-chart-watermark.png';

// Standard logo styling — used by ChartLogo component.
// Tuned for white-background charts. The logo is positioned absolutely
// so it must sit inside a relative-positioned container.
export const CHART_LOGO_STYLE = {
  position: 'absolute',
  bottom: '8px',
  right: '8px',
  height: '72px',
  width: 'auto',
  opacity: 0.50,
  pointerEvents: 'none',
  userSelect: 'none',
};

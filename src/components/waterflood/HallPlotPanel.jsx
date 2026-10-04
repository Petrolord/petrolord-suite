import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
  LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

const axisTick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = { fontSize: CHART_TYPOGRAPHY.labelFontSize, fill: CHART_COLORS.axisLabel };
// Dark-on-white, print-distinguishable series colors.
const COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v);

/**
 * The points of one injector's Hall plot, in the Hall (1963) convention
 * (H11): cumulative water injected on x (bbl), the cumulative pressure-time
 * integral on y (psi-day). The slope dy/dx is then p/q, the number the
 * engine reports as the Hall slope, and it rises when the well plugs. The
 * chart used to draw the two the other way round.
 */
export const hallPlotPoints = (d) => d.cum_injection.map((x, i) => ({ x, y: d.hall_integral[i] }));

export { hallWindowLines, hallSlopeText } from './hallLines';
import { hallWindowLines, hallSlopeText } from './hallLines';
import HallWindowEditor from './HallWindowEditor';

const HallPlotPanel = ({ data, alerts, u = null, pressureBasis = 'wellhead', choices = null, onChoose = null, canWrite = true }) => {
  const X = (v) => (u ? u.show('waterVolume', v) : v);
  const Y = (v) => (u ? u.show('hallIntegral', v) : v);
  const basisWord = pressureBasis === 'bottomhole' ? 'bottomhole' : 'wellhead';
  const [selectedInjectors, setSelectedInjectors] = useState(data.slice(0, 3).map((d) => d.injector));

  const handleInjectorToggle = (injector) => {
    setSelectedInjectors((prev) =>
      prev.includes(injector) ? prev.filter((i) => i !== injector) : [...prev, injector]
    );
  };

  // WF-U2-003: picking a window on the plot: the next two points clicked on
  // this injector's curve are the start and the end of the window
  const [pick, setPick] = useState(null); // { injector, key, from? }
  const [picked, setPicked] = useState({}); // injector -> { baseline?, recent? } from the plot
  const onPoint = (d, index) => {
    if (!pick || pick.injector !== d.injector) return;
    const date = String(d.dates?.[index] ?? '').slice(0, 10);
    if (!date) return;
    if (!pick.from) { setPick({ ...pick, from: date }); return; }
    const [from, to] = pick.from <= date ? [pick.from, date] : [date, pick.from];
    setPicked((prev) => ({ ...prev, [d.injector]: { ...(prev[d.injector] || {}), [pick.key]: { from, to } } }));
    setPick(null);
  };

  const injectivityIssues = alerts?.injectivity_issue || [];
  const selected = data.filter((d) => selectedInjectors.includes(d.injector));

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-1">Hall Plot Analysis</h2>
      <p className="text-pl-muted text-sm mb-4" data-testid="hall-caption">
        Hall (1963) plot: the Hall integral of the {basisWord} injection pressure (Σ&nbsp;p·Δt) on the vertical axis against cumulative water injected on the horizontal axis. The slope is p/q. A steepening curve signals declining injectivity (plugging, rising skin); a flattening curve signals improving injectivity (fracturing or channeling). The dashed lines are the least-squares fits over the first third (baseline) and the last third (recent) of the points, or over the windows you choose under the chart (by date or by clicking two points); their slopes, with 95 percent intervals, are listed under the chart.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1">
          <h3 className="font-semibold text-pl-text mb-2">Injectors</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {data.map((d) => (
              <div key={d.injector} className="flex items-center space-x-2 bg-pl-sunken p-2 rounded-md">
                <Checkbox
                  id={`check-${d.injector}`}
                  checked={selectedInjectors.includes(d.injector)}
                  onCheckedChange={() => handleInjectorToggle(d.injector)}
                />
                <Label htmlFor={`check-${d.injector}`} className="flex-grow">{d.injector}</Label>
                {injectivityIssues.some((issue) => issue.injector === d.injector) && (
                  <Badge variant="destructive">Injectivity</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
        <div data-canvas="chart" className="md:col-span-3 bg-white rounded-lg p-4">
          <ChartFrame height={360}>
            <ComposedChart margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="x" name="Cumulative water injected" height={XAXIS_LABEL_HEIGHT} tick={axisTick} stroke={CHART_COLORS.axisLine}
                tickFormatter={fmt}
                label={{ value: `Cumulative water injected (${u ? u.label('waterVolume') : 'bbl'})`, position: 'insideBottom', offset: -6, style: axisLabel }} />
              <YAxis type="number" dataKey="y" name="Hall integral" tick={axisTick} stroke={CHART_COLORS.axisLine}
                tickFormatter={fmt}
                label={{ value: `Hall integral, Σ p·Δt (${u ? u.label('hallIntegral') : 'psi.d'}, ${basisWord})`, angle: -90, position: 'insideLeft', style: axisLabel }} />
              <ZAxis range={[12, 12]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} cursor={{ strokeDasharray: '3 3' }} />
              <Legend {...LEGEND_PROPS} />
              {selected.flatMap((d, index) => hallWindowLines(d).map((w) => (
                <Line
                  key={`${d.injector}-${w.key}`}
                  data={w.points.map((p) => ({ x: X(p.x), y: Y(p.y) }))}
                  dataKey="y"
                  name={`${d.injector} ${w.key} fit`}
                  stroke={COLORS[index % COLORS.length]}
                  strokeDasharray={w.key === 'baseline' ? '6 4' : '2 3'}
                  strokeWidth={2}
                  dot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              )))}
              {selected.map((d, index) => (
                <Scatter
                  key={d.injector}
                  onClick={onChoose ? (_pt, i) => onPoint(d, i) : undefined}
                  cursor={pick?.injector === d.injector ? 'crosshair' : undefined}
                  name={`${d.injector} (recent slope ${hallSlopeText(d.slope_last, null, u)})`}
                  data={hallPlotPoints(d).map((p) => ({ x: X(p.x), y: Y(p.y) }))}
                  fill={COLORS[index % COLORS.length]}
                  line={{ stroke: COLORS[index % COLORS.length], strokeWidth: 2 }}
                  lineType="joint"
                  shape="circle"
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ChartFrame>
          <table className="w-full text-xs text-slate-700 mt-2" data-testid="hall-windows">
            <thead><tr className="text-slate-500"><th className="text-left">Injector</th><th className="text-left">Window</th><th className="text-left">Dates</th><th className="text-left">Points</th><th className="text-left">Slope</th><th className="text-left">r2</th></tr></thead>
            <tbody>
              {selected.flatMap((d) => hallWindowLines(d).map((w) => (
                <tr key={`${d.injector}-${w.key}`}>
                  <td>{d.injector}</td><td>{w.label}</td><td>{w.dateFrom || EMPTY_VALUE} to {w.dateTo || EMPTY_VALUE}</td><td>{w.n}</td>
                  <td>{hallSlopeText(w.slope, w.ci95, u)}</td><td>{Number.isFinite(w.r2) ? w.r2.toFixed(3) : EMPTY_VALUE}</td>
                </tr>
              )))}
            </tbody>
          </table>
          {onChoose && selected.map((d) => (
            <HallWindowEditor
              key={d.injector}
              plot={d}
              choice={choices?.[d.injector] || null}
              picked={picked[d.injector] || null}
              pick={pick?.injector === d.injector ? pick : null}
              onStartPick={(key) => setPick({ injector: d.injector, key })}
              onCancelPick={() => setPick(null)}
              onChoose={(choice) => { onChoose(d.injector, choice); setPicked((prev) => ({ ...prev, [d.injector]: null })); }}
              disabled={!canWrite}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default HallPlotPanel;

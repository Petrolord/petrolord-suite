// Breakeven distribution and sensitivity charts (Economics E1).
//
// These three panels were "Chart removed" placeholders: the app ran a
// Monte Carlo and then showed the user three empty boxes. They are real
// charts now, on the Suite chart standard (ChartFrame + chartTheme).
import React, { useMemo } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, Cell,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

const money = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');

/** Bin the sample into a histogram. Sturges is plenty at these counts. */
const histogram = (values) => {
  if (!values || values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!(max > min)) return [{ price: min, count: values.length }];
  const bins = Math.max(10, Math.min(40, Math.ceil(Math.log2(values.length) + 1)));
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  values.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx] += 1;
  });
  return counts.map((count, i) => ({
    price: min + width * (i + 0.5),
    count,
  }));
};

/** Thin the CDF so the chart draws a curve, not ten thousand points. */
const thinCdf = (cdfData) => {
  const xs = cdfData?.x || [];
  const ys = cdfData?.y || [];
  if (xs.length === 0) return [];
  const step = Math.max(1, Math.floor(xs.length / 300));
  const out = [];
  for (let i = 0; i < xs.length; i += step) out.push({ price: xs[i], p: ys[i] });
  if (out[out.length - 1]?.price !== xs[xs.length - 1]) {
    out.push({ price: xs[xs.length - 1], p: ys[ys.length - 1] });
  }
  return out;
};

const BreakevenPlots = ({ cdfData, histogramData, tornadoData, kpis }) => {
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const cdf = useMemo(() => thinCdf(cdfData), [cdfData]);
  const hist = useMemo(() => histogram(histogramData?.x), [histogramData]);

  // Both sides of every swing, drawn from the base case outward. Recharts
  // stacks from zero, so each bar is expressed as an offset pair.
  //
  // B1 (engines #182): an end with no breakeven below $500 comes back null
  // and its bar is flagged `unreachable`. It used to be drawn at 0 and sorted
  // last, so the uncertainty that can put the project out of reach looked
  // like the one that matters least. That side is left open and the bar
  // keeps the engine's order, which puts it first.
  const tornado = useMemo(() => {
    const names = tornadoData?.y || [];
    return names.map((name, i) => {
      const open = Boolean(tornadoData.unreachable?.[i]);
      const sides = [tornadoData.low?.[i], tornadoData.high?.[i]].filter((v) => Number.isFinite(v));
      const low = sides.length === 2 ? Math.min(...sides) : Math.min(0, ...sides);
      const high = sides.length === 2 ? Math.max(...sides) : Math.max(0, ...sides);
      return { name: open ? `${name} (open end)` : name, variable: name, open, low, high };
    });
  }, [tornadoData]);
  const openBars = tornado.filter((d) => d.open).map((d) => d.variable);

  return (
    <div className="bg-white/5 p-4 rounded-lg">
      <Tabs defaultValue="cdf" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-800">
          <TabsTrigger value="cdf">S-Curve (CDF)</TabsTrigger>
          <TabsTrigger value="histogram">Histogram</TabsTrigger>
          <TabsTrigger value="tornado">Tornado Chart</TabsTrigger>
        </TabsList>

        <TabsContent value="cdf">
          <ChartFrame height={400} exportFilename="breakeven-s-curve">
            <ComposedChart data={cdf} margin={{ top: 12, right: 30, bottom: 28, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number" dataKey="price" domain={['dataMin', 'dataMax']}
                stroke={CHART_COLORS.axisLine} tick={tick}
                tickFormatter={money}
                label={{
                  value: 'Breakeven oil price ($/bbl)', position: 'insideBottom', offset: -10,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                domain={[0, 1]} stroke={CHART_COLORS.axisLine} tick={tick}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                label={{
                  value: 'Cumulative probability', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v) => [`${(v * 100).toFixed(1)} %`, 'chance of breaking even below']}
                labelFormatter={(v) => `$${money(v)}/bbl`}
              />
              <Legend verticalAlign="top" />
              {Number.isFinite(kpis?.p50) && (
                <ReferenceLine
                  x={kpis.p50} stroke="#f59e0b" strokeDasharray="4 3"
                  label={{ value: `median $${money(kpis.p50)}`, fill: '#b45309', fontSize: 11, position: 'top' }}
                />
              )}
              <Line
                dataKey="p" name="Cumulative probability" stroke="#059669"
                strokeWidth={2} dot={false}
              />
            </ComposedChart>
          </ChartFrame>
          <p className="text-[12px] text-slate-500 mt-2">
            Read it as: the chance that the true breakeven price is below any given value. The
            steeper the curve, the tighter the answer.
          </p>
        </TabsContent>

        <TabsContent value="histogram">
          <ChartFrame height={400} exportFilename="breakeven-histogram">
            <ComposedChart data={hist} margin={{ top: 12, right: 30, bottom: 28, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number" dataKey="price" domain={['dataMin', 'dataMax']}
                stroke={CHART_COLORS.axisLine} tick={tick} tickFormatter={money}
                label={{
                  value: 'Breakeven oil price ($/bbl)', position: 'insideBottom', offset: -10,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                stroke={CHART_COLORS.axisLine} tick={tick}
                label={{
                  value: 'Iterations', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v) => [v, 'iterations']}
                labelFormatter={(v) => `around $${money(v)}/bbl`}
              />
              <Legend verticalAlign="top" />
              <Bar dataKey="count" name="Iterations" fill="#0ea5e9" />
            </ComposedChart>
          </ChartFrame>
        </TabsContent>

        <TabsContent value="tornado">
          <ChartFrame height={400} exportFilename="breakeven-tornado">
            <BarChart
              data={tornado} layout="vertical"
              stackOffset="sign"
              margin={{ top: 12, right: 40, bottom: 28, left: 150 }}
            >
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number" stroke={CHART_COLORS.axisLine} tick={tick}
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${money(v)}`}
                label={{
                  value: 'Change in breakeven price vs the base case ($/bbl)',
                  position: 'insideBottom', offset: -10,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                type="category" dataKey="name" width={145}
                stroke={CHART_COLORS.axisLine} tick={{ ...tick, fontSize: 11 }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v, name) => [`${v > 0 ? '+' : ''}$${money(v)}/bbl`, name]}
              />
              <Legend verticalAlign="top" />
              <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
              <Bar dataKey="low" name="Favourable end" stackId="swing" fill="#059669">
                {tornado.map((d) => <Cell key={`lo-${d.name}`} />)}
              </Bar>
              <Bar dataKey="high" name="Adverse end" stackId="swing" fill="#dc2626">
                {tornado.map((d) => <Cell key={`hi-${d.name}`} />)}
              </Bar>
            </BarChart>
          </ChartFrame>
          <p className="text-[12px] text-slate-500 mt-2">
            Both ends of each swing are drawn, measured from the deterministic base case. A bar
            that reaches further to the right is an uncertainty that can hurt the project more
            than the others.
          </p>
          {openBars.length > 0 && (
            <p className="text-[12px] text-amber-300 mt-1" data-testid="breakeven-open-bars">
              {openBars.join(' and ')} {openBars.length === 1 ? 'has' : 'have'} no breakeven below $500 a barrel
              at one end of {openBars.length === 1 ? 'its' : 'their'} range. That side is left open, and
              the bar is listed first because that end can put the project out of reach at any price.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BreakevenPlots;

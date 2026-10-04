import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';

// Shared Petrolord white-chart styling (see petrolord-chart-template-standard).
const axisTick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = { fontSize: CHART_TYPOGRAPHY.labelFontSize, fill: CHART_COLORS.axisLabel };
// Dark-on-white series colors (the old dark-bg strokes are illegible on white).
const C = { inj: '#2563eb', oil: '#059669', water: '#7c3aed', wc: '#d97706', daily: '#94a3b8', rolling: '#2563eb', cum: '#059669', ref: '#dc2626' };
// WF-U1 (RL7): a calendar axis (time in ms on a numeric axis) labelled with
// year and month; the old axis printed MM-DD with no year.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const calendarTick = (ms) => {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
};
const msOf = (date) => Date.parse(`${date}T00:00:00Z`);
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v);

const ChartsPanel = ({ dailySeries, vrrSeries, u = null }) => {
  const rate = (kind, v) => (u && Number.isFinite(v) ? u.show(kind, v) : v);
  const rateUnit = u ? `${u.label('oilRate')}, ${u.label('waterRate')}` : 'STB/d, bbl/d';
  const [showSmoothed, setShowSmoothed] = useState(true);

  const timeData = useMemo(() => (dailySeries?.date || []).map((date, i) => ({
    t: msOf(date),
    inj: rate('waterRate', (showSmoothed ? dailySeries.inj_bpd_s : dailySeries.inj_bpd)[i]),
    oil: rate('oilRate', (showSmoothed ? dailySeries.oil_bpd_s : dailySeries.oil_bpd)[i]),
    water: rate('waterRate', (showSmoothed ? dailySeries.water_bpd_s : dailySeries.water_bpd)[i]),
    wc: (showSmoothed ? dailySeries.wc_pct_s : dailySeries.wc_pct)[i],
  })), [dailySeries, showSmoothed, u]); // eslint-disable-line react-hooks/exhaustive-deps

  const vrrData = useMemo(() => (vrrSeries?.date || []).map((date, i) => ({
    t: msOf(date),
    daily: vrrSeries.vrr_daily[i],
    rolling: vrrSeries.vrr_rolling[i],
    cum: vrrSeries.vrr_cum ? vrrSeries.vrr_cum[i] : undefined,
  })), [vrrSeries]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-6">Performance Trends</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div data-canvas="chart" className="bg-white rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-base font-semibold text-slate-800">Rates &amp; Water Cut</h3>
            <div className="flex items-center space-x-2">
              <Checkbox id="smooth-toggle" checked={showSmoothed} onCheckedChange={setShowSmoothed} />
              <Label htmlFor="smooth-toggle" className="text-sm text-pl-muted">Smoothed</Label>
            </div>
          </div>
          <ChartFrame height={320}>
            <ComposedChart data={timeData} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={axisTick} tickFormatter={calendarTick} minTickGap={48} stroke={CHART_COLORS.axisLine} />
              <YAxis yAxisId="left" tick={axisTick} stroke={CHART_COLORS.axisLine}
                label={{ value: `Rate (${rateUnit})`, angle: -90, position: 'insideLeft', style: axisLabel }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={axisTick} stroke={CHART_COLORS.axisLine}
                label={{ value: 'Water Cut (%)', angle: 90, position: 'insideRight', style: axisLabel }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} labelFormatter={calendarTick} />
              <Legend {...LEGEND_PROPS} />
              <Line yAxisId="left" type="monotone" dataKey="inj" name={`Water injected (${u ? u.label('waterRate') : 'bbl/d'})`} stroke={C.inj} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="oil" name={`Oil (${u ? u.label('oilRate') : 'STB/d'})`} stroke={C.oil} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="water" name={`Water produced (${u ? u.label('waterRate') : 'bbl/d'})`} stroke={C.water} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="wc" name="Water Cut (%)" stroke={C.wc} dot={false} strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false} />
            </ComposedChart>
          </ChartFrame>
        </div>

        <div data-canvas="chart" className="bg-white rounded-lg p-4">
          <h3 className="text-base font-semibold text-slate-800 mb-2">Voidage Replacement Ratio (VRR)</h3>
          <ChartFrame height={320}>
            <LineChart data={vrrData} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={axisTick} tickFormatter={calendarTick} minTickGap={48} stroke={CHART_COLORS.axisLine} />
              <YAxis tick={axisTick} stroke={CHART_COLORS.axisLine}
                label={{ value: 'VRR (reservoir bbl)', angle: -90, position: 'insideLeft', style: axisLabel }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} labelFormatter={calendarTick} />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={1} stroke={C.ref} strokeDasharray="5 3"
                label={{ value: 'Balance', fill: C.ref, fontSize: 10, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="daily" name="Daily VRR" stroke={C.daily} dot={false} strokeWidth={1} isAnimationActive={false} />
              <Line type="monotone" dataKey="rolling" name="Rolling VRR" stroke={C.rolling} dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line type="monotone" dataKey="cum" name="Cumulative VRR" stroke={C.cum} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </div>
      </div>
    </motion.div>
  );
};

export default ChartsPanel;

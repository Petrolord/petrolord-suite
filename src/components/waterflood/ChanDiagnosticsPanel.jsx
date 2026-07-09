import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
  LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

const axisTick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = { fontSize: CHART_TYPOGRAPHY.labelFontSize, fill: CHART_COLORS.axisLabel };
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : v);

// Tone per Chan mechanism classification.
const TONE = {
  channeling: 'bg-red-500/10 border-red-500/30 text-red-200',
  coning: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
  transitional: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  indeterminate: 'bg-slate-500/10 border-slate-500/30 text-slate-300',
};

const ChanDiagnosticsPanel = ({ chan }) => {
  const options = useMemo(() => {
    const opts = [];
    if (chan?.field) opts.push(chan.field);
    (chan?.producers || []).forEach((p) => opts.push(p));
    return opts;
  }, [chan]);

  const [selectedKey, setSelectedKey] = useState(options[0]?.producer);
  const selected = options.find((o) => o.producer === selectedKey) || options[0];

  const data = useMemo(() => (selected?.points || []).map((p) => ({
    t: p.t,
    wor: p.wor > 0 ? p.wor : null,
    // WOR' is only plottable on a log axis where positive; negative/zero
    // (a declining WOR, itself a coning signature) breaks the line.
    worDeriv: p.worDeriv > 0 ? p.worDeriv : null,
  })), [selected]);

  if (!selected) return null;
  const cls = selected.classification || { code: 'indeterminate', label: '' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
    >
      <h2 className="text-2xl font-bold text-white mb-1">Chan Water-Control Diagnostics</h2>
      <p className="text-cyan-200/80 text-sm mb-4">
        Log–log water–oil ratio (WOR) and its time derivative WOR′ vs time. The shape of WOR′ indicates the excess-water mechanism.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {options.map((o) => (
          <Button
            key={o.producer}
            size="sm"
            variant={o.producer === selected.producer ? 'default' : 'outline'}
            className={o.producer === selected.producer ? 'bg-lime-600 hover:bg-lime-700' : 'border-white/20 text-cyan-100'}
            onClick={() => setSelectedKey(o.producer)}
          >
            {o.producer}
          </Button>
        ))}
      </div>

      <div className="bg-white rounded-lg p-4">
        <ChartFrame height={340}>
          <LineChart data={data} margin={CHART_MARGINS.legend}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              type="number" dataKey="t" scale="log" domain={['auto', 'auto']} allowDataOverflow
              height={XAXIS_LABEL_HEIGHT}
              tick={axisTick} stroke={CHART_COLORS.axisLine} tickFormatter={fmt}
              label={{ value: 'Time since water onset (days)', position: 'insideBottom', offset: -6, style: axisLabel }}
            />
            <YAxis
              scale="log" domain={['auto', 'auto']} allowDataOverflow
              tick={axisTick} stroke={CHART_COLORS.axisLine} tickFormatter={fmt}
              label={{ value: 'WOR  &  WOR′', angle: -90, position: 'insideLeft', style: axisLabel }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} labelFormatter={(l) => `t = ${fmt(l)} d`} />
            <Legend {...LEGEND_PROPS} />
            <Line type="monotone" dataKey="wor" name="WOR" stroke="#2563eb" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="worDeriv" name="WOR′ (d WOR/dt)" stroke="#d97706" dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
          </LineChart>
        </ChartFrame>
      </div>

      <div className={`mt-4 rounded-lg border p-4 ${TONE[cls.code] || TONE.indeterminate}`}>
        <p className="font-semibold">
          {selected.producer}: {cls.label}
        </p>
        <p className="text-sm opacity-80 mt-1">
          Late-time WOR′ log–log slope ={' '}
          <span className="font-mono">{selected.lateSlope != null ? selected.lateSlope.toFixed(2) : 'n/a'}</span>
          {' '}(≥ 0.4 channeling-like, ≤ 0 coning/normal-like). This is an indicative reading of the
          derivative trend — confirm the mechanism with completion, geology and pressure data.
        </p>
      </div>
    </motion.div>
  );
};

export default ChanDiagnosticsPanel;

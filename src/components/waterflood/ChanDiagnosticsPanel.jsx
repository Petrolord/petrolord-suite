import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { engineChanWindow, chanChoiceProblems, chanKeyOf, chanWindowText } from '@/utils/waterflooddesign/chanWindows';
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
  channeling: 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text',
  coning: 'bg-pl-info-bg border-pl-info/40 text-pl-info-text',
  transitional: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
  indeterminate: 'bg-pl-sunken border-pl-border text-pl-text',
};

// WF-U2-006: the late-time window, its slope with the 95 percent interval,
// and a window chosen by the user in days since water onset, with a reason
function ChanWindowEditor({ series, choice, onChoose, disabled }) {
  const key = chanKeyOf(series);
  const [from, setFrom] = React.useState(choice?.from != null ? String(choice.from) : '');
  const [to, setTo] = React.useState(choice?.to != null ? String(choice.to) : '');
  const [reason, setReason] = React.useState(choice?.reason || '');
  React.useEffect(() => { setFrom(choice?.from != null ? String(choice.from) : ''); setTo(choice?.to != null ? String(choice.to) : ''); setReason(choice?.reason || ''); }, [choice, key]);
  const draft = { from: from === '' ? NaN : Number(from), to: to === '' ? NaN : Number(to), reason };
  const problems = chanChoiceProblems(series, draft);
  return (
    <div className="mt-3 rounded border border-pl-border p-3 text-xs space-y-2" data-testid={`chan-editor-${key}`}>
      <p className="font-semibold text-pl-text">Choose the late-time window of {series.producer} (days since water onset)</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor={`chan-${key}-from`} className="text-[10px] text-pl-muted">From day</Label>
          <Input id={`chan-${key}-from`} className="h-7 text-xs w-24" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} disabled={disabled} data-testid={`chan-${key}-from`} /></div>
        <div><Label htmlFor={`chan-${key}-to`} className="text-[10px] text-pl-muted">To day</Label>
          <Input id={`chan-${key}-to`} className="h-7 text-xs w-24" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} disabled={disabled} data-testid={`chan-${key}-to`} /></div>
        <div className="flex-1 min-w-[12rem]"><Label htmlFor={`chan-${key}-reason`} className="text-[10px] text-pl-muted">Why this window (printed with it)</Label>
          <Input id={`chan-${key}-reason`} className="h-7 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} disabled={disabled} data-testid={`chan-${key}-reason`} /></div>
      </div>
      {problems.length > 0 && (from || to || reason) && <p className="text-pl-warning-text" data-testid={`chan-${key}-problems`}>{problems.join(' ')}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-[11px]" disabled={disabled || problems.length > 0} onClick={() => onChoose(key, { from: draft.from, to: draft.to, reason: reason.trim(), setAt: new Date().toISOString() })} data-testid={`chan-${key}-apply`}>Use this window</Button>
        {choice && <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled} onClick={() => onChoose(key, null)} data-testid={`chan-${key}-clear`}>Back to the last 40 percent</Button>}
      </div>
    </div>
  );
}

const ChanDiagnosticsPanel = ({ chan, choices = null, onChoose = null, canWrite = true }) => {
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
  const win = selected.window || engineChanWindow(selected.points);
  const ci = win.ci95 && win.ci95.every(Number.isFinite) ? ` (95% ${win.ci95[0].toFixed(2)} to ${win.ci95[1].toFixed(2)})` : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-pl-surface border border-pl-border rounded-xl p-6 shadow-pl-sm"
    >
      <h2 className="text-2xl font-bold text-pl-text mb-1">Chan Water-Control Diagnostics</h2>
      <p className="text-pl-muted text-sm mb-4">
        Log–log water–oil ratio (WOR) and its time derivative WOR′ vs time. The shape of WOR′ indicates the excess-water mechanism.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {options.map((o) => (
          <Button
            key={o.producer}
            size="sm"
            variant={o.producer === selected.producer ? 'default' : 'outline'}
            aria-pressed={o.producer === selected.producer}
            onClick={() => setSelectedKey(o.producer)}
          >
            {o.producer}
          </Button>
        ))}
      </div>

      <div data-canvas="chart" className="bg-white rounded-lg p-4">
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
            {Number.isFinite(win.tFrom) && Number.isFinite(win.tTo) && win.tTo > win.tFrom && (
              <ReferenceArea x1={win.tFrom} x2={win.tTo} fill="#94a3b8" fillOpacity={0.15} ifOverflow="hidden" />
            )}
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
          <span className="font-pl-mono tabular-nums" data-testid="chan-slope">{selected.lateSlope != null ? `${selected.lateSlope.toFixed(2)}${ci}` : 'n/a'}</span>
          {' '}(≥ 0.4 channeling-like, ≤ 0 coning/normal-like). This is an indicative reading of the
          derivative trend. Confirm the mechanism with completion, geology and pressure data.
        </p>
        <p className="text-sm opacity-80 mt-1" data-testid="chan-window">Window (shaded): {chanWindowText(win)}, {win.n} points with a rising WOR′.</p>
      </div>
      {onChoose && <ChanWindowEditor series={selected} choice={choices?.[chanKeyOf(selected)] || null} onChoose={onChoose} disabled={!canWrite} />}
    </motion.div>
  );
};

export default ChanDiagnosticsPanel;

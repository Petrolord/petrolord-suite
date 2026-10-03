// Material Balance Studio: the Plots tab.
//
// Rewritten in the Material Balance round of the app upgrade programme
// (MBAL-U1). The tab draws the plot models of lib/plotModels.js, the same
// models the PDF report draws, so a point, a label and a unit on this tab
// are the ones on the page (reviewer lens RL12). It reads the run the studio
// context holds; it used to fetch the last run by itself, apart from the
// Run and Report tabs.
//
// What changed for the reader:
//  - the regression plot is drawn in the space the engine regressed in (F
//    against Et, F - We against Et, or the pot aquifer plot) with the
//    engine's own line. The old plot drew that line on F against Et whatever
//    the run was, which is the right line only when there is no aquifer;
//  - the units follow the display units, and a gas case is labelled per scf
//    (the old axis said RB/Mscf beside values that were RB/scf);
//  - the numbers sit above the plot, where they used to cover the last points;
//  - a plot that does not apply to the case says why.
//
// House chart standard: white chart surface whatever the page theme,
// chartTheme tokens, the Petrolord mark bottom right.
import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Scatter, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info, FlaskConical, Download, X } from 'lucide-react';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import { dateTicks, dateTickText, niceTicks } from '@/lib/reportKit/plot.js';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { PLOT_COLOURS, hex } from '@/pages/apps/reservoir-balance/lib/plotModels';
import { POINT_STATUS } from '@/pages/apps/reservoir-balance/lib/mbalSeries';
import { fmt, sigFmt } from '@/pages/apps/reservoir-balance/lib/reportModel';
import { EMPTY_VALUE } from '@/lib/emptyValue';

// MBAL charts overlay the mark on the plot area, so it stays small here.
const MBAL_LOGO_STYLE = { height: '40px' };
const MARGIN = { top: 16, right: 28, left: 28, bottom: 40 };

const sanitizeFilename = (s) => (s ?? 'mbal').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

/** An axis tick as a person writes it: no "2e7", no trailing zeros. */
const tick = (v) => {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a < 1e-3) return v.toExponential(1);
  return String(parseFloat(v.toPrecision(4)));
};

const axisTick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const axisLine = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

/** A hollow square for a point the fit did not use. */
const SquareShape = ({ cx, cy, fill }) => (
  Number.isFinite(cx) && Number.isFinite(cy)
    ? <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#ffffff" stroke={fill} strokeWidth={1.8} />
    : null
);

const DetailRow = ({ label, value, unit }) => (
  <div className="flex justify-between items-baseline gap-2 text-[11px]">
    <span className="text-pl-muted">{label}</span>
    <span className="font-mono text-pl-text">
      {value}
      {unit ? <span className="text-[10px] text-pl-muted ml-1">{unit}</span> : null}
    </span>
  </div>
);

/** The values of one timestep, in the display units, under the plot that was clicked. */
const TimestepDetail = ({ row, status, isGas, units, onClose }) => {
  if (!row) return null;
  const u = units;
  const dig = u.unit('pressure') === 'psi' ? 1 : (u.unit('pressure') === 'kPa' ? 0 : 3);
  const vol = (q, v) => { const s = u.scaled(q, v ?? 0); return [Number.isFinite(v) ? fmt(s.to(v), 3) : EMPTY_VALUE, s.label]; };
  const [np, npU] = vol('stockVolume', row.cum_oil_stb);
  const [gp, gpU] = vol('gasVolume', row.cum_gas_scf);
  const [wp, wpU] = vol('stockVolume', row.cum_water_stb);
  const [f, fU] = vol('resVolume', row.F);
  const [we, weU] = vol('resVolume', row.We);
  const eQ = isGas ? 'expansionGas' : 'fvfOil';
  return (
    <div className="border-t border-pl-border bg-pl-sunken px-4 py-3" data-testid="mbal-timestep-detail">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Info className="w-3.5 h-3.5 text-pl-info-text" />
          <span className="text-xs font-semibold text-pl-text">
            Timestep {row.timestep_index}{row.date ? `, ${String(row.date).slice(0, 10)}` : ''}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pl-surface border border-pl-border text-pl-muted">{status}</span>
        </div>
        <Button onClick={onClose} variant="ghost" size="sm" className="h-6 w-6 p-0 text-pl-muted hover:text-pl-text" aria-label="Close the timestep detail">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="space-y-1">
          <DetailRow label="Pressure" value={fmt(u.to('pressure', row.pressure), dig)} unit={u.label('pressure')} />
          <DetailRow label="Pressure drop from initial" value={fmt(u.to('dp', row.delta_p), dig)} unit={u.label('dp')} />
          {isGas && <DetailRow label="p/z" value={fmt(u.to('pressure', row.p_over_z), dig)} unit={u.label('pressure')} />}
          {!isGas && <DetailRow label="Cumulative oil Np" value={np} unit={npU} />}
          <DetailRow label="Cumulative gas Gp" value={gp} unit={gpU} />
          <DetailRow label="Cumulative water Wp" value={wp} unit={wpU} />
        </div>
        <div className="space-y-1">
          <DetailRow label="Withdrawal F" value={f} unit={fU} />
          <DetailRow label="Total expansion Et" value={sigFmt(u.to(eQ, row.Et), 4)} unit={u.label(eQ)} />
          {!isGas && <DetailRow label="Oil expansion Eo" value={sigFmt(u.to(eQ, row.Eo), 4)} unit={u.label(eQ)} />}
          <DetailRow label="Rock and water expansion Efw" value={sigFmt(u.to(eQ, row.Efw), 4)} unit={u.label(eQ)} />
          <DetailRow label="Water influx We" value={we} unit={weU} />
          <DetailRow label="Drive index sum" value={fmt(row.drive_index_sum, 3)} unit="" />
        </div>
      </div>
    </div>
  );
};

/** One plot model as a card: Recharts on the white chart surface. */
const PlotCard = ({ model, caseName, onPick, picked, detail }) => {
  const elementId = `rb-plot-${model.id}`;
  const bars = model.series.filter((s) => s.type === 'bar');
  const isBar = bars.length > 0;
  const colour = (key) => hex(PLOT_COLOURS[key] ?? PLOT_COLOURS.fit);

  // Bars share one category axis: one row per timestep with a value per drive.
  const barData = useMemo(() => {
    if (!isBar) return [];
    const first = bars[0];
    return first.pts.map(([x], i) => {
      const row = { label: model.xDate ? dateTickText(x, 'month') : String(x), timestep_index: first.steps?.[i] };
      for (const s of bars) row[s.key] = s.pts[i]?.[1] ?? 0;
      return row;
    });
  }, [isBar, bars, model.xDate]);

  // A calendar axis takes the ticks the report uses.
  const xValues = model.series.flatMap((s) => s.pts.map((p) => p[0]));
  const dates = !isBar && model.xDate && xValues.length ? dateTicks(Math.min(...xValues), Math.max(...xValues)) : null;

  // Round axis ends and ticks, the ones the report prints.
  const finiteOnly = (list) => list.filter((v) => Number.isFinite(v));
  const yAll = finiteOnly([
    ...model.series.flatMap((s) => s.pts.map((p) => p[1])), ...(model.yInclude ?? []), ...model.lines.map((l) => l.y),
  ]);
  const yTicks = !isBar && yAll.length ? niceTicks(Math.min(...yAll), Math.max(...yAll), 6) : null;
  const xAll = finiteOnly([...xValues, ...model.lines.map((l) => l.x), 0]);
  const xTicks = !isBar && !dates && xAll.length ? niceTicks(Math.min(...xAll), Math.max(...xAll), 6) : null;

  const counts = Object.fromEntries(model.series.map((s) => [`data-points-${s.key.toLowerCase()}`, s.pts.length]));
  const click = (s) => (e) => {
    const step = e?.timestep_index ?? e?.payload?.timestep_index;
    if (step != null) onPick(model.id, step);
    void s;
  };

  return (
    <Card data-canvas="chart" className="bg-pl-chart-surface" data-testid={`mbal-plot-${model.id}`} {...counts}>
      <CardHeader className="pb-2 border-b border-pl-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-pl-text flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-pl-muted shrink-0" />
              <span>{model.title}</span>
            </CardTitle>
            <CardDescription className="text-xs text-pl-muted">{model.caption}</CardDescription>
          </div>
          <Button onClick={() => exportChartAsImage(elementId, `${sanitizeFilename(caseName)}_${model.id}`)} variant="ghost" size="sm"
            className="h-7 px-2 text-xs text-pl-muted hover:text-pl-text hover:bg-pl-sunken shrink-0" title="Export this plot as PNG">
            <Download className="h-3.5 w-3.5 mr-1" />
            Export
          </Button>
        </div>
        {model.notes?.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] font-mono text-pl-text" data-testid={`mbal-plot-notes-${model.id}`}>
            {model.notes.map((n) => <span key={n}>{n}</span>)}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[360px] bg-white" id={elementId}>
          <ResponsiveContainer width="100%" height="100%">
            {isBar ? (
              <ComposedChart data={barData} margin={MARGIN}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" type="category" tick={axisTick} axisLine={axisLine} tickLine={axisLine}
                  label={{ value: model.xTitle, position: 'insideBottom', offset: -22, style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                <YAxis type="number" domain={[(min) => Math.min(0, Math.floor(min * 10) / 10), (max) => Math.max(1, Math.ceil(max * 10) / 10)]} tickFormatter={tick} tick={axisTick} axisLine={axisLine} tickLine={axisLine}
                  label={{ value: model.yTitle, angle: -90, position: 'insideLeft', offset: -12, style: { textAnchor: 'middle', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(value, name) => [typeof value === 'number' ? value.toFixed(3) : value, name]} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText }} />
                {model.lines.filter((l) => Number.isFinite(l.y)).map((l) => (
                  <ReferenceLine key={l.label} y={l.y} stroke={colour(l.colour)} strokeDasharray="4 2"
                    label={{ value: l.label, position: 'insideTopRight', fill: colour(l.colour), fontSize: 10 }} />
                ))}
                {bars.map((s) => (
                  <Bar key={s.key} dataKey={s.key} stackId="drive" name={s.name} fill={colour(s.colour)} onClick={click(s)} cursor="pointer" isAnimationActive={false} />
                ))}
              </ComposedChart>
            ) : (
              <ComposedChart margin={MARGIN}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="x" type="number" tick={axisTick} axisLine={axisLine} tickLine={axisLine} allowDuplicatedCategory={false}
                  domain={dates ? [dates.ticks[0], dates.ticks[dates.ticks.length - 1]] : (xTicks ? [xTicks[0], xTicks[xTicks.length - 1]] : [0, 'auto'])}
                  ticks={dates ? dates.ticks : (xTicks ?? undefined)}
                  tickFormatter={dates ? (v) => dateTickText(v, dates.unit) : tick}
                  label={{ value: model.xTitle, position: 'insideBottom', offset: -22, style: { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                <YAxis dataKey="y" type="number" tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={tick}
                  domain={yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : ['auto', 'auto']}
                  ticks={yTicks ?? undefined}
                  label={{ value: model.yTitle, angle: -90, position: 'insideLeft', offset: -12, style: { textAnchor: 'middle', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize } }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(value, name) => [typeof value === 'number' ? (dates && name === 'x' ? dateTickText(value, 'day') : tick(value)) : value, name === 'x' ? model.xTitle : (name === 'y' ? model.yTitle : name)]}
                  labelFormatter={() => ''} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText }} />
                {model.lines.filter((l) => Number.isFinite(l.y)).map((l) => (
                  <ReferenceLine key={l.label} y={l.y} stroke={colour(l.colour)} strokeDasharray="4 2"
                    label={{ value: l.label, position: 'insideBottomRight', fill: colour(l.colour), fontSize: 10 }} />
                ))}
                {model.lines.filter((l) => Number.isFinite(l.x)).map((l) => (
                  <ReferenceLine key={l.label} x={l.x} stroke={colour(l.colour)} strokeDasharray="4 2"
                    label={{ value: l.label, position: 'insideTopLeft', fill: colour(l.colour), fontSize: 10 }} />
                ))}
                {model.series.filter((s) => s.pts.length).map((s) => {
                  const data = s.pts.map(([x, y], i) => ({ x, y, timestep_index: s.steps?.[i] }));
                  if (s.type === 'scatter') {
                    return (
                      <Scatter key={s.key} data={data} name={s.name} fill={colour(s.colour)} isAnimationActive={false}
                        shape={s.marker === 'square' ? <SquareShape /> : 'circle'} legendType={s.marker === 'square' ? 'square' : 'circle'}
                        onClick={s.steps ? click(s) : undefined} cursor={s.steps ? 'pointer' : undefined} />
                    );
                  }
                  return (
                    <Line key={s.key} data={data} dataKey="y" name={s.name} type="linear" stroke={colour(s.colour)} strokeWidth={2}
                      strokeDasharray={s.dash ? '5 4' : undefined} dot={s.type === 'both' ? { r: 2.5, fill: colour(s.colour) } : false}
                      legendType="line" isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            )}
          </ResponsiveContainer>
          <ChartLogo style={MBAL_LOGO_STYLE} />
        </div>
        {picked ? detail : null}
      </CardContent>
    </Card>
  );
};

const RbDiagnosticPlots = () => {
  const {
    caseData, lastResult, series, plotModels, units,
  } = useMaterialBalanceStudio();
  const [picked, setPicked] = useState(null); // { plot, step }
  const isGas = caseData?.fluid_system === 'gas';
  const caseName = caseData?.name ?? 'mbal';

  if (!caseData) {
    return (
      <Card><CardContent className="py-12 text-center text-pl-muted">Open a case to see its plots.</CardContent></Card>
    );
  }
  if (!lastResult) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Info className="w-10 h-10 mx-auto text-pl-muted mb-3" />
          <p className="text-pl-text font-medium">No result yet</p>
          <p className="text-sm text-pl-muted mt-1">Run the engine on the Run tab. The plots of the run appear here.</p>
        </CardContent>
      </Card>
    );
  }
  if (!series || series.rows.length < 2) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Info className="w-10 h-10 mx-auto text-pl-warning-text mb-3" />
          <p className="text-pl-text font-medium">Too little data to plot</p>
          <p className="text-sm text-pl-muted mt-1">The last run holds fewer than two timesteps. Add observations on the Data tab and run again.</p>
        </CardContent>
      </Card>
    );
  }

  const shown = plotModels.filter((m) => m.applies);
  const notShown = plotModels.filter((m) => !m.applies);
  const statusBy = plotModels.find((m) => m.id === 'regression')?.detail?.statusBy ?? {};
  const pick = (plot, step) => setPicked((cur) => (cur && cur.plot === plot && cur.step === step ? null : { plot, step }));
  const pickedRow = picked ? series.rows.find((r) => r.timestep_index === picked.step) : null;

  return (
    <div className="space-y-4" data-testid="mbal-plots">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostic Plots</CardTitle>
          <CardDescription>
            The plots of the last run, as the report prints them. Filled circles are the points the fit used and hollow squares are the points it did not use. Click a point or a bar to read that timestep.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {shown.map((m) => (
          <PlotCard key={m.id} model={m} caseName={caseName} onPick={pick} picked={picked?.plot === m.id}
            detail={(
              <TimestepDetail row={pickedRow} status={statusBy[picked?.step] ?? POINT_STATUS.fit} isGas={isGas} units={units} onClose={() => setPicked(null)} />
            )} />
        ))}
      </div>
      {notShown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plots that do not apply to this case</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {notShown.map((m) => (
              <p key={m.id} className="text-xs text-pl-muted" data-testid={`mbal-plot-na-${m.id}`}>
                <span className="font-medium text-pl-text">{m.title}.</span> {m.statement}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RbDiagnosticPlots;

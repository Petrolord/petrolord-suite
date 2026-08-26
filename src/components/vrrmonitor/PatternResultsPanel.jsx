// Pattern rollup + per-pattern VRR + injection recommendations (V4, main
// area of the Patterns tab). Every pattern is either a real analysis or a
// withheld card with its reason.
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ChartFrame from '@/components/charts/ChartFrame';
import GatedNotice from '@/components/vrrmonitor/GatedNotice';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const LINE = { inst: '#2563eb', cum: '#059669', ref: '#dc2626' };

const fmt = (v, d = 2) =>
  v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const FLAG_STYLE = {
  under: 'text-amber-400',
  'in-band': 'text-emerald-400',
  over: 'text-sky-400',
};

const PatternCard = ({ analysis, targetBand }) => {
  const { pattern } = analysis;
  if (analysis.withheld) {
    return (
      <GatedNotice
        title={`Pattern "${pattern.name}"`}
        reason={analysis.reason}
      />
    );
  }
  const { series, summary, recommendation, flags } = analysis;
  const chartData = series
    .filter((r) => r.producedVoidage > 0)
    .map((r) => ({
      label: r.label,
      instantaneous: r.instantaneousVRR != null ? Number(r.instantaneousVRR.toFixed(3)) : null,
      cumulative: r.cumulativeVRR != null ? Number(r.cumulativeVRR.toFixed(3)) : null,
    }));
  const latestFlag = [...flags].reverse().find((f) => f != null);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-3 flex-wrap">
          {pattern.name}
          <span className="text-xs font-normal text-slate-500">
            {pattern.producers.join(', ')} · cum VRR {fmt(summary?.cumulativeVRR)}
          </span>
          {latestFlag && (
            <span className={`text-xs font-normal ${FLAG_STYLE[latestFlag]}`}>
              latest period {latestFlag === 'in-band' ? 'in band' : latestFlag} vs {targetBand.min.toFixed(2)}–{targetBand.max.toFixed(2)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={220} exportFilename={`vrr-pattern-${pattern.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 'auto']} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <ReferenceLine y={1} stroke={LINE.ref} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="instantaneous" name="Instantaneous" stroke={LINE.inst} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={LINE.cum} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ChartFrame>
        <div className="p-4 pt-2">
          {recommendation.withheld ? (
            <p className="text-xs text-slate-500">{recommendation.reason}</p>
          ) : (
            <div className="text-xs text-slate-400 space-y-1">
              <div>
                Rolling VRR {fmt(recommendation.currentVRR)} vs target {fmt(recommendation.targetVRR)} →
                scale water injection ×{fmt(recommendation.scale)}
                {recommendation.clamped && <span className="text-amber-400"> (clamped — the unclamped step was implausible; re-check allocation and PVT first)</span>}
                : {fmt(recommendation.currentWi, 0)} → <span className="text-slate-200 font-semibold">{fmt(recommendation.recommendedWi, 0)} bbl/period</span>
              </div>
              {recommendation.perInjector.map((r) => (
                <div key={r.well} className="font-mono">
                  {r.well}: {fmt(r.currentWi, 0)} → {fmt(r.recommendedWi, 0)} bbl/period ({r.deltaWi >= 0 ? '+' : ''}{fmt(r.deltaWi, 0)})
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const PatternResultsPanel = () => {
  const { isImported, inputs, patternAnalyses, summary, targetBand } = useVrrMonitor();

  if (!isImported) {
    return (
      <GatedNotice
        title="Pattern analysis"
        reason="Patterns work on an imported per-well ledger, so there are wells to allocate between."
        hint="Import well data (or load Sample wells) on the Data tab, then define patterns here."
      />
    );
  }
  if (!inputs.patterns.length) {
    return (
      <GatedNotice
        title="Pattern analysis"
        reason="No patterns defined yet."
        hint="Create a pattern in the left rail, assign its producers, then fill the allocation matrix below."
      />
    );
  }

  return (
    <>
      {/* Field / pattern rollup */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-base">Rollup</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">Level</TableHead>
                <TableHead className="text-slate-400 text-right">Cum. VRR</TableHead>
                <TableHead className="text-slate-400 text-right">Latest Inst.</TableHead>
                <TableHead className="text-slate-400 text-right">Producers</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-slate-800">
                <TableCell className="text-slate-200 font-semibold">Field</TableCell>
                <TableCell className="text-right font-mono text-slate-200">{fmt(summary?.cumulativeVRR)}</TableCell>
                <TableCell className="text-right font-mono text-slate-300">{fmt(summary?.latestInstantaneousVRR)}</TableCell>
                <TableCell className="text-right font-mono text-slate-500">all</TableCell>
                <TableCell className="text-xs text-slate-500">{summary?.status?.label}</TableCell>
              </TableRow>
              {patternAnalyses.map((a) => (
                <TableRow key={a.pattern.id} className="border-slate-800">
                  <TableCell className="text-slate-300">{a.pattern.name}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{a.withheld ? '—' : fmt(a.summary?.cumulativeVRR)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-400">{a.withheld ? '—' : fmt(a.summary?.latestInstantaneousVRR)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-500">{a.pattern.producers.length}</TableCell>
                  <TableCell className="text-xs text-slate-500">{a.withheld ? a.reason : a.summary?.status?.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {patternAnalyses.map((a) => (
        <PatternCard key={a.pattern.id} analysis={a} targetBand={targetBand} />
      ))}
    </>
  );
};

export default PatternResultsPanel;

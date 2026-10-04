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
import { plain } from './vrrBand';
import { THEMED_TONE_TEXT } from '@/components/studio/studioTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { vrrUnits } from '@/utils/vrr/units';

const LINE = { inst: '#2563eb', cum: '#059669', ref: '#dc2626' };

const fmt = (v, d = 2) =>
  v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const FLAG_TONE = { under: 'warn', 'in-band': 'good', over: 'info' };

const PatternCard = ({ analysis, targetBand, system }) => {
  const u = vrrUnits(system);
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-3 flex-wrap">
          {pattern.name}
          <span className="text-xs font-normal text-pl-muted">
            {pattern.producers.join(', ')} · cum VRR {fmt(summary?.cumulativeVRR)}
          </span>
          {latestFlag && (
            <span className={`text-xs font-medium ${THEMED_TONE_TEXT[FLAG_TONE[latestFlag]]}`}>
              latest period {latestFlag === 'in-band' ? 'in band' : latestFlag} against {targetBand.min.toFixed(2)} to {targetBand.max.toFixed(2)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={220} exportFilename={`vrr-pattern-${pattern.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" padding={{ left: 12, right: 24 }} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
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
            <p className="text-xs text-pl-muted">{recommendation.reason}</p>
          ) : (
            <div className="text-xs text-pl-muted space-y-1">
              <div>
                Rolling VRR {fmt(recommendation.currentVRR)} against a target of {fmt(recommendation.targetVRR)}, so
                scale water injection by {fmt(recommendation.scale)}
                {recommendation.clamped && <span className={THEMED_TONE_TEXT.warn}> (clamped: the unclamped step was implausible, so re-check allocation and PVT first)</span>}
                : from {fmt(u.show('water', recommendation.currentWi), 0)} to <span className="text-pl-text font-semibold">{fmt(u.show('water', recommendation.recommendedWi), 0)} {u.label('water')}/period</span>
              </div>
              {recommendation.perInjector.map((r) => (
                <div key={r.well} className="font-pl-mono tabular-nums">
                  {r.well}: {fmt(u.show('water', r.currentWi), 0)} to {fmt(u.show('water', r.recommendedWi), 0)} {u.label('water')}/period ({r.deltaWi >= 0 ? '+' : ''}{fmt(u.show('water', r.deltaWi), 0)})
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
  const { isImported, inputs, patternAnalyses, summary, targetBand, u, trackActive } = useVrrMonitor();

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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rollup</CardTitle>
          {trackActive && <p className="text-xs text-pl-muted">Patterns and their advice use the same per-period FVFs as the field.</p>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Cum. VRR</TableHead>
                <TableHead className="text-right">Latest Inst.</TableHead>
                <TableHead className="text-right">Producers</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold">Field</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums font-semibold">{fmt(summary?.cumulativeVRR)}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums">{fmt(summary?.latestInstantaneousVRR)}</TableCell>
                <TableCell className="text-right text-pl-muted">all</TableCell>
                <TableCell className="text-xs text-pl-muted">{plain(summary?.status?.label)}</TableCell>
              </TableRow>
              {patternAnalyses.map((a) => (
                <TableRow key={a.pattern.id}>
                  <TableCell>{a.pattern.name}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums">{a.withheld ? EMPTY_VALUE : fmt(a.summary?.cumulativeVRR)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums">{a.withheld ? EMPTY_VALUE : fmt(a.summary?.latestInstantaneousVRR)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums">{a.pattern.producers.length}</TableCell>
                  <TableCell className="text-xs text-pl-muted">{a.withheld ? a.reason : plain(a.summary?.status?.label)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {patternAnalyses.map((a) => (
        <PatternCard key={a.pattern.id} analysis={a} targetBand={targetBand} system={u.system} />
      ))}
    </>
  );
};

export default PatternResultsPanel;

// Main area for the Data tab: pressure history of the analysed period, the
// test overview (whole gauge record with the rate steps, and temperature
// when the file carried it), the flow and shut-in summary and the QC summary.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, PINNED_TOOLTIP_PROPS, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { unitLabel, fromOilfield } from '@/utils/welltest/units';
import { gaugeTime } from '@/utils/welltest/gaugeImport';
import { Input } from '@/components/ui/input';
import { flowSummaryHead } from '@/utils/welltest/reportModel';
import { ChartCard, Kpi, LINE, WarningBanner, UnitInput, fmt, fmtU } from './primitives';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
// Pinned to the top-right corner of the plot (owner directive 2026-09-08).
const tooltipProps = PINNED_TOOLTIP_PROPS;
const legendProps = LEGEND_PROPS;

const DataResults = () => {
  const {
    gaugeRows, prepared, configSpec, reservoirSpec, flowPeriods, unitSystem,
    overview, flowSummary, periodMeta, setPeriodMetaField,
  } = useWellTestStudio();

  const historyData = useMemo(
    () => prepared.points.map((p) => ({
      time: Number(p.time.toPrecision(4)),
      pressure: Number(fromOilfield('pressure', p.p, unitSystem).toFixed(2)),
    })),
    [prepared, unitSystem],
  );

  // Test overview: the same series the PDF report draws (plotData
  // buildOverviewData through the context). Pressure and rate rows share one
  // time axis; each line skips the other's rows.
  const overviewData = useMemo(
    () => [
      ...overview.pressure.map((r) => ({ t: r.t, pressure: r.p })),
      ...overview.rate.map((r) => ({ t: r.t, rate: r.q })),
    ].sort((x, y) => x.t - y.t),
    [overview],
  );

  if (!gaugeRows.length) {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface px-6 py-10 text-center space-y-2">
        <p className="text-pl-text font-medium">No test data loaded.</p>
        <p className="text-sm text-pl-muted">
          Import a gauge CSV in the left rail, or load the sample buildup to explore the studio. Set the test type,
          producing time and reservoir properties there as well.
        </p>
      </div>
    );
  }

  const errors = [reservoirSpec.error, configSpec.error].filter(Boolean);
  const timeLabel = configSpec.config?.family === 'buildup' ? 'Shut-in time (hr)' : 'Elapsed time (hr)';

  return (
    <div className="space-y-4 overflow-y-auto">
      <WarningBanner warnings={[...errors, ...prepared.warnings, ...(flowSummary.mismatch || [])]} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Gauge points" value={fmt.int(gaugeRows.length)} />
        <Kpi title="Points used" value={fmt.int(prepared.points.length)} accent />
        <Kpi title="Time span" value={prepared.points.length ? `${fmt.sig3(prepared.points[0].time)} to ${fmt.sig3(prepared.points[prepared.points.length - 1].time)}` : EMPTY_VALUE} unit="hr" />
        <Kpi
          title={configSpec.config?.family === 'buildup' ? `pwf at Δt = 0 (gauge ${gaugeTime(prepared.testStartTime)} hr)` : 'Start of flow (gauge clock)'}
          value={configSpec.config?.family === 'buildup' ? fmtU('pressure', prepared.pwfShutIn, unitSystem, fmt.f1) : gaugeTime(prepared.testStartTime)}
          unit={configSpec.config?.family === 'buildup' ? unitLabel('pressure', unitSystem) : 'hr'}
        />
      </div>
      {prepared.info?.length > 0 && (
        <p className="text-[11px] text-pl-muted -mt-2" data-testid="wts-data-info">{prepared.info.join(' ')}</p>
      )}

      <ChartCard title="Pressure history">
        <LineChart data={historyData} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="time" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: timeLabel, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line type="monotone" dataKey="pressure" name="Gauge pressure" stroke={LINE.pressure} dot={{ r: 2 }} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Test overview" height={240}>
        <LineChart data={overviewData} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="t" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: overview.xLabel, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis yAxisId="p" domain={['auto', 'auto']} {...axisProps}
            label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis yAxisId="q" orientation="right" domain={[0, 'auto']} {...axisProps}
            label={{ value: `Rate (${unitLabel(overview.rateKind, unitSystem)})`, angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line yAxisId="p" type="monotone" dataKey="pressure" name="Gauge pressure" stroke={LINE.pressure} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
          <Line yAxisId="q" type="linear" dataKey="rate" name={overview.rateDerived ? 'Rate (test setup)' : 'Rate'} stroke={LINE.rate} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
        </LineChart>
      </ChartCard>
      <p className="text-[11px] text-pl-muted -mt-2" data-testid="wts-overview-note">
        The whole gauge record on the test clock, which starts at the first flow period. {overview.clockNote}
        {overview.rateDerived ? ' No rate history is entered, so the rate is the test setup rate.' : ''}
        {overview.hasTemperature ? '' : ' No temperature column was imported.'}
      </p>

      {overview.hasTemperature && (
        <ChartCard title="Gauge temperature" height={180}>
          <LineChart data={overview.temperature} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="t" type="number" domain={['auto', 'auto']} {...axisProps}
              label={{ value: overview.xLabel, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis domain={['auto', 'auto']} {...axisProps}
              label={{ value: `Temperature (${unitLabel('temperature', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            <Line type="monotone" dataKey="T" name="Gauge temperature" stroke={LINE.temperature} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}

      <div className="rounded-lg border border-pl-border bg-pl-surface p-4" data-testid="wts-flow-summary-edit">
        <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">Flow and shut-in summary</p>
        {flowSummary.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-pl-muted text-left">
                  {flowSummaryHead(flowSummary, unitSystem).map((h) => <th key={h} className="py-1 pr-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="text-pl-text">
                {flowSummary.rows.map((r) => {
                  const m = periodMeta?.[r.key] || {};
                  return (
                    <tr key={r.key} className="border-t border-pl-border">
                      <td className="py-1 pr-2">{r.index}</td>
                      <td className="py-1 pr-2">{r.typeLabel}</td>
                      <td className="py-1 pr-2">{r.start}</td>
                      <td className="py-1 pr-2">{r.duration}</td>
                      <td className="py-1 pr-2">
                        <UnitInput className="h-7 w-20" aria-label={`Choke, period ${r.index}`} placeholder="n/a"
                          kind="choke" system={unitSystem} value={m.choke ?? ''}
                          onChange={(v) => setPeriodMetaField(r.key, 'choke', v)} />
                      </td>
                      <td className="py-1 pr-2">{r.rate}</td>
                      <td className="py-1 pr-2">{r.volume}</td>
                      <td className="py-1 pr-2">{r.cumulative}</td>
                      <td className="py-1 pr-2">
                        <UnitInput className="h-7 w-24" aria-label={`Recovered volume, period ${r.index}`} placeholder="n/a"
                          kind="liquidVolume" system={unitSystem} value={m.recovered ?? ''}
                          onChange={(v) => setPeriodMetaField(r.key, 'recovered', v)} />
                      </td>
                      <td className="py-1">
                        <Input className="h-7 min-w-[8rem]" aria-label={`Remark, period ${r.index}`} placeholder="Optional"
                          value={m.remark ?? ''} onChange={(e) => setPeriodMetaField(r.key, 'remark', e.target.value)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="text-[11px] text-pl-muted mt-2" data-testid="wts-flow-summary-note">
          {flowSummary.note} Add the choke and the recovered volume for each period; they print in the report.
        </p>
        {Number.isFinite(flowPeriods.equivalentTp) && (
          <p className="text-[11px] text-pl-muted mt-1">
            Equivalent producing time from the rate history (cumulative production over final rate): {fmt.f1(flowPeriods.equivalentTp)} hr.
          </p>
        )}
      </div>
    </div>
  );
};

export default DataResults;

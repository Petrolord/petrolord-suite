// Main area for the Pattern Forecast tab: forecast KPIs, rate/WOR and
// Np/EA charts, annual-profile CSV export (the Forecast Scenario Hub / NPV
// Scenario Builder handoff format: year, production_bbl).
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, XAXIS_LABEL_HEIGHT, niceTicks } from '@/utils/chartTheme';
import { useWaterfloodDesign, buildPatternInputs } from '@/contexts/WaterfloodDesignContext';
import { exactBreakthroughDays } from '@/utils/waterfloodUncertainty';
import { ChartCard, Kpi, LINE, WarningBanner, fmt } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

// Aggregate a daily-rate monthly series into annual produced-oil volumes (bbl).
export function annualProfileFromSeries(series) {
  const annual = [];
  series.forEach((p, i) => {
    const yearIdx = Math.floor((p.t_days - 0.01) / 365.25);
    const dt = p.t_days - (i > 0 ? series[i - 1].t_days : 0);
    annual[yearIdx] = (annual[yearIdx] || 0) + p.qo_stbd * dt;
  });
  // Array.from, not .map: a year with no series points is a hole in the
  // sparse array and .map would leave it undefined (NaN in the CSV).
  return Array.from(annual, (v) => v || 0);
}

const PatternResults = () => {
  const { patternResult, patternInputs, projectName, addNotification, u } = useWaterfloodDesign();

  const chartData = useMemo(() => {
    if (!patternResult) return [];
    return patternResult.series.map((p) => ({
      years: Number((p.t_days / 365.25).toFixed(2)),
      qo: Number(u.show('oilRate', p.qo_stbd).toFixed(1)),
      qw: Number(u.show('oilRate', p.qw_stbd).toFixed(1)),
      WOR: Number.isFinite(p.WOR) ? Number(p.WOR.toFixed(2)) : null,
      Np: Number(u.show('oilVolumeK', p.Np_stb / 1000).toFixed(1)),
      EA: Number((p.EA * 100).toFixed(1)),
    }));
  }, [patternResult, u]);

  if (!patternResult || !patternResult.series.length) {
    return (
      <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-4 py-3 text-sm">
        {patternResult?.warnings?.[0] || 'Enter valid displacement and pattern inputs to run the forecast.'}
      </div>
    );
  }

  const { summary, breakthrough } = patternResult;
  // Senior test T1: exact, not the first monthly step past WiBT.
  const exactBtDays = exactBreakthroughDays(breakthrough, buildPatternInputs(patternInputs));
  // Round year ticks (the axis ended on the data: 0, 3, 8.58).
  const yrAxis = niceTicks(0, Math.max(1, ...(patternResult.series || []).map((p) => p.t_days / 365.25)), 6);
  const btYears = breakthrough ? (exactBtDays ?? breakthrough.t_days) / 365.25 : null;

  const exportAnnualCsv = () => {
    const annual = annualProfileFromSeries(patternResult.series);
    const rows = [['year', 'production_bbl'], ...annual.map((v, i) => [i + 1, Math.round(v)])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(projectName || 'waterflood').replace(/\W+/g, '_')}_annual_profile.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addNotification('Annual profile exported. Use it in NPV Scenario Builder for full economics.', 'success');
  };

  return (
    <div className="space-y-4 overflow-y-auto">
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
        <Kpi title="EA @ breakthrough" value={fmt.pct(summary.EAbt)} accent />
        <Kpi title="Breakthrough" value={fmt.f2(btYears)} unit="yr" />
        <Kpi title="Np (end)" value={fmt.int(u.show('oilVolume', summary.Np_stb))} unit={u.label('oilVolume')} />
        <Kpi title="Recovery of pattern OOIP" value={fmt.pct(summary.recoverySplit?.ER)} />
        <Kpi title="Final WOR (STB/STB)" value={Number.isFinite(summary.finalWOR) ? fmt.f1(summary.finalWOR) : 'no oil rate'} />
        <Kpi title="Stopped" value={summary.stopped === 'wor-limit' ? 'WOR limit' : summary.stopped === 'displacement-exhausted' ? 'ED max' : 'Horizon'} />
      </div>

      <WarningBanner warnings={patternResult.warnings} />

      <div className="rounded-lg border border-pl-border bg-pl-surface px-4 py-3 text-xs text-pl-text space-y-1" data-testid="wds-recovery-split">
        <p className="font-semibold">Recovery split at the end of the forecast</p>
        <p>
          ER = ED x EA x EV = {fmt.pct(summary.recoverySplit?.ED)} x {fmt.pct(summary.recoverySplit?.EA)} x {fmt.pct(summary.recoverySplit?.EV)} = {fmt.pct(summary.recoverySplit?.product)} of the pattern OOIP
          ({fmt.int(u.show('oilVolume', summary.pattern_ooip_stb))} {u.label('oilVolume')}). ED displacement efficiency inside the swept region,
          EA areal sweep, EV vertical sweep (entered).
        </p>
        <p className="text-pl-muted">
          Areal sweep entered with M = {fmt.f2(summary.M)} ({summary.mobilityBasis === 'craig'
            ? `Craig: krw ${fmt.f3(summary.krwAtSwAvgBt)} at the average Sw behind the front ${fmt.f3(summary.SwAvgBt)}`
            : 'endpoint: krw at Sor'}); the endpoint ratio is {fmt.f2(summary.M_endpoint)}.
          Voidage replacement is 1.0 by construction after fill-up: production balances injection in reservoir barrels.
        </p>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <ChartCard title="Production rates">
          <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="years" {...axisProps} type="number" domain={yrAxis.domain} ticks={yrAxis.ticks} label={{ value: 'Years', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', offset: 0 }} />
            <YAxis {...axisProps} domain={[0, 'auto']} label={{ value: u.label('oilRate'), angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
            <Tooltip {...tooltipProps} />
            <Legend {...legendProps} />
            {btYears != null && <ReferenceLine x={Number(btYears.toFixed(2))} stroke={LINE.ref} strokeDasharray="4 4" label={{ value: 'BT', fill: LINE.ref, fontSize: 11, position: 'top' }} />}
            <Line type="monotone" dataKey="qo" name={`Oil (${u.label('oilRate')})`} stroke={LINE.oil} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="qw" name={`Water (${u.label('oilRate')})`} stroke={LINE.water} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Water-oil ratio">
          <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="years" {...axisProps} type="number" domain={yrAxis.domain} ticks={yrAxis.ticks} label={{ value: 'Years', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', offset: 0 }} />
            <YAxis {...axisProps} domain={[0, 'auto']} label={{ value: 'WOR (STB/STB)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
            <Tooltip {...tooltipProps} />
            <Line type="monotone" dataKey="WOR" name="WOR" stroke={LINE.fw} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ChartCard>

        <ChartCard title="Cumulative oil">
          <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="years" {...axisProps} type="number" domain={yrAxis.domain} ticks={yrAxis.ticks} label={{ value: 'Years', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', offset: 0 }} />
            <YAxis {...axisProps} domain={[0, 'auto']} label={{ value: `Np (${u.label('oilVolumeK')})`, angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
            <Tooltip {...tooltipProps} />
            <Line type="monotone" dataKey="Np" name={`Np (${u.label('oilVolumeK')})`} stroke={LINE.oil} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Areal sweep efficiency growth">
          <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="years" {...axisProps} type="number" domain={yrAxis.domain} ticks={yrAxis.ticks} label={{ value: 'Years', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', offset: 0 }} />
            <YAxis {...axisProps} domain={[0, 100]} label={{ value: 'EA (%)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', style: { textAnchor: 'middle' } }} />
            <Tooltip {...tooltipProps} />
            <Line type="monotone" dataKey="EA" name="EA (%)" stroke={LINE.alt} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-pl-border bg-pl-surface px-4 py-3">
        <p className="text-xs text-pl-muted pr-4">
          For fiscal terms, taxes and portfolio views, export the annual oil profile and load it in NPV Scenario Builder
          (Economics owns valuation). Format: year, production_bbl, in stock-tank barrels whatever the display units, as NPV Scenario Builder reads it.
        </p>
        <Button variant="outline" size="sm" onClick={exportAnnualCsv} className="shrink-0">
          <Download size={14} className="mr-1" /> Annual CSV
        </Button>
      </div>
    </div>
  );
};

export default PatternResults;

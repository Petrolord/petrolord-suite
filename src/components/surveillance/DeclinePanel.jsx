// Decline overlay for one well (Decline tab). The fit and forecast are
// the canonical Arps engine's, surfaced here for a surveillance sanity
// check; the DCA Studio remains the tool for segmented fits, type
// curves and probabilistic EUR.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { TrendingDown, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { FIT_STREAMS, annualEffectiveDecline } from '@/utils/production/surveillance';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const HISTORY_COLOR = '#0f172a';
const FORECAST_COLOR = '#dc2626';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const Stat = ({ label, value, unit }) => (
  <div className="bg-slate-800/60 border border-slate-700/60 rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-base font-semibold text-slate-100">
      {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
    </div>
  </div>
);

const DeclinePanel = () => {
  const { inputs, dcaResult, wellSeries, currentField } = useSurveillance();
  const { dca } = inputs;
  const streamDef = FIT_STREAMS[dca.stream] || FIT_STREAMS.oil;
  const wellName = wellSeries.find((s) => s.well.id === dca.wellId)?.well.name;

  const chartData = useMemo(() => {
    if (!dcaResult || dcaResult.insufficient) return [];
    const rows = new Map();
    dcaResult.fitSeries.forEach((p) => {
      rows.set(p.date, { date: p.date, history: p.rate, forecast: null });
    });
    (dcaResult.forecast?.rates || []).forEach((p) => {
      const date = String(p.date).slice(0, 10);
      const existing = rows.get(date);
      if (existing) existing.forecast = p.rate;
      else rows.set(date, { date, history: null, forecast: p.rate });
    });
    return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [dcaResult]);

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail to fit a decline.
        </CardContent>
      </Card>
    );
  }

  const params = dcaResult?.fit?.parameters;
  const effective = params ? annualEffectiveDecline(params.Di, params.b, params.modelType) : null;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            {wellName ? `${wellName} decline` : 'Decline overlay'}
            <span className="text-xs font-normal text-slate-500">
              {streamDef.label} ({streamDef.unit}), {dca.basis === 'producing' ? 'producing-day' : 'calendar-day'} basis
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!dca.wellId ? (
            <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
              Pick a well in the left rail.
            </div>
          ) : dcaResult?.insufficient ? (
            <div className="h-72 flex items-center justify-center text-slate-500 text-sm px-8 text-center">
              Not enough usable points to fit a decline for this well and stream
              ({dcaResult.fitSeries.length} positive rate{dcaResult.fitSeries.length === 1 ? '' : 's'}; three are the minimum).
              No curve is drawn rather than a fabricated one.
            </div>
          ) : chartData.length ? (
            <ChartFrame height={360} exportFilename={`decline-${wellName || 'well'}`}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 24, bottom: 4, left: 4 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  dataKey="date"
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  minTickGap={40}
                />
                <YAxis
                  scale="log"
                  domain={['auto', 'auto']}
                  allowDataOverflow
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: `${streamDef.label} rate (${streamDef.unit})`, angle: -90, position: 'insideLeft',
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(value, name) => [`${fmt(Number(value))} ${streamDef.unit}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Scatter dataKey="history" name="History" fill={HISTORY_COLOR} isAnimationActive={false} />
                <Line
                  type="monotone" dataKey="forecast" name="Arps fit and forecast"
                  stroke={FORECAST_COLOR} strokeWidth={2} dot={false} connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartFrame>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
              No fit for this selection.
            </div>
          )}
        </CardContent>
      </Card>

      {params && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-base">Fit</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Stat label="Model" value={params.modelType} />
              <Stat label="qi" value={fmt(params.qi)} unit={streamDef.unit} />
              <Stat label="b" value={fmt(params.b, 2)} />
              <Stat label="Di (nominal)" value={fmt(params.Di, 5)} unit="1/day" />
              <Stat label="First-year effective decline" value={effective == null ? '--' : fmt(effective, 1)} unit="%" />
              <Stat label="R squared" value={fmt(dcaResult.fit.R2, 3)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Stat
                label="Forecast volume"
                value={fmt(dcaResult.forecast?.eur)}
                unit={dca.stream === 'gas' ? 'Mscf' : 'stb'}
              />
              <Stat label="Days to limit" value={fmt(dcaResult.forecast?.timeToLimit)} unit="days" />
              <Stat label="Points fitted" value={fmt(dcaResult.fitSeries.length)} />
            </div>
            <p className="text-[11px] text-slate-500">
              Forecast volume is the forecast horizon only, not cumulative production to date, and
              it stops at the economic limit when one is set. Segmented fits, type curves and
              probabilistic EUR live in the DCA Studio.
              <a
                href="/dashboard/apps/reservoir/decline-curve-analysis"
                className="ml-1 text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                Open DCA Studio <ExternalLink size={11} />
              </a>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DeclinePanel;

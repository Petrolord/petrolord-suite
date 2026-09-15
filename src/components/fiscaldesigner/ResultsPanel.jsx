// Fiscal Regime Designer results (Economics E2).
//
// Two changes here. The charts were Chart.js on a dark surface, the only
// economics charts not on the Suite standard; they are Recharts inside
// ChartFrame now, so they carry the watermark, export as PNG and look like
// every other chart in the product.
//
// And the Insights tab stated four conclusions of which three were never
// computed: because the summary is sorted by contractor NPV, it told the user
// the top-NPV regime also had the fastest payback, that the SECOND-ranked
// regime maximized government revenue "significantly higher than other
// options", and asserted a capex-resilience and price-response ranking out of
// nothing. Insights now come from `deriveInsights` in the engine, which works
// them out and omits any claim the numbers cannot support.
//
// EC2-1 (2026-09-14): the price chart used to draw the engine's zero fallback
// as a share. It now lives in PriceShareChart, which draws each point by its
// state: a line through shares, a pinned open marker above 100 percent, and a
// shaded band where the project is uneconomic.
//
// Naming wave (2026-09-14): the summary carried one rate labelled "Gov Take
// (%)" that was government share of net revenue, while the chart showed
// government take. Both names and definitions now come from the shared
// fiscalConventions module. Government take is the headline and comes first
// and larger; government share of net revenue is second; every header and
// cell carries its definition on hover; money is government cash flow.
import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, BarChartHorizontal, BrainCircuit, LineChart as LineIcon, TrendingUp } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import PriceShareChart from '@/components/fiscaldesigner/PriceShareChart';
import { buildPriceShareChart } from '@/components/fiscaldesigner/priceShareChart';
import { irrText } from '@/components/fiscaldesigner/fiscalResultText';
import {
  FISCAL_METRIC_KEYS, GOVERNMENT_CASH_FLOW, basisLabel, metricDefinition, metricLabel,
} from '@/utils/fiscalConventions';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

// Validated on the white chart surface: distinguishable in normal vision,
// under the common colour-vision deficiencies, and in black and white print.
const SERIES_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626'];

const tickStyle = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const axisLabel = (value, position, offset) => ({
  value, position, offset,
  fill: CHART_COLORS.axisText,
  fontSize: CHART_TYPOGRAPHY.axisFontSize,
});
const mm = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');

const TAKE = FISCAL_METRIC_KEYS.GOVERNMENT_TAKE;
const SHARE_OF_NR = FISCAL_METRIC_KEYS.GOVERNMENT_SHARE_OF_NET_REVENUE;

/** A take value as printed: its number, flagged above 100, or why there is none. */
const takeText = (value, state) => {
  if (state === 'undefined' || !Number.isFinite(value)) return 'none, project uneconomic';
  return state === 'exceeds' ? `${value.toFixed(1)}%, above 100` : `${value.toFixed(1)}%`;
};

/** Pivot the per-regime series into the row-per-x shape recharts wants. */
const toRows = (labels, series, summary, pick) =>
  (labels || []).map((label, i) => {
    const row = { label };
    (series || []).forEach((d) => {
      const regime = summary.find((r) => r.id === d.regimeId);
      if (regime) row[regime.name] = pick(d, i);
    });
    return row;
  });

const ResultsPanel = ({ results }) => {
  const { summary, annualCashFlows, sensitivityData, insights = [] } = results;

  const years = annualCashFlows[0]?.data.map((d) => d.year) || [];
  const seriesFor = (key) => years.map((year, i) => {
    const row = { label: year };
    summary.forEach((regime) => {
      const found = annualCashFlows.find((d) => d.regimeId === regime.id);
      row[regime.name] = found?.data[i]?.[key];
    });
    return row;
  });

  const contractorRows = seriesFor('contractorNCF');
  const governmentRows = seriesFor('governmentTake');
  const cumulativeRows = seriesFor('cumulativeNCF');

  const priceChart = buildPriceShareChart(sensitivityData?.price, summary);
  const capexRows = toRows(
    sensitivityData?.capex?.labels, sensitivityData?.capex?.data, summary,
    (d, i) => d.values[i],
  );

  const barsFor = (rows) => summary.map((regime, i) => (
    <Bar key={regime.id} dataKey={regime.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
  ));
  const linesFor = () => summary.map((regime, i) => (
    <Line
      key={regime.id} type="monotone" dataKey={regime.name}
      stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false}
    />
  ));

  const ChartCard = ({ title, children }) => (
    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
      {children}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-black/20">
          <TabsTrigger value="summary"><Table className="w-4 h-4 mr-2" />Summary</TabsTrigger>
          <TabsTrigger value="cashflow"><BarChartHorizontal className="w-4 h-4 mr-2" />Cash Flow</TabsTrigger>
          <TabsTrigger value="payout"><LineIcon className="w-4 h-4 mr-2" />Payout</TabsTrigger>
          <TabsTrigger value="sensitivities"><TrendingUp className="w-4 h-4 mr-2" />Sensitivities</TabsTrigger>
          <TabsTrigger value="insights"><BrainCircuit className="w-4 h-4 mr-2" />Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="p-2 text-lime-300">Regime</th>
                  <th className="p-2 text-lime-300">NPV ($MM)</th>
                  <th className="p-2 text-lime-300">IRR (%)</th>
                  <th className="p-2 text-lime-300">Payback (yrs)</th>
                  <th className="p-2 text-lime-300" title={GOVERNMENT_CASH_FLOW.definition}>{GOVERNMENT_CASH_FLOW.title} ($MM)</th>
                  <th className="p-2 text-lime-300 text-base" data-metric="headline" title={metricDefinition(TAKE)}>{metricLabel(TAKE)}, %</th>
                  <th className="p-2 text-lime-300/80 text-xs font-normal" data-metric="secondary" title={metricDefinition(SHARE_OF_NR)}>{metricLabel(SHARE_OF_NR)}, %</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.id} className="border-b border-white/10 last:border-b-0">
                    <td className="p-2 text-white font-semibold">{s.name}</td>
                    <td className="p-2 font-bold text-green-400">{s.npv.toFixed(1)}</td>
                    <td className="p-2 text-white" data-metric="irr">
                      {irrText(s).value}
                      {irrText(s).reason && (
                        <span className="block text-[11px] font-normal text-slate-300">{irrText(s).reason}</span>
                      )}
                    </td>
                    <td className="p-2 text-white">{s.paybackPeriod || 'N/A'}</td>
                    <td className="p-2 text-white" title={GOVERNMENT_CASH_FLOW.definition}>{s.govTake.toFixed(1)}</td>
                    <td className="p-2 text-white text-lg font-bold" data-metric="headline" title={metricDefinition(TAKE)}>
                      {takeText(s.governmentTakePct, s.governmentTakeState)}
                      <span
                        className="block text-[11px] font-normal text-slate-300"
                        title={metricDefinition(TAKE, s.discountRatePct)}
                      >
                        {basisLabel(s.discountRatePct)}: {takeText(s.governmentTakeDiscountedPct, s.governmentTakeDiscountedState)}
                      </span>
                    </td>
                    <td className="p-2 text-slate-200 text-sm" data-metric="secondary" title={metricDefinition(SHARE_OF_NR)}>
                      {Number.isFinite(s.governmentShareOfNetRevenuePct) ? `${s.governmentShareOfNetRevenuePct.toFixed(1)}%` : 'none'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[12px] text-slate-300 mt-3 space-y-1" data-testid="fiscal-metric-definitions">
              <p>Contractor NPV is discounted at year end, matching Petroleum Economics Studio.</p>
              <p>{GOVERNMENT_CASH_FLOW.title}: {GOVERNMENT_CASH_FLOW.definition}</p>
              <p className="text-slate-200">{metricDefinition(TAKE)}</p>
              <p>{metricDefinition(SHARE_OF_NR)}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cashflow" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Annual contractor net cash flow">
              <ChartFrame height={280} exportFilename="fiscal-contractor-ncf">
                <BarChart data={contractorRows} margin={{ top: 8, right: 20, left: 8, bottom: 28 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle} label={axisLabel('Year', 'insideBottom', -10)} />
                  <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle} tickFormatter={(v) => `$${mm(v)}`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`$${mm(v)}MM`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
                  {barsFor(contractorRows)}
                </BarChart>
              </ChartFrame>
            </ChartCard>
            <ChartCard title="Annual government cash flow">
              <ChartFrame height={280} exportFilename="fiscal-government-cash-flow">
                <BarChart data={governmentRows} margin={{ top: 8, right: 20, left: 8, bottom: 28 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle} label={axisLabel('Year', 'insideBottom', -10)} />
                  <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle} tickFormatter={(v) => `$${mm(v)}`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`$${mm(v)}MM`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                  {barsFor(governmentRows)}
                </BarChart>
              </ChartFrame>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="payout" className="mt-4">
          <ChartCard title="Payout timeline (cumulative contractor NCF)">
            <ChartFrame height={380} exportFilename="fiscal-payout">
              <LineChart data={cumulativeRows} margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle} label={axisLabel('Year', 'insideBottom', -10)} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle} tickFormatter={(v) => `$${mm(v)}`} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`$${mm(v)}MM`, name]} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                {/* Payback is where a line crosses this axis. */}
                <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3" label={{ value: 'payback', fill: CHART_COLORS.axisText, fontSize: 10, position: 'insideTopLeft' }} />
                {linesFor()}
              </LineChart>
            </ChartFrame>
          </ChartCard>
        </TabsContent>

        <TabsContent value="sensitivities" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`${metricLabel(TAKE)} vs oil price`}>
              <PriceShareChart model={priceChart} colors={SERIES_COLORS} />
            </ChartCard>
            <ChartCard title="Contractor NPV vs capex overrun">
              <ChartFrame height={280} exportFilename="fiscal-npv-vs-capex">
                <LineChart data={capexRows} margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle} label={axisLabel('Capex multiplier', 'insideBottom', -10)} />
                  <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle} tickFormatter={(v) => `$${mm(v)}`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`$${mm(v)}MM`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3" />
                  {linesFor()}
                </LineChart>
              </ChartFrame>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-4 p-4 bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl">
          <h3 className="text-xl font-bold text-white mb-4">What the comparison shows</h3>
          {insights.length === 0 ? (
            <p className="text-slate-300 text-sm">Run a comparison to see what it shows.</p>
          ) : (
            <div className="space-y-3 text-lime-200">
              {insights.map((item) => (
                <p key={item.key}><strong>{item.label}:</strong> {item.text}</p>
              ))}
            </div>
          )}
          <p className="text-[12px] text-slate-400 mt-4">
            Every line above is computed from this comparison. A conclusion the numbers do not
            support is left out rather than stated.
          </p>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default ResultsPanel;

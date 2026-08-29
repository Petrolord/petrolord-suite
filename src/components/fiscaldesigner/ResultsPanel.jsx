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
import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, BarChartHorizontal, BrainCircuit, LineChart as LineIcon, TrendingUp } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
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

  const priceRows = toRows(
    sensitivityData?.price?.labels, sensitivityData?.price?.data, summary,
    (d, i) => d.values[i],
  );
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
                  <th className="p-2 text-lime-300">Gov Take ($MM)</th>
                  <th className="p-2 text-lime-300">Gov Take (%)</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.id} className="border-b border-white/10 last:border-b-0">
                    <td className="p-2 text-white font-semibold">{s.name}</td>
                    <td className="p-2 font-bold text-green-400">{s.npv.toFixed(1)}</td>
                    <td className="p-2 text-white">{s.irr.toFixed(1)}%</td>
                    <td className="p-2 text-white">{s.paybackPeriod || 'N/A'}</td>
                    <td className="p-2 text-white">{s.govTake.toFixed(1)}</td>
                    <td className="p-2 text-white">{s.effectiveTaxRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] text-slate-300 mt-3">
              Contractor NPV is discounted at year end, matching Petroleum Economics Studio.
              Government take is the total of royalty, profit share and tax over the project life.
            </p>
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
            <ChartCard title="Annual government take">
              <ChartFrame height={280} exportFilename="fiscal-government-take">
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
            <ChartCard title="Government share vs oil price">
              <ChartFrame height={280} exportFilename="fiscal-take-vs-price">
                <LineChart data={priceRows} margin={{ top: 8, right: 24, left: 8, bottom: 28 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tickStyle} label={axisLabel('Oil price ($/bbl)', 'insideBottom', -10)} />
                  <YAxis stroke={CHART_COLORS.axisLine} tick={tickStyle} unit="%" />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${mm(v)} %`, name]} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                  {linesFor()}
                </LineChart>
              </ChartFrame>
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

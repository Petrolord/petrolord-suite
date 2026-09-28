import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Download, FileText, Target } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { ChartPanel } from '@/components/ui/chart-panel';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';

// Senior test T1 (2026-09-27): these three charts were the Suite's only
// Chart.js charts, off the recharts chart standard, with smoothed lines
// (tension 0.4) between spacings that are discrete cases. They are recharts
// on the chart theme, straight between the computed spacings.
const AXIS = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const SpacingLine = ({ data, dataKey, name, color, unit, fmt = (v) => v }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis dataKey="spacing" type="number" domain={['dataMin', 'dataMax']} {...AXIS} height={XAXIS_LABEL_HEIGHT}
        ticks={data.map((d) => d.spacing).filter((v, i, arr) => arr.length <= 9 || i % Math.ceil(arr.length / 8) === 0)}
        label={{ value: 'Well spacing (acres/well)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
      <YAxis {...AXIS} width={64} tickFormatter={fmt}
        label={{ value: unit, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `${v} acres/well`} formatter={(v) => [fmt(v), name]} />
      <Line type="linear" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
);

const ResultsPanel = ({ 
  results, 
  downloadCSV, 
  downloadJSON 
}) => {
  const rows = results.spacingResults;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 shadow-pl-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-2xl font-bold text-pl-text">Optimization Results</h2>
          <div className="flex space-x-2">
            <Button
              onClick={downloadCSV}
              variant="outline"
              size="sm"
                          >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button
              onClick={downloadJSON}
              variant="outline"
              size="sm"
                          >
              <FileText className="w-4 h-4 mr-2" />
              JSON
            </Button>
          </div>
        </div>

        <div className="bg-pl-warning-bg rounded-lg p-4 sm:p-6 mb-6 border border-pl-warning/40">
          <div className="flex items-center space-x-3 mb-3">
            <Target className="w-6 h-6 text-pl-warning-text" />
            <h3 className="text-xl font-semibold text-pl-text">How to read this</h3>
          </div>
          <p className="text-pl-warning-text text-sm mb-3">
            This model gives every well the recovery factor you entered over the area it drains, and
            models no interference between wells. Under that assumption total field volume barely
            changes with spacing while capex falls as wells are removed, so NPV rises with spacing and
            the highest NPV is simply the widest spacing that divides your area with least waste. That
            is arithmetic and does not amount to an engineering recommendation, so no optimum is nominated here.
          </p>
          <p className="text-pl-warning-text text-sm">
            Use the table as spacing economics: for each case it gives you the well count, the capital,
            the volume actually produced inside your project duration, the cost per barrel and the NPV.
            Choose the case that fits your development plan, your rig availability and whatever your
            reservoir work says about drainage. Read the Coverage column alongside NPV, because a
            spacing that leaves part of the field undrained is penalised here purely for that.
          </p>
          {Number.isFinite(results.boUsed) && (
            <p className="text-pl-warning-text text-sm mt-3" data-testid="ws-bo-note">
              {`Volumes are stock-tank barrels: oil in place is divided by Bo ${results.boUsed.toFixed(3)} rb/stb, from Standing's correlation on your GOR, oil gravity, gas gravity and temperature.`}
            </p>
          )}
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-pl-text text-sm">
            <thead>
              <tr className="border-b border-pl-border">
                <th className="text-left py-3 px-2 text-pl-muted">Well Spacing</th>
                <th className="text-right py-3 px-2 text-pl-muted">Number of Wells</th>
                <th className="text-right py-3 px-2 text-pl-muted">Coverage (%)</th>
                <th className="text-right py-3 px-2 text-pl-muted">EUR per Well (Mbbl)</th>
                <th className="text-right py-3 px-2 text-pl-muted">Produced per Well (Mbbl)</th>
                <th className="text-right py-3 px-2 text-pl-muted">Field Recovery (%)</th>
                <th className="text-right py-3 px-2 text-pl-muted">Total Capex ($M)</th>
                <th className="text-right py-3 px-2 text-pl-muted">NPV ($M)</th>
                <th className="text-right py-3 px-2 text-pl-muted">Cost/Barrel ($/bbl)</th>
              </tr>
            </thead>
            <tbody>
              {results.spacingResults.map((result, index) => (
                <tr key={index} className="border-b border-pl-border hover:bg-pl-sunken">
                  <td className="py-3 px-2 font-medium whitespace-nowrap">{result.spacing} acres/well</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">{result.numberOfWells}</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">{(result.arealCoverage * 100).toFixed(1)}%</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">{result.eurPerWell.toFixed(1)}</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">
                    {result.producedPerWell.toFixed(1)}
                    {result.truncatedByDuration ? <span className="text-pl-warning-text" title="Truncated by the project duration"> *</span> : null}
                  </td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">{result.totalFieldRecovery.toFixed(1)}%</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">${result.totalCapex.toFixed(1)}</td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">
                    <span className="font-semibold">${result.npv.toFixed(1)}</span>
                  </td>
                  <td className="text-right py-3 px-2 font-pl-mono tabular-nums">{Number.isFinite(result.costPerBarrel) ? `$${result.costPerBarrel.toFixed(2)}` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-pl-surface border border-pl-border rounded-xl p-4 sm:p-6 shadow-pl-sm"
      >
        <h2 className="text-2xl font-bold text-pl-text mb-6">Interactive Charts</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartPanel title="NPV vs. Well Spacing">
            <div className="relative h-64">
              <SpacingLine data={rows} dataKey="npv" name="NPV" unit="NPV ($M)" color="#16a34a" fmt={(v) => Number(v).toFixed(1)} />
              <ChartLogo />
            </div>
          </ChartPanel>

          <ChartPanel title="Field Recovery vs. Well Spacing" subtitle="Coverage times the stated recovery factor. The steps come from the undrained remainder, and the model has no interference.">
            <div className="relative h-64">
              <SpacingLine data={rows} dataKey="totalFieldRecovery" name="Field recovery" unit="Field recovery (%)" color="#2563eb" fmt={(v) => Number(v).toFixed(1)} />
              <ChartLogo />
            </div>
          </ChartPanel>
        </div>

        <div className="mt-6">
          <ChartPanel title="Cost per Barrel vs. Well Spacing">
            <div className="relative h-64">
              <SpacingLine data={rows} dataKey="costPerBarrel" name="Cost per barrel" unit="Cost per barrel ($/bbl)" color="#ea580c" fmt={(v) => Number(v).toFixed(2)} />
              <ChartLogo />
            </div>
          </ChartPanel>
        </div>
      </motion.div>

      
    </>
  );
};

export default ResultsPanel;
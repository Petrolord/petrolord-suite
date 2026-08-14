import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { projectEmv } from '@/utils/portfolioOptimizer';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

const formatCurrency = (value, unit = 'MM') => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0) + (unit ? ` ${unit}` : '');

const AXIS_TICK = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

const Metric = ({ title, value, accent }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
    <p className={`font-bold ${accent || 'text-white'}`}>{value}</p>
  </div>
);

const OptimizationResults = ({ result }) => {
  if (!result) return null;

  const { optimalProjects, totalCapex, totalEmv, totalNpvSuccess, frontierData, risk } = result;
  const optimalPoint = [{ capex: totalCapex, emv: totalEmv }];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
      <Card className="bg-gradient-to-br from-green-500/10 via-slate-900 to-slate-900 border-green-500/30 text-white">
        <CardHeader>
          <CardTitle className="text-2xl text-green-300">Optimal Portfolio</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-2">
            <Metric title="Risked EMV" value={formatCurrency(totalEmv)} accent="text-lime-300" />
            <Metric title="Success-case NPV" value={formatCurrency(totalNpvSuccess)} accent="text-emerald-200" />
            <Metric title="Total CAPEX" value={formatCurrency(totalCapex)} accent="text-amber-300" />
            <Metric title="Projects" value={optimalProjects.length} />
            <Metric
              title="P(portfolio NPV < 0)"
              value={`${(risk.probLoss * 100).toFixed(1)}%`}
              accent={risk.probLoss <= 0.1 ? 'text-emerald-300' : risk.probLoss <= 0.3 ? 'text-amber-300' : 'text-red-300'}
            />
            <Metric title="NPV P90 / P10" value={`${formatCurrency(risk.p90, '')} / ${formatCurrency(risk.p10, '')}`} />
          </div>
          <p className="text-xs text-slate-400 pt-1">
            Risk metrics assume independent projects and a normal approximation of the summed NPV (screening basis). Risked EMV weights each NPV by its chance of success and charges the failure loss.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-2 text-slate-200">Funded Projects</h3>
              <div className="max-h-80 overflow-y-auto pr-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-white/20 hover:bg-transparent">
                      <TableHead className="text-white">Project</TableHead>
                      <TableHead className="text-white text-right">CAPEX</TableHead>
                      <TableHead className="text-white text-right">POS</TableHead>
                      <TableHead className="text-white text-right">Risked EMV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {optimalProjects.map(p => (
                      <TableRow key={p.id} className="border-b-white/10">
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right text-amber-300">{formatCurrency(p.capex)}</TableCell>
                        <TableCell className="text-right text-slate-300">{Math.round((p.pos ?? 1) * 100)}%</TableCell>
                        <TableCell className="text-right text-lime-300">{formatCurrency(projectEmv(p))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-slate-200">Efficient Frontier (risked EMV vs capital)</h3>
              <ChartFrame height={300} exportFilename="portfolio-efficient-frontier">
                <ScatterChart margin={{ top: 16, right: 20, bottom: 20, left: 30 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="capex" type="number" name="CAPEX"
                    label={{ value: 'Total CAPEX ($MM)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    tick={AXIS_TICK} stroke={CHART_COLORS.axisLine}
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis
                    dataKey="emv" type="number" name="Risked EMV"
                    label={{ value: 'Risked EMV ($MM)', angle: -90, position: 'insideLeft', offset: -18, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    tick={AXIS_TICK} stroke={CHART_COLORS.axisLine}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(v, name) => [formatCurrency(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                  <Scatter name="Efficient frontier" data={frontierData} fill="#2563eb" shape="circle" />
                  <Scatter name="Optimal portfolio" data={optimalPoint} fill="#059669" shape="star" />
                </ScatterChart>
              </ChartFrame>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default OptimizationResults;

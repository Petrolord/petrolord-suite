import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { AlertTriangle } from 'lucide-react';
import { projectEmv } from '@/utils/portfolioOptimizer';
import { useFullPrecision } from '@/components/fullprecision/FullPrecision';
import { formatFull, MONEY_MM_DECIMALS } from '@/lib/fullPrecision';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

const formatCurrency = (value, unit = 'MM') => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0) + (unit ? ` ${unit}` : '');

const AXIS_TICK = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

const Metric = ({ title, value, accent, detail }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
    <p className={`font-bold ${accent || 'text-white'}`}>{value}</p>
    {detail && <p className="text-[11px] text-slate-400" data-testid="risk-method">{detail}</p>}
  </div>
);

// EC5-0 (owner decision 2026-09-14): the loss probability and the P90 / P10
// cards come from the engine's seeded Monte Carlo, so each card states the
// method, the iteration count and the seed that reproduce it.
export const riskMethodLabel = (risk) => {
  if (!risk) return '';
  const method = risk.method === 'monte-carlo' ? 'Monte Carlo' : String(risk.method || 'Unknown method');
  const iterations = Number.isFinite(risk.iterations) ? risk.iterations.toLocaleString('en-US') : 'unknown';
  return `${method}, ${iterations} iterations, seed ${risk.seed}`;
};

const formatMM = (value) => `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} $MM`;

const OptimizationResults = ({ result }) => {
  // W3 (D3): with Full precision on, the $MM figures a course reads print at
  // 4 decimals with no grouping; off, every card prints as before.
  const { full } = useFullPrecision();
  if (!result) return null;
  const money = (v, unit = 'MM') => (full
    ? `${formatFull(v || 0, MONEY_MM_DECIMALS)}${unit ? ` $${unit}` : ''}`
    : formatCurrency(v, unit));

  const {
    optimalProjects, totalCapex, totalEmv, totalNpvSuccess, frontierData, risk,
    resolution, solveMethod, optimalityGap,
  } = result;
  const optimalPoint = [{ capex: totalCapex, emv: totalEmv }];
  const methodLabel = riskMethodLabel(risk);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
      <Card className="bg-gradient-to-br from-green-500/10 via-slate-900 to-slate-900 border-green-500/30 text-white">
        <CardHeader>
          <CardTitle className="text-2xl text-green-300">Optimal Portfolio</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-2">
            <Metric title="Risked EMV" value={money(totalEmv)} accent="text-lime-300" />
            <Metric title="Success-case NPV" value={money(totalNpvSuccess)} accent="text-emerald-200" />
            <Metric title="Total CAPEX" value={formatCurrency(totalCapex)} accent="text-amber-300" />
            <Metric title="Projects" value={optimalProjects.length} />
            <Metric
              title="P(portfolio NPV < 0)"
              value={`${(risk.probLoss * 100).toFixed(1)}%`}
              accent={risk.probLoss <= 0.1 ? 'text-emerald-300' : risk.probLoss <= 0.3 ? 'text-amber-300' : 'text-red-300'}
              detail={methodLabel}
            />
            <Metric
              title="NPV P90 (low) / P10 (high)"
              value={`${money(risk.p90, '')} / ${money(risk.p10, '')}`}
              detail={methodLabel}
            />
          </div>
          {/* EC5 (engines #194): the knapsack is solved exactly on the capex
              figures themselves, so there is no grid and the funded set cannot
              exceed the limit. A grid appears only on a problem too large for
              the exact solve, and then it says so and bounds what it may have
              left on the table. */}
          {solveMethod === 'grid-feasible' && Number.isFinite(resolution) && (
            <p className="text-xs text-slate-400 pt-1" data-testid="grid-resolution">
              This portfolio was too large to solve exactly, so capital was quantized onto a grid with a
              resolution of {formatMM(resolution)} and every candidate rounded UP onto it, which keeps the
              funded set inside your limit. At most {formatMM(optimalityGap)} of risked EMV could have been
              left on the table.
            </p>
          )}
          {solveMethod === 'exact' && (
            <p className="text-xs text-slate-400 pt-1" data-testid="exact-solve">
              Solved exactly on the capital figures you entered, so the funded set is the best that fits
              inside the limit of {formatMM(result.capexLimit)}.
            </p>
          )}
          <p className="text-xs text-slate-400 pt-1">
            {risk.correlation > 0 ? (
              <>
                Risk metrics use an average pairwise correlation of {risk.correlation.toFixed(2)}
                {' '}between projects. The loss probability and the P90 and P10 come from a seeded Monte Carlo
                {' '}of each project's success and failure cases ({methodLabel}; screening basis).
                {' '}Assuming independence instead would report a spread of
                {' '}{formatCurrency(risk.independentStdDev, '')} rather than {formatCurrency(risk.stdDev, '')},
                {' '}so treat that difference as the cost of the assumption.
              </>
            ) : (
              <>
                Risk metrics assume independent projects. The loss probability and the P90 and P10 come from a
                {' '}seeded Monte Carlo of each project's success and failure cases ({methodLabel}; screening basis).
                {' '}Independence is the friendliest assumption a portfolio can be given;
                {' '}raise the correlation above to see what shared exposure does to the downside.
              </>
            )}
            {' '}P90 is the low case and P10 the high case of the portfolio NPV.
            {' '}Risked EMV weights each NPV by its chance of success and charges the failure loss.
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
                        <TableCell className="text-right text-lime-300">{money(projectEmv(p))}</TableCell>
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

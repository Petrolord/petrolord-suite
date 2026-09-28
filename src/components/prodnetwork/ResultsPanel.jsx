// The answer, and the one number that is the reason this studio exists.
//
// The table's important column is not what each well makes. It is what
// each well would have made ALONE, against the same separator, through
// the same lines. The difference is what the wells are costing each
// other, and it is a number no single-well study can produce because
// every single-well study is run against a wellhead pressure somebody
// typed in.
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { Play, RefreshCw, TrendingDown, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { Stat, Row, fmt } from './fields';

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-pl-warning-text mb-2">
    <RefreshCw className="w-3 h-3" />
    The network changed since this ran.
    <button type="button" className="underline hover:text-pl-warning-text" onClick={onRerun}>
      Solve again
    </button>
  </div>
);

const ResultsPanel = () => {
  const { result, resultStale, solve, isRunning, canRun } = useProductionNetwork();

  if (!result) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-pl-muted">
            The solve samples a curve for every well and every line, then Newtons the whole network,
            then does it again once per well to work out what each is losing to the others. That is
            seconds of work, so it runs when you ask for it.
          </p>
          <Button onClick={solve} disabled={isRunning || !canRun}>
            <Play className="w-3.5 h-3.5 mr-1" /> Solve the network
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lost = result.totals.qoAloneStbd - result.totals.qoStbd;
  const lostPct = result.totals.qoAloneStbd > 0
    ? (100 * lost) / result.totals.qoAloneStbd
    : 0;
  const chartData = result.wells.map((w) => ({
    label: w.label,
    inNetwork: w.qoStbd,
    lost: Math.max(0, (w.qoAloneStbd || 0) - w.qoStbd),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-pl-muted" /> What the wells cost each other
            </CardTitle>
            <Button size="sm" onClick={solve} disabled={isRunning} className="h-7 text-xs">
              <Play className="w-3 h-3 mr-1" /> Solve
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {resultStale && <StaleNote onRerun={solve} />}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="The field makes"
              value={fmt(result.totals.qoStbd)}
              unit="stb/d"
            />
            <Stat
              label="One at a time it would make"
              value={fmt(result.totals.qoAloneStbd)}
              unit="stb/d"
              hint="Same separator, same lines"
            />
            <Stat
              label="Lost to backpressure"
              value={fmt(lost)}
              unit="stb/d"
              accent="text-pl-warning-text"
              hint={`${fmt(lostPct, 1)} percent`}
            />
            <Stat
              label="Header"
              value={fmt(result.solution.pressures[
                Object.keys(result.solution.pressures).find(
                  (id) => result.network.nodeById.get(id)?.kind === 'junction',
                )
              ])}
              unit="psia"
              hint="Solved by the network"
            />
          </div>

          <p className="text-[11px] text-pl-muted">
            The standalone column is solved on this same network with the other wells shut in, not
            by a separate single-well calculation. That is what makes the comparison mean something:
            the flowline, the trunk, the delivery pressure and the correlation are identical on both
            sides, so the difference is the other wells and nothing else.
          </p>

          <ChartFrame height={300} exportFilename="network-backpressure-cost">
            <BarChart data={chartData} margin={{ top: 8, right: 24, bottom: 14, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="label" stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              />
              <YAxis
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Oil rate (stb/d)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [fmt(v), n]} />
              <Legend {...LEGEND_PROPS} />
              <Bar dataKey="inNetwork" stackId="a" name="Makes in the network" fill="#059669" isAnimationActive={false} />
              <Bar dataKey="lost" stackId="a" name="Lost to the other wells" fill="#d97706" isAnimationActive={false} />
            </BarChart>
          </ChartFrame>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Well by well</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                  <th className="text-left py-1.5 pr-3">Well</th>
                  <th className="text-right py-1.5 px-3">Wellhead</th>
                  <th className="text-right py-1.5 px-3">In network</th>
                  <th className="text-right py-1.5 px-3">Alone</th>
                  <th className="text-right py-1.5 px-3">Lost</th>
                  <th className="text-right py-1.5 pl-3">Water cut</th>
                </tr>
              </thead>
              <tbody>
                {result.wells.map((w) => {
                  const t = w.stream.qoStbd + w.stream.qwStbd;
                  return (
                    <tr key={w.id} className="border-b border-pl-border last:border-0">
                      <td className="py-1.5 pr-3 text-pl-text">
                        {w.label}
                        {w.shutIn && <span className="text-pl-danger-text ml-2 text-xs">shut in</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(w.whpPsia)}</td>
                      <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(w.qoStbd)}</td>
                      <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(w.qoAloneStbd)}</td>
                      <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-warning-text">
                        {fmt(w.qoAloneStbd - w.qoStbd)}
                        <span className="text-pl-muted ml-1 text-xs">
                          {fmt(w.lostFraction * 100, 0)}%
                        </span>
                      </td>
                      <td className="py-1.5 pl-3 text-right font-pl-mono tabular-nums text-pl-muted">
                        {t > 0 ? `${fmt((100 * w.stream.qwStbd) / t, 1)}%` : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">The lines</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {result.diagnosis.bottleneck && (
            <p className="text-[11px] text-pl-warning-text flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {result.diagnosis.bottleneck.label} is burning the most pressure per pound of fluid
                it moves (oil, water and gas together, so a wet or gassy well weighs more per
                barrel of oil). That is not the same as the biggest drop, which is{' '}
                {result.diagnosis.biggestDrop?.label}: a trunk carrying everything is supposed to
                have the biggest drop, and changing it is rarely the cheapest thing to do.
              </span>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
                  <th className="text-left py-1.5 pr-3">Line</th>
                  <th className="text-right py-1.5 px-3">Bore</th>
                  <th className="text-right py-1.5 px-3">Length</th>
                  <th className="text-right py-1.5 px-3">Oil</th>
                  <th className="text-right py-1.5 px-3">Water cut</th>
                  <th className="text-right py-1.5 pl-3">Drop</th>
                </tr>
              </thead>
              <tbody>
                {result.branches.map((b) => (
                  <tr key={b.id} className="border-b border-pl-border last:border-0">
                    <td className="py-1.5 pr-3 text-pl-text">
                      {b.label}
                      {b.id === result.diagnosis.bottleneck?.id
                        && <span className="text-pl-warning-text ml-2 text-xs">bottleneck</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(b.idIn, 2)}"</td>
                    <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-muted">{fmt(b.lengthFt)}</td>
                    <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(b.stream.qoStbd)}</td>
                    <td className="py-1.5 px-3 text-right font-pl-mono tabular-nums text-pl-muted">
                      {b.wctPct != null ? `${fmt(b.wctPct, 1)}%` : '--'}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-pl-mono tabular-nums text-pl-text">{fmt(b.dpPsi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Row
            label="Mass in equals mass out"
            value={`${(result.conservation.relative * 100).toExponential(1)} % apart`}
            hint="Checked on the answer itself"
          />
          <Row
            label="Mixture passes"
            value={String(result.passes)}
            hint={result.settled
              ? 'The line compositions settled'
              : 'The line compositions were still moving'}
            accent={result.settled ? 'text-pl-text' : 'text-pl-warning-text'}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ResultsPanel;

// What the treatment is actually worth, solved rather than multiplied.
//
// The number this panel exists to show is the GAP between what the
// inflow gained and what the well gained. A stimulation that doubles
// the productivity index does not double the well, because the extra
// rate has to go up the same tubing and the friction loss goes up with
// it. Every percentage-uplift spreadsheet misses that, and misses it in
// the optimistic direction.
import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Play, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { Stat, Row, fmt } from './fields';

const UpliftPanel = () => {
  const { plan, planStale, runPlan, isRunning, model } = useIntervention();

  if (!plan) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-slate-400">
            The plan diagnoses the history, screens the treatments against that diagnosis, then
            solves the well before and after whatever survived. Each treatment is two full nodal
            solves, so it runs when you ask for it.
          </p>
          <Button onClick={runPlan} disabled={isRunning}>
            <Play className="w-3.5 h-3.5 mr-1" /> Run the plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sized = plan.sized;
  const isShutoff = plan.chosen === 'shutoff';

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              {isShutoff ? 'What the shutoff is worth' : 'What the stimulation is worth'}
            </CardTitle>
            <Button size="sm" onClick={runPlan} disabled={isRunning} className="h-7 text-xs">
              <Play className="w-3 h-3 mr-1" /> Run
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {planStale && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400">
              <RefreshCw className="w-3 h-3" />
              Inputs changed since this ran.
              <button type="button" className="underline hover:text-amber-300" onClick={runPlan}>
                Run again
              </button>
            </div>
          )}

          {!sized && (
            <p className="text-[12px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Nothing was sized. Either the screening ruled this treatment out, or the well does
                not have an operating point to compare against.
              </span>
            </p>
          )}
          {sized && !sized.ok && (
            <p className="text-[12px] text-rose-400">{sized.error}</p>
          )}

          {sized?.ok && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Now"
                  value={fmt(sized.before.qoStbd)}
                  unit="stb/d"
                  hint={`at ${fmt(sized.before.pwfPsia)} psia bottomhole`}
                />
                <Stat
                  label="Afterwards"
                  value={fmt(sized.after.qoStbd)}
                  unit="stb/d"
                  accent="text-emerald-400"
                  hint={`at ${fmt(sized.after.pwfPsia)} psia`}
                />
                <Stat
                  label="Uplift"
                  value={fmt(sized.upliftStbd)}
                  unit="stb/d"
                  accent="text-emerald-400"
                />
                {isShutoff ? (
                  <Stat
                    label="Water removed"
                    value={fmt(sized.waterRemovedStbd)}
                    unit="stb/d"
                    hint={`bottomhole down ${fmt(sized.pwfDropPsi)} psi`}
                  />
                ) : (
                  <Stat
                    label="Productivity index"
                    value={`x ${fmt(sized.piMultiplier, 2)}`}
                    hint={`the WELL only gains x ${fmt(sized.rateMultiplier, 2)}`}
                    accent="text-amber-400"
                  />
                )}
              </div>

              {!isShutoff && (
                <div className="rounded border border-amber-900/50 bg-amber-950/20 p-3">
                  <p className="text-[12px] text-amber-200">
                    A spreadsheet that applied the productivity multiplier to the current rate would
                    have promised {fmt(sized.inflowOnlyStbd)} stb/d. The well actually gains{' '}
                    {fmt(sized.upliftStbd)}, because the extra rate has to go up the same tubing and
                    the friction loss rises with it. That{' '}
                    {fmt(sized.overstatementStbd)} stb/d gap is why this is a nodal solve, and it is
                    always in the optimistic direction.
                  </p>
                </div>
              )}

              {isShutoff && (
                <div className="rounded border border-cyan-900/50 bg-cyan-950/20 p-3">
                  <p className="text-[12px] text-cyan-200">
                    The inflow did not change at all. Every barrel of this gain came from the column
                    getting lighter: less water is less hydrostatic head, so the same wellhead
                    pressure leaves a bottomhole pressure {fmt(sized.pwfDropPsi)} psi lower and the
                    well slides down its own inflow curve. No inflow calculation would have found
                    it.
                  </p>
                </div>
              )}

              {!isShutoff && (
                <div className="border-t border-slate-800 pt-3">
                  <Row
                    label="Flow efficiency now"
                    value={fmt(sized.flowEfficiencyBefore * 100, 0) + '%'}
                    hint="What it makes against an undamaged well"
                  />
                  <Row
                    label="Flow efficiency afterwards"
                    value={fmt(sized.flowEfficiencyAfter * 100, 0) + '%'}
                  />
                  <Row
                    label="Most negative skin this geometry allows"
                    value={fmt(sized.minimumSkin, 1)}
                    hint="Below it the productivity index goes infinite, which is the equation running out"
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {sized?.ok && plan.economics?.ok && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What it is worth in money</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="NPV"
                value={fmt(plan.economics.economics.metrics.npv, 2)}
                unit="$MM"
                accent={plan.economics.economics.metrics.npv > 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
              <Stat
                label="Incremental oil"
                value={fmt(plan.economics.incrementalBbl / 1000)}
                unit="Mbbl"
              />
              <Stat
                label="First year"
                value={fmt(plan.economics.profile[0].rateStbd)}
                unit="stb/d"
                hint="declining thereafter"
              />
              <Stat
                label="Last year"
                value={fmt(plan.economics.profile[plan.economics.profile.length - 1].rateStbd)}
                unit="stb/d"
              />
            </div>

            <ChartFrame height={280} exportFilename="intervention-uplift-profile">
              <ComposedChart
                data={plan.economics.profile}
                margin={{ top: 8, right: 30, bottom: 14, left: 8 }}
              >
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  dataKey="year" stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Year', position: 'insideBottom', offset: -10,
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <YAxis
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Incremental rate (stb/d)', angle: -90, position: 'insideLeft',
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(v)} stb/d`, 'Uplift']} />
                <Line
                  type="monotone" dataKey="rateStbd" stroke="#059669" strokeWidth={2}
                  dot isAnimationActive={false}
                />
              </ComposedChart>
            </ChartFrame>

            <p className="text-[11px] text-slate-600">
              The uplift DECLINES, and the rate it declines at is an input with no default. An
              intervention modelled as a permanent step change is an intervention that always pays,
              which is the commonest way a workover case is oversold. The discounting is the Suite's
              canonical screening economics, imported rather than rewritten, so it uses the same
              mid-year convention as every other screening number in the platform.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UpliftPanel;

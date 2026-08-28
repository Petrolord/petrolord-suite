// What insulation buys, as a curve rather than a number.
//
// A single U value answers "does this design work". The sweep answers
// the question actually being asked, which is "how much do I need", and
// it reads the break-even off the curve rather than asserting one.
import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Play, RefreshCw, Thermometer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Field, NumberInput, Stat, Row, fmt } from './fields';

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-amber-400 mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since this ran.
    <button type="button" className="underline hover:text-amber-300" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const InsulationPanel = () => {
  const { analysis, sweep, sweepStale, runSweep, isRunning } = useFlowAssurance();
  const target = analysis?.insulationTarget;
  const firstLeg = analysis?.legs?.[0];

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-amber-400" /> Thermal performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!firstLeg ? (
            <p className="text-sm text-slate-500">
              No pipe leg is running. Enable a flowline and give it a length.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Overall U"
                  value={fmt(firstLeg.u.uBtuHrFt2F, 3)}
                  unit="Btu/hr-ft2-F"
                  hint={`Referred to the ${fmt(firstLeg.u.referenceIdIn, 2)} in bore`}
                />
                <Stat
                  label="Relaxation length"
                  value={fmt(firstLeg.relaxationLengthFt)}
                  unit="ft"
                  hint="Where the line has lost 63 percent of its heat"
                />
                <Stat
                  label="Number of transfer units"
                  value={fmt(firstLeg.ntu, 2)}
                  hint={firstLeg.ntu > 3
                    ? 'Thermally long: the line arrives at ambient whatever it started at'
                    : 'Thermally short: the inlet temperature still matters at the far end'}
                  accent={firstLeg.ntu > 3 ? 'text-amber-400' : 'text-emerald-400'}
                />
                <Stat
                  label="Pressure drop"
                  value={fmt(firstLeg.dpPsi)}
                  unit="psi"
                  hint="Marched at the temperature the thermal model puts the line at"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                The pressure and the temperature are marched TOGETHER, not overlaid: every gradient
                is evaluated at the local pressure and the local temperature, so viscosity and gas
                solubility see the temperature the line is actually at.
              </p>
            </>
          )}

          <div className="border-t border-slate-800 pt-3 space-y-2">
            <Field
              label="Target arrival temperature (F)"
              hint="The U it would take is inverted from the same energy balance the profile integrates, so the two cannot disagree."
            >
              <NumberInput section="thermal" name="targetArrivalF" />
            </Field>
            {target && (
              target.ok ? (
                <>
                  <Row
                    label="U required"
                    value={`${fmt(target.uBtuHrFt2F, 3)} Btu/hr-ft2-F`}
                    hint={`${fmt(target.ntu, 2)} transfer units`}
                  />
                  <Row
                    label="This line"
                    value={target.met ? 'Meets it' : 'Does not meet it'}
                    accent={target.met ? 'text-emerald-400' : 'text-amber-400'}
                    hint={`At U = ${fmt(target.currentU, 3)}`}
                  />
                </>
              ) : (
                <p className="text-[11px] text-amber-300">{target.reason}</p>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How much insulation is enough</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runSweep} disabled={isRunning} className="h-9">
            <Play className="w-3.5 h-3.5 mr-1" /> Sweep insulation
          </Button>
          {!sweep ? (
            <p className="text-sm text-slate-500 py-4">
              Each point is a full coupled march of the line, so this runs when you ask for it.
            </p>
          ) : (
            <>
              {sweepStale && <StaleNote onRerun={runSweep} />}
              {sweep.breakEvenU != null ? (
                <p className="text-[11px] text-emerald-400">
                  The arrival leaves the hydrate region at about U = {fmt(sweep.breakEvenU, 2)}{' '}
                  Btu/hr-ft2-F. This line is at {fmt(firstLeg?.u.uBtuHrFt2F, 2)}.
                </p>
              ) : (
                <p className="text-[11px] text-amber-300">
                  No insulation level in this range gets the arrival out of the hydrate region.
                  That is a heating or a dosing problem, not an insulation one.
                </p>
              )}
              <ChartFrame height={340} exportFilename="flow-assurance-insulation-sweep">
                <ComposedChart
                  data={[...sweep.points].sort((a, b) => a.u - b.u)}
                  margin={{ top: 8, right: 34, bottom: 14, left: 8 }}
                >
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number" dataKey="u" domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Overall U (Btu/hr-ft2-F)', position: 'insideBottom', offset: -10,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    yAxisId="t" stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Arrival temperature (F)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    yAxisId="s" orientation="right" stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Subcooling (F)', angle: 90, position: 'insideRight',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 1), n]} />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                  <ReferenceLine yAxisId="s" y={0} stroke="#dc2626" strokeDasharray="4 3" />
                  {firstLeg && (
                    <ReferenceLine
                      yAxisId="t" x={firstLeg.u.uBtuHrFt2F} stroke="#0891b2" strokeDasharray="4 3"
                      label={{ value: 'This line', fill: '#0891b2', fontSize: 10, position: 'top' }}
                    />
                  )}
                  <Line
                    yAxisId="t" type="monotone" dataKey="arrivalTempF" name="Arrival"
                    stroke="#0891b2" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                  <Line
                    yAxisId="s" type="monotone" dataKey="subcoolingF" name="Subcooling"
                    stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartFrame>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InsulationPanel;

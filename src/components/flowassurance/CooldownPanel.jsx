// The no-touch time: how long after a shutdown before the line is cold
// enough to be in trouble.
//
// This is the number a flow assurance engineer is asked for more often
// than any other, because it sets how long an operator has to decide
// whether to blow the line down, displace it or restart.
//
// The PIPE'S OWN heat capacity is carried, not just the fluid's.
// Leaving the steel out is a common and optimistic error, and on a
// small-bore line it is worth about ten percent of the answer.
import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Field, NumberInput, Stat, fmt } from './fields';

const CooldownPanel = () => {
  const { inputs, setSection, analysis } = useFlowAssurance();
  const cd = analysis?.cooldown;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="w-4 h-4 text-violet-400" /> Cooldown after a shutdown
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-400">Include</Label>
            <Switch
              checked={!!inputs.cooldown.enabled}
              onCheckedChange={(v) => setSection('cooldown', 'enabled', v)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!inputs.cooldown.enabled ? (
          <p className="text-sm text-slate-500">
            Turn this on to get a no-touch time for the first pipe leg.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Start temperature (F)" hint="Blank uses the leg inlet">
                <NumberInput section="cooldown" name="startTempF" />
              </Field>
              <Field label="Target temperature (F)" hint="Usually the hydrate temperature at line pressure">
                <NumberInput section="cooldown" name="targetTempF" />
              </Field>
              <Field label="Contents density (lb/ft3)" hint="What settles out, not the flowing mixture">
                <NumberInput section="cooldown" name="contentsDensityLbFt3" />
              </Field>
              <Field label="Contents Cp (Btu/lb-F)">
                <NumberInput section="cooldown" name="contentsCp" step="0.01" />
              </Field>
            </div>

            {cd && !cd.ok && <p className="text-[11px] text-rose-400">{cd.error}</p>}

            {cd?.ok && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat
                    label="No-touch time"
                    value={Number.isFinite(cd.hours) ? fmt(cd.hours, 1) : 'Never'}
                    unit={Number.isFinite(cd.hours) ? 'hours' : ''}
                    accent="text-violet-300"
                  />
                  <Stat
                    label="Time constant"
                    value={fmt(cd.timeConstantHr, 2)}
                    unit="hours"
                    hint="Thermal mass over the loss rate"
                  />
                  <Stat
                    label="Ambient"
                    value={fmt(Number(inputs.flowline.ambientTempF), 0)}
                    unit="F"
                    hint="Where it settles"
                  />
                </div>
                {cd.note && <p className="text-[11px] text-slate-500">{cd.note}</p>}

                {cd.stations?.length > 1 && (
                  <ChartFrame height={300} exportFilename="flow-assurance-cooldown">
                    <ComposedChart data={cd.stations} margin={{ top: 8, right: 30, bottom: 14, left: 8 }}>
                      <CartesianGrid {...GRID_STYLE} />
                      <XAxis
                        type="number" dataKey="hours" domain={['dataMin', 'dataMax']}
                        stroke={CHART_COLORS.axisLine}
                        tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        tickFormatter={(v) => fmt(v, 1)}
                        label={{
                          value: 'Hours after shutdown', position: 'insideBottom', offset: -10,
                          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                        }}
                      />
                      <YAxis
                        stroke={CHART_COLORS.axisLine}
                        tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                        label={{
                          value: 'Temperature (F)', angle: -90, position: 'insideLeft',
                          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                        }}
                      />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(v) => [`${fmt(v, 1)} F`, 'Temperature']}
                        labelFormatter={(v) => `${fmt(v, 2)} hours`}
                      />
                      <ReferenceLine
                        y={Number(inputs.cooldown.targetTempF)} stroke="#dc2626" strokeDasharray="4 3"
                        label={{ value: 'Target', fill: '#dc2626', fontSize: 10, position: 'right' }}
                      />
                      {Number.isFinite(cd.hours) && (
                        <ReferenceLine
                          x={cd.hours} stroke="#7c3aed" strokeDasharray="4 3"
                          label={{ value: 'No-touch', fill: '#7c3aed', fontSize: 10, position: 'top' }}
                        />
                      )}
                      <Line
                        type="monotone" dataKey="tempF" stroke="#7c3aed" strokeWidth={2}
                        dot={false} isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ChartFrame>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CooldownPanel;

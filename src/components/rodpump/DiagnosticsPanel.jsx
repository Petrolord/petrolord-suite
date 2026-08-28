// Diagnostics tab: a measured surface card read down the rod string to
// find out what the pump is doing.
//
// This is the Gibbs solution. The surface card gives BOTH the position
// and the load at the top of the string, and the wave equation carries
// them down harmonic by harmonic. Nothing here classifies the fault by
// name: the downhole card's shape is the diagnosis, and an engineer
// reads it. What the studio does is compute the card honestly and
// report the two numbers that fall out of it.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Stethoscope, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { Field, NumberInput, fmt, Stat } from './fields';

const COLOR = { surface: '#2563eb', pump: '#059669' };

const DiagnosticsPanel = () => {
  const {
    inputs, setSection, measuredCard, diagnosis, useDesignCardForDiagnosis, string,
  } = useRodPump();

  const surface = useMemo(
    () => (measuredCard.length ? [...measuredCard, measuredCard[0]] : []),
    [measuredCard],
  );
  const pump = useMemo(
    () => (diagnosis?.pumpCard?.length ? [...diagnosis.pumpCard, diagnosis.pumpCard[0]] : []),
    [diagnosis],
  );

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-sky-400" /> Read a measured card
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Field
                label="Surface card (position in inches, load in pounds)"
                hint="One evenly spaced sample per line, all the way round the loop. At least sixteen; a hundred or more reads better."
              >
                <Textarea
                  rows={8}
                  value={inputs.diagnostics.cardText}
                  onChange={(e) => setSection('diagnostics', 'cardText', e.target.value)}
                  placeholder={'0.0, 9500\n3.2, 12100\n...'}
                  className="bg-slate-800 border-slate-700 font-mono text-xs"
                />
              </Field>
            </div>
            <div className="space-y-3">
              <Field
                label="Speed when measured (spm)"
                hint="Blank uses the design speed."
              >
                <NumberInput section="diagnostics" name="spm" step="0.1" />
              </Field>
              <Button
                size="sm" variant="outline" className="w-full h-8"
                onClick={useDesignCardForDiagnosis}
              >
                <Download className="w-3 h-3 mr-1" /> Load the predicted card
              </Button>
              <p className="text-[11px] text-slate-600">
                Loading the design's own predicted card and diagnosing it should give back the pump
                behaviour the design assumed. The two solvers share no code, so agreeing is a real
                check rather than a restatement.
              </p>
              <p className="text-[11px] text-slate-600">
                {measuredCard.length} sample{measuredCard.length === 1 ? '' : 's'} read.
              </p>
            </div>
          </div>

          {!string?.ok ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              The rod string has to be defined before a card can be carried down it.
            </p>
          ) : !diagnosis ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Paste at least sixteen evenly spaced samples of a surface card to read what the pump
              is doing.
            </p>
          ) : (
            <>
              <div className="border-t border-slate-800 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Plunger stroke"
                  value={fmt(diagnosis.plungerStrokeIn, 1)}
                  unit="in"
                  hint="What actually reached the pump"
                />
                <Stat
                  label="Fluid load"
                  value={fmt(diagnosis.fluidLoadLb)}
                  unit="lb"
                  hint="Read off the two flat parts of the pump card"
                />
                <Stat
                  label="Pump fillage"
                  value={fmt(diagnosis.fillageEstimate * 100)}
                  unit="%"
                  accent={diagnosis.fillageEstimate < 0.4 ? 'text-amber-300' : 'text-emerald-400'}
                  hint="Share of the plunger cycle carrying load"
                />
                <Stat
                  label="Harmonics used"
                  value={fmt(diagnosis.harmonics)}
                  hint="Each one carried down the string in closed form"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                The fluid load is taken from the plateaus rather than the extremes of the computed
                card. A Fourier series truncated at a sharp load transfer overshoots at the corners,
                which is the Gibbs phenomenon, named for the same Gibbs whose solution this is.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {diagnosis && pump.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Measured at surface, computed at the pump
              <span className="block text-xs font-normal text-slate-500 mt-0.5">
                A full pump gives a parallelogram. A card whose load falls away partway down the
                stroke is a barrel that did not fill; one that never reaches the fluid load is a
                worn pump or a hole in the tubing. The shape is the diagnosis.
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChartFrame height={360} exportFilename="rod-pump-diagnostic-cards">
              <LineChart margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  type="number"
                  dataKey="positionIn"
                  domain={['dataMin', 'dataMax']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Position (in)', position: 'insideBottom', offset: -8,
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <YAxis
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Load (lb)', angle: -90, position: 'insideLeft',
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  itemStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(value, name) => [`${Math.round(Number(value)).toLocaleString()} lb`, name]}
                  labelFormatter={(v) => `${Number(v).toFixed(1)} in`}
                />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Line
                  data={surface} dataKey="loadLb" name="Surface (measured)"
                  stroke={COLOR.surface} strokeWidth={1.8} dot={false} isAnimationActive={false}
                />
                <Line
                  data={pump} dataKey="loadLb" name="Downhole (computed)"
                  stroke={COLOR.pump} strokeWidth={2.2} dot={false} isAnimationActive={false}
                />
              </LineChart>
            </ChartFrame>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DiagnosticsPanel;

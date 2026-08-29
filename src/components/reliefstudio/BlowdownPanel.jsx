// Blowdown tab: the depressuring march with the 15-minute question
// read off the curve.
import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRelief } from '@/contexts/ReliefStudioContext';
import { fmt, Stat, ErrorNote, Field, NumberInput } from './fields';

export const BlowdownInputs = () => (
  <div className="space-y-4">
    <Field label="Vessel volume (ft3)"><NumberInput section="blowdownIn" name="volumeFt3" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Initial pressure (psig)"><NumberInput section="blowdownIn" name="p0Psig" /></Field>
      <Field label="End pressure (psig)"><NumberInput section="blowdownIn" name="pEndPsig" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Temperature (F)"><NumberInput section="blowdownIn" name="tF" /></Field>
      <Field label="Molecular weight"><NumberInput section="blowdownIn" name="mw" step="0.1" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="k (Cp/Cv)"><NumberInput section="blowdownIn" name="k" step="0.01" /></Field>
      <Field label="z"><NumberInput section="blowdownIn" name="z" step="0.01" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Orifice diameter (in)"><NumberInput section="blowdownIn" name="orificeDIn" step="0.05" /></Field>
      <Field label="Discharge coefficient"><NumberInput section="blowdownIn" name="cd" step="0.01" /></Field>
    </div>
  </div>
);

const BlowdownPanel = () => {
  const { blowdownResult: r } = useRelief();
  if (r.error) return <ErrorNote>{r.error}</ErrorNote>;
  const data = r.stations.map((s) => ({
    t: s.tS / 60, p: s.pPsia, T: s.tR - 459.67,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Adiabatic depressuring</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Time to end pressure" value={fmt(r.timeS / 60, 1)} unit="min"
            accent={r.timeS > 900 ? 'text-amber-400' : 'text-emerald-400'}
            hint={r.timeS > 900 ? 'above the customary 15 minutes' : 'inside the customary 15 minutes'} />
          <Stat label="Final temperature" value={fmt(r.finalTR - 459.67, 0)} unit="F"
            hint="adiabatic bound; real vessels chill less but the metal question starts here" />
          <Stat label="Stations" value={String(r.stations.length)} />
        </div>
        <ChartFrame height={300} exportFilename="blowdown-curve">
          <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 24, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Time (min)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis yAxisId="p" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Pressure (psia)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis yAxisId="T" orientation="right" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Temperature (F)', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 1), n]} labelFormatter={(t) => `${fmt(t, 1)} min`} />
            <Legend verticalAlign="top" />
            <ReferenceLine yAxisId="p" x={15} stroke="#d97706" strokeDasharray="4 3" />
            <Line yAxisId="p" dataKey="p" name="Pressure (psia)" stroke="#059669" strokeWidth={2} dot={false} />
            <Line yAxisId="T" dataKey="T" name="Temperature (F)" stroke="#2563eb" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default BlowdownPanel;

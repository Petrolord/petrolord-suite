// Pump studio panels: the curves and the duty point they make, the
// NPSH check, and what a change would buy.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { usePump } from '@/contexts/PumpStudioContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

export const PumpInputs = () => (
  <div className="space-y-4">
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Fluid</p>
    <div className="grid grid-cols-3 gap-2">
      <Field label="SG"><NumberInput section="fluid" name="sg" step="0.01" /></Field>
      <Field label="Visc (cSt)"><NumberInput section="fluid" name="viscosityCSt" step="0.1" /></Field>
      <Field label="Pv (psia)"><NumberInput section="fluid" name="vapourPressurePsia" step="0.1" /></Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">System</p>
    <Field label="Static head (ft)" hint="Lift plus any pressure the discharge is working against.">
      <NumberInput section="system" name="staticHeadFt" />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Friction head (ft)"><NumberInput section="system" name="frictionHeadFt" /></Field>
      <Field label="at flow (gpm)" hint="The Line Sizing Studio gives you this pair.">
        <NumberInput section="system" name="atFlowGpm" />
      </Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Pump curve</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Q1 (gpm)"><NumberInput section="pump" name="q1" /></Field>
      <Field label="H1 (ft)"><NumberInput section="pump" name="h1" /></Field>
      <Field label="Q2"><NumberInput section="pump" name="q2" /></Field>
      <Field label="H2"><NumberInput section="pump" name="h2" /></Field>
      <Field label="Q3"><NumberInput section="pump" name="q3" /></Field>
      <Field label="H3"><NumberInput section="pump" name="h3" /></Field>
      <Field label="Q4"><NumberInput section="pump" name="q4" /></Field>
      <Field label="H4"><NumberInput section="pump" name="h4" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Efficiency at duty"><NumberInput section="pump" name="efficiency" step="0.01" /></Field>
      <Field label="BEP flow (gpm)"><NumberInput section="pump" name="qBepGpm" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="NPSH required (ft)"><NumberInput section="pump" name="npshrFt" step="0.5" /></Field>
      <Field label="Speed (rpm)"><NumberInput section="pump" name="speedRpm" /></Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Suction</p>
    <Field label="Suction pressure (psia)" hint="Atmospheric is 14.7; a pressurised vessel is more.">
      <NumberInput section="suction" name="suctionPressurePsia" step="0.1" />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Static suction (ft)" hint="Positive if the source is above the pump.">
        <NumberInput section="suction" name="staticSuctionLiftFt" />
      </Field>
      <Field label="Suction friction (ft)"><NumberInput section="suction" name="suctionFrictionFt" step="0.1" /></Field>
    </div>

    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Changes</p>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Speed ratio"><NumberInput section="changes" name="speedRatio" step="0.01" /></Field>
      <Field label="Trim ratio" hint="Impeller diameter as a fraction of full.">
        <NumberInput section="changes" name="diameterRatio" step="0.01" />
      </Field>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Field label="Parallel"><NumberInput section="changes" name="nParallel" step="1" /></Field>
      <Field label="Series"><NumberInput section="changes" name="nSeries" step="1" /></Field>
      <Field label="Motor eff"><NumberInput section="changes" name="motorEfficiency" step="0.01" /></Field>
    </div>
  </div>
);

export const DutyResults = () => {
  const { duty, power, region, curve, configured } = usePump();
  if (curve.error) return <ErrorNote>{curve.error}</ErrorNote>;
  if (duty.error) {
    return (
      <div className="space-y-3">
        <ErrorNote>{duty.error}</ErrorNote>
        {Number.isFinite(duty.shutoffHeadFt) && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="Pump shutoff head" value={fmt(duty.shutoffHeadFt, 0)} unit="ft" />
            <Stat label="System static head" value={fmt(duty.systemStaticHeadFt, 0)} unit="ft" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Where the pump and the system meet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Duty flow" value={fmt(duty.qGpm, 0)} unit="gpm" accent="text-emerald-400" />
            <Stat label="Duty head" value={fmt(duty.headFt, 0)} unit="ft" />
            {!power.error && (
              <>
                <Stat label="Brake power" value={fmt(power.brakeHp, 1)} unit="bhp"
                  hint={`${fmt(power.hydraulicHp, 1)} hydraulic hp`} />
                <Stat label="Motor input" value={fmt(power.motorInputKw, 1)} unit="kW" />
              </>
            )}
          </div>
          {!region.error && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="Of best efficiency flow" value={fmt(region.percentOfBep, 0)} unit="%"
                accent={region.preferred ? 'text-emerald-400' : 'text-amber-400'} />
              <Stat label="Operating region" value={region.region} />
            </div>
          )}
          {region?.note && <WarnNote>{region.note}</WarnNote>}
          {!configured.error && (configured.nPar > 1 || configured.nSer > 1) && (
            <p className="text-[12px] text-slate-500">
              {configured.nPar > 1 && `${configured.nPar} pumps in parallel. `}
              {configured.nSer > 1 && `${configured.nSer} pumps in series. `}
              The duty above is the combined one; the operating region is judged per machine,
              because that is what each pump actually experiences.
            </p>
          )}
          {curve.warning && <WarnNote>{curve.warning}</WarnNote>}
          <p className="text-[12px] text-slate-500">
            This is a solved intersection, not an assumed duty. Change the system, the trim or the
            speed and the point moves, which is the only way the knock-on questions stay honest.
            Curve fit quality: R squared {fmt(curve.rSquared, 4)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export const CurveChart = () => {
  const { chart, duty } = usePump();
  if (chart.error) return null;
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Pump against system</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ChartFrame height={320} exportFilename="pump-system-curves">
          <ComposedChart data={chart.rows} margin={{ top: 8, right: 30, bottom: 24, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="q" domain={[0, 'dataMax']} stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Flow (gpm)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Head (ft)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 1), n]}
              labelFormatter={(q) => `${fmt(q)} gpm`} />
            <Legend verticalAlign="top" />
            <Line dataKey="pump" name="Pump head (ft)" stroke="#059669" strokeWidth={2} dot={false} connectNulls />
            <Line dataKey="system" name="System head (ft)" stroke="#2563eb" strokeWidth={2} dot={false} />
            {!duty.error && (
              <ReferenceDot x={duty.qGpm} y={duty.headFt} r={6} fill="#d97706" stroke="#78350f" />
            )}
          </ComposedChart>
        </ChartFrame>
        <p className="text-[12px] text-slate-500">
          The marked point is the only flow at which the pump makes exactly the head the system
          demands. Everywhere else one exceeds the other and the flow accelerates or decays until
          it arrives here.
        </p>
      </CardContent>
    </Card>
  );
};

export const NpshResults = () => {
  const { npsh, viscosity, changeEffect } = usePump();
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Suction margin</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {npsh.error ? <ErrorNote>{npsh.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="NPSH available" value={fmt(npsh.npshaFt, 1)} unit="ft"
                  hint={`${fmt(npsh.pressureHeadFt, 1)} ft of it from pressure`} />
                <Stat label="Margin over required" value={fmt(npsh.check?.marginFt, 1)} unit="ft"
                  accent={npsh.check?.pass ? 'text-emerald-400'
                    : (npsh.check?.severity === 'cavitating' ? 'text-red-400' : 'text-amber-400')} />
                <Stat label="Customary margin" value={fmt(npsh.check?.requiredMarginFt, 1)} unit="ft"
                  hint="the larger of 3 ft and 35 percent of required" />
                <Stat label="Verdict" value={npsh.check?.severity || '--'}
                  accent={npsh.check?.pass ? 'text-emerald-400' : 'text-amber-400'} />
              </div>
              {npsh.warning && <WarnNote>{npsh.warning}</WarnNote>}
              {npsh.check?.note && <WarnNote>{npsh.check.note}</WarnNote>}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Viscosity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {viscosity.error ? <ErrorNote>{viscosity.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Correlating parameter B" value={fmt(viscosity.B, 2)} />
                <Stat label="Flow factor" value={fmt(viscosity.cQ, 3)} />
                <Stat label="Head factor" value={fmt(viscosity.cH, 3)} />
                <Stat label="Efficiency factor" value={fmt(viscosity.cEta, 3)}
                  accent={viscosity.cEta < 0.7 ? 'text-amber-400' : 'text-emerald-400'} />
              </div>
              {viscosity.note && <p className="text-[12px] text-slate-500">{viscosity.note}</p>}
              {viscosity.warning && <WarnNote>{viscosity.warning}</WarnNote>}
              <p className="text-[12px] text-slate-500">
                A catalogue curve is a water curve. On anything heavier the pump delivers less flow
                at less head and considerably less efficiency, and the factors above are what the
                Hydraulic Institute method says that costs.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {changeEffect && !changeEffect.trim.error && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">What a change would buy</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Trim, ideal head" value={fmt(changeEffect.trim.idealHeadFt, 0)} unit="ft"
                hint="what the affinity laws promise" />
              <Stat label="Trim, real head" value={fmt(changeEffect.trim.headFt, 0)} unit="ft"
                hint={`${fmt(changeEffect.trim.shortfallPct, 1)} percent short of ideal`} />
              <Stat label="Speed, flow" value={fmt(changeEffect.speed.qGpm, 0)} unit="gpm" />
              <Stat label="Speed, power" value={fmt(changeEffect.speed.brakeHp, 1)} unit="bhp"
                hint="power goes as the cube of speed" />
            </div>
            {changeEffect.trim.warning && <WarnNote>{changeEffect.trim.warning}</WarnNote>}
            <p className="text-[12px] text-slate-500">
              A trim under-delivers what the affinity laws promise, because a cut impeller no longer
              matches its casing, and the shortfall grows with the depth of the cut. A speed change
              does follow the laws, which is why a variable speed drive is usually the better answer
              when the duty has to move often.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

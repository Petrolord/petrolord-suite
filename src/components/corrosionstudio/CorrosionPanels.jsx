// Corrosion studio panels: inputs, the rate with its factor chain,
// the velocity sweep chart, sour service, and integrity.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCorrosion } from '@/contexts/CorrosionStudioContext';
import {
  fmt, Stat, ErrorNote, WarnNote, Field, NumberInput, TextInput, CATEGORY_ACCENT,
} from './fields';

export const ConditionInputs = () => {
  const { inputs, setSection } = useCorrosion();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Temperature (F)"><NumberInput section="conditions" name="tF" /></Field>
        <Field label="Pressure (psig)"><NumberInput section="conditions" name="pPsig" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="CO2 (mol %)"><NumberInput section="conditions" name="co2MolPct" step="0.1" /></Field>
        <Field label="H2S (mol %)"><NumberInput section="conditions" name="h2sMolPct" step="0.001" /></Field>
      </div>
      <Field label="In-situ pH" hint="Not the sampled pH at surface: the pH the water has at line conditions.">
        <NumberInput section="conditions" name="ph" step="0.1" />
      </Field>

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Flow</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Velocity (ft/s)"><NumberInput section="flow" name="velocityFtS" step="0.1" /></Field>
        <Field label="Line ID (in)"><NumberInput section="flow" name="idIn" step="0.1" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Density (lb/ft3)"><NumberInput section="flow" name="densityLbFt3" step="0.1" /></Field>
        <Field label="Viscosity (cp)"><NumberInput section="flow" name="viscosityCp" step="0.1" /></Field>
      </div>
      <Field label="Wetting regime" hint="An oil-wet wall does not corrode. That is a regime, not a multiplier.">
        <Select value={inputs.flow.flowRegime} onValueChange={(v) => setSection('flow', 'flowRegime', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="waterWet">Water wet (continuous water film)</SelectItem>
            <SelectItem value="intermittent">Intermittent (scaled by water cut)</SelectItem>
            <SelectItem value="oilWet">Oil wet (no water at the wall)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {inputs.flow.flowRegime === 'intermittent' && (
        <Field label="Water cut (%)"><NumberInput section="flow" name="waterCutPct" /></Field>
      )}

      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold pt-2">Inhibition</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Efficiency (%)" hint="The datasheet number.">
          <NumberInput section="mitigation" name="inhibitorEfficiencyPct" step="0.1" />
        </Field>
        <Field label="Availability (%)" hint="The fraction of time it is actually on spec and injecting.">
          <NumberInput section="mitigation" name="inhibitorAvailabilityPct" step="0.1" />
        </Field>
      </div>
    </div>
  );
};

export const IntegrityInputs = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Corrosion allowance (in)"><NumberInput section="integrity" name="corrosionAllowanceIn" step="0.005" /></Field>
      <Field label="Already consumed (in)"><NumberInput section="integrity" name="consumedIn" step="0.005" /></Field>
    </div>
    <Field label="Design life (years)"><NumberInput section="integrity" name="designLifeYears" /></Field>
    <Field label="Velocities to sweep (ft/s)" hint="Comma separated. The rate against velocity is the curve a flat multiplier cannot draw.">
      <TextInput section="sweep" name="velocitiesFtS" />
    </Field>
  </div>
);

export const RateResults = () => {
  const { result } = useCorrosion();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const r = result.rate;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Predicted rate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Corrosion rate" value={fmt(r.rateMmYr, 3)} unit="mm/yr"
              accent={CATEGORY_ACCENT[result.category] || 'text-slate-100'}
              hint={`${fmt(result.rateMpy, 0)} mpy, ${result.category}`} />
            <Stat label="Uninhibited" value={fmt(r.uninhibitedMmYr, 3)} unit="mm/yr"
              hint="what the line does with no inhibitor at all" />
            <Stat label="Effective inhibition" value={fmt(r.effectiveInhibitionPct, 0)} unit="%"
              accent={r.warning ? 'text-amber-400' : 'text-emerald-400'} />
            <Stat label="Controlled by" value={r.controlling}
              hint="reaction kinetics or the rate mass transfer can supply" />
          </div>
          {r.warning && <WarnNote>{r.warning}</WarnNote>}
          {r.note && <p className="text-[12px] text-slate-500">{r.note}</p>}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Where the number comes from</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="CO2 fugacity" value={fmt(r.fco2Bar, 3)} unit="bar"
              hint={`partial pressure ${fmt(r.pco2Bar, 2)} bar, coefficient ${fmt(r.fugacityCoefficient, 3)}`} />
            <Stat label="Reaction rate" value={fmt(r.reactionMmYr, 2)} unit="mm/yr" />
            <Stat label="Mass transfer limit" value={fmt(r.massTransferMmYr, 2)} unit="mm/yr"
              hint="carries velocity and line size" />
            <Stat label="Combined" value={fmt(r.combinedMmYr, 2)} unit="mm/yr"
              hint="the two as resistances in series" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <Stat label="Scale factor" value={fmt(r.scaleFactor, 3)}
              hint={r.scaleFactor < 1 ? 'protective siderite is slowing it' : 'no protective film at this temperature'} />
            <Stat label="pH factor" value={fmt(r.phFactor, 3)} />
            <Stat label="Water wetting" value={fmt(r.waterWettingFactor, 2)} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Wall shear and the inhibitor film</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {result.shear.error ? <ErrorNote>{result.shear.error}</ErrorNote> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Wall shear stress" value={fmt(result.shear.tauPa, 1)} unit="Pa"
                  accent={result.shear.filmRisk === 'high' ? 'text-red-400'
                    : (result.shear.filmRisk === 'moderate' ? 'text-yellow-400' : 'text-emerald-400')} />
                <Stat label="Film risk" value={result.shear.filmRisk} />
                <Stat label="Reynolds" value={fmt(result.shear.reynolds, 0)} />
              </div>
              {result.shear.warning && <WarnNote>{result.shear.warning}</WarnNote>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const SweepChart = () => {
  const { velocitySweep } = useCorrosion();
  if (velocitySweep.error) return <ErrorNote>{velocitySweep.error}</ErrorNote>;
  const data = velocitySweep.rows
    .filter((r) => r.rateMmYr !== null)
    .map((r) => ({
      v: r.velocityFtS, rate: r.rateMmYr, uninhibited: r.uninhibitedMmYr,
    }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Rate against velocity</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ChartFrame height={300} exportFilename="corrosion-velocity-sweep">
          <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 24, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" dataKey="v" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Velocity (ft/s)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'Rate (mm/yr)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 3), n]} labelFormatter={(v) => `${fmt(v, 1)} ft/s`} />
            <Legend verticalAlign="top" />
            <Line dataKey="uninhibited" name="Uninhibited (mm/yr)" stroke="#d97706" strokeWidth={2} dot />
            <Line dataKey="rate" name="With inhibition (mm/yr)" stroke="#059669" strokeWidth={2} dot />
          </ComposedChart>
        </ChartFrame>
        <p className="text-[12px] text-slate-500">
          The rate rises with velocity because mass transfer feeds the reaction faster, and it
          saturates where the kinetics take over. A model with a flat multiplier instead of a
          transfer term cannot draw this curve at all, which is why the same fluid in a bigger
          line used to look identical.
        </p>
      </CardContent>
    </Card>
  );
};

export const SourResults = () => {
  const { result } = useCorrosion();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const s = result.sour;
  const g = result.regime;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Sour service (MR0175 / ISO 15156)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="H2S partial pressure" value={fmt(result.ph2sBar * 14.5038, 3)} unit="psia"
              hint="the threshold is 0.05 psia" />
            <Stat label="Region" value={s.sour ? String(s.region) : 'not sour'}
              accent={s.region >= 3 ? 'text-red-400' : (s.region === 2 ? 'text-orange-400' : 'text-emerald-400')}
              hint={s.label} />
          </div>
          <p className="text-[12px] text-slate-500">{s.note}</p>
          {s.materialGuidance && (
            <div className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-[12px] text-slate-300">
              {s.materialGuidance}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Which film governs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="H2S to CO2 ratio" value={g.ratio === null ? '--' : fmt(g.ratio, 5)} />
            <Stat label="Regime" value={g.regime}
              accent={g.regime === 'sulphide' ? 'text-amber-400' : 'text-slate-100'} />
          </div>
          <p className="text-[12px] text-slate-500">{g.note}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export const IntegrityResults = () => {
  const { result } = useCorrosion();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const l = result.life;
  if (!l) return <ErrorNote>Enter a corrosion allowance to get a remaining life.</ErrorNote>;
  if (l.error) return <ErrorNote>{l.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Allowance and remaining life</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Allowance left" value={fmt(l.remainingMm / 25.4, 4)} unit="in"
            hint={`${fmt(l.remainingMm, 2)} mm`} />
          <Stat label="Remaining life"
            value={Number.isFinite(l.remainingYears) ? fmt(l.remainingYears, 1) : 'unbounded'}
            unit={Number.isFinite(l.remainingYears) ? 'years' : ''}
            accent={l.meetsDesignLife === false ? 'text-red-400' : 'text-emerald-400'} />
          <Stat label="Allowance the design life needs"
            value={l.requiredAllowanceMm === null ? '--' : fmt(l.requiredAllowanceMm / 25.4, 4)} unit="in" />
          <Stat label="Verdict"
            value={l.meetsDesignLife === null ? '--' : (l.meetsDesignLife ? 'MEETS' : 'SHORT')}
            accent={l.meetsDesignLife ? 'text-emerald-400' : 'text-red-400'}
            hint={l.shortfallMm > 0 ? `short by ${fmt(l.shortfallMm / 25.4, 4)} in` : undefined} />
        </div>
        <p className="text-[12px] text-slate-500">
          Remaining life is the allowance divided by the rate the mitigation actually delivers, not
          the datasheet rate. If the inhibitor availability is the thing failing the design life,
          fixing the injection system is cheaper than upgrading the metallurgy.
        </p>
      </CardContent>
    </Card>
  );
};

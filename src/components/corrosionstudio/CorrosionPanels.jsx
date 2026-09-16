// Corrosion studio panels: inputs, the rate with its factor chain,
// the velocity sweep chart, the H2S screen, and integrity.
//
// FC9-0. Three things changed on these screens and every one of them
// was a claim the studio could not support. The Sour Service tab used
// to be headed with a standard's name and to hand out named material
// guidance off a curve invented in the engine; that whole card is now a
// threshold comparison and a plain statement that region classification
// and material selection are not provided. The rate is now WITHHELD
// wherever the engine says its own model does not apply, instead of
// being printed in orange beside a sentence on another tab saying the
// model no longer describes the surface. And the velocity sweep marks
// the point where the inhibitor film stops surviving instead of drawing
// a smooth line through it.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCorrosion } from '@/contexts/CorrosionStudioContext';
import {
  fmt, Stat, ErrorNote, WarnNote, HeldNote, Field, NumberInput, TextInput, CATEGORY_ACCENT,
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
      <Field
        label="In-situ pH"
        hint="Not the sampled pH at surface: the pH the water has at line conditions. The pH correction is referenced to pH 4 and the studio refuses below it, because what the correlation does below its reference is not established here."
      >
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
      <Field
        label="Water cut (%)"
        hint={inputs.flow.flowRegime === 'intermittent'
          ? 'Scales the rate directly in this regime.'
          : 'Kept with the study and not used in this regime. Only the intermittent regime scales the rate by it.'}
      >
        <NumberInput section="flow" name="waterCutPct" />
      </Field>

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
  const withheld = result.withheld;
  return (
    <div className="space-y-4">
      {withheld && (
        <ErrorNote>
          <p className="font-semibold">Not graded: {withheld.what}</p>
          <p className="mt-1">{withheld.why}</p>
          {withheld.upperBoundMmYr !== null && withheld.upperBoundMmYr !== undefined && (
            <p className="mt-1">
              The CO2 rate below is retained as a stated upper bound of{' '}
              {fmt(withheld.upperBoundMmYr, 3)} mm/yr ({fmt(result.rateMpy, 1)} mpy), with no category
              and no remaining life.
            </p>
          )}
        </ErrorNote>
      )}

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Predicted rate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Corrosion rate" value={fmt(r.rateMmYr, 3)} unit="mm/yr"
              accent={withheld ? 'text-slate-100' : (CATEGORY_ACCENT[result.category] || 'text-slate-100')}
              hint={`${fmt(result.rateMpy, 1)} mpy, ${result.category || 'not graded'}`} />
            <Stat label="Uninhibited" value={fmt(r.uninhibitedMmYr, 3)} unit="mm/yr"
              hint={`${fmt(result.uninhibitedMpy, 1)} mpy, what the line does with no inhibitor at all`} />
            <Stat label="Effective inhibition"
              value={r.effectiveInhibitionPct === null ? 'not defined' : fmt(r.effectiveInhibitionPct, 1)}
              unit={r.effectiveInhibitionPct === null ? '' : '%'}
              accent={r.warning ? 'text-amber-400' : 'text-emerald-400'}
              hint={r.effectiveInhibitionPct === null
                ? 'there is no rate for an inhibitor to act on here'
                : `the datasheet figure is ${fmt(r.inhibitorShortfallPp + r.effectiveInhibitionPct, 1)} %`} />
            <Stat label="Controlled by" value={r.controlling || '--'}
              hint={r.controlling === 'comparable'
                ? 'the two resistances are within 10 percent of each other'
                : 'reaction kinetics or the rate mass transfer can supply'} />
          </div>
          {result.binding && (
            <div className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-[12px] text-slate-300">
              <span className="uppercase tracking-wider text-slate-500">Binding constraint</span>
              <span className="mx-2 text-slate-100 font-semibold">{result.binding.what}</span>
              {result.binding.valueLabel && (
                <span className="text-slate-400">({result.binding.valueLabel})</span>
              )}
              <p className="mt-1 text-slate-400">{result.binding.why}</p>
            </div>
          )}
          {r.warning && <WarnNote>{r.warning}</WarnNote>}
          {(result.notes || []).map((n) => (
            <p key={n.slice(0, 40)} className="text-[12px] text-slate-500">{n}</p>
          ))}
          {(result.clamps || []).map((c) => <WarnNote key={c}>{c}</WarnNote>)}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Where the number comes from</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="CO2 fugacity" value={fmt(r.fco2Bar, 3)} unit="bar"
              hint={`partial pressure ${fmt(r.pco2Bar, 2)} bar, coefficient ${fmt(r.fugacityCoefficient, 3)}. The rate is driven by the fugacity; the H2S screen and the film ratio use partial pressures, and no fugacity correction is applied to H2S.`} />
            <Stat label="Reaction rate" value={fmt(r.reactionMmYr, 2)} unit="mm/yr" />
            <Stat label="Mass transfer limit" value={fmt(r.massTransferMmYr, 2)} unit="mm/yr"
              hint="carries velocity and line size" />
            <Stat label="Combined" value={fmt(r.combinedMmYr, 2)} unit="mm/yr"
              hint="the two as resistances in series" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Stat label="Scale factor" value={fmt(r.scaleFactor, 3)}
              hint={r.scaleFactor < 1
                ? `protective iron carbonate is slowing it: the onset at this fugacity is ${fmt(r.scaleOnsetTC, 0)} C`
                : `no protective film credited below the onset, which at this fugacity is ${fmt(r.scaleOnsetTC, 0)} C and moves with it`} />
            <Stat label="pH factor" value={fmt(r.phFactor, 3)}
              hint={`referenced to pH ${fmt(r.phReference, 1)}`} />
            <Stat label="Water wetting" value={fmt(r.waterWettingFactor, 2)} />
            <Stat label="Pressure cap"
              value={r.pressureCapApplied ? 'applied' : 'not applied'}
              hint={`the fugacity correlation is held flat above ${fmt(r.pressureCapBar, 0)} bar`} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Wall shear and the inhibitor film</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Wall shear stress" value={fmt(result.shear.tauPa, 1)} unit="Pa"
              accent={result.shear.filmRisk === 'high' ? 'text-red-400'
                : (result.shear.filmRisk === 'moderate' ? 'text-yellow-400' : 'text-emerald-400')} />
            <Stat label="Film risk" value={result.shear.filmRisk}
              hint={`the stripping threshold used here is ${fmt(result.shear.filmStripThresholdPa, 0)} Pa and it is not sourced in the engine`} />
            <Stat label="Reynolds" value={fmt(result.shear.reynolds, 0)}
              hint={result.shear.flowRegime} />
            <Stat label="Rate with the datasheet credit"
              value={fmt(result.rateWithFilmCreditMmYr, 3)} unit="mm/yr"
              hint={result.filmStripped
                ? `${fmt(result.rateWithFilmCreditMpy, 1)} mpy. The rate above has the inhibitor credit REMOVED because the film is stripped at this shear.`
                : `${fmt(result.rateWithFilmCreditMpy, 1)} mpy, the same as the rate above because the film survives this shear`} />
          </div>
          {result.shear.warning && <WarnNote>{result.shear.warning}</WarnNote>}
          {result.shear.note && <WarnNote>{result.shear.note}</WarnNote>}
        </CardContent>
      </Card>

      <HeldNote notProvided={result.notProvided} limits={result.limits} />
    </div>
  );
};

export const SweepChart = () => {
  const { velocitySweep } = useCorrosion();
  if (velocitySweep.error) return <ErrorNote>{velocitySweep.error}</ErrorNote>;
  const refused = velocitySweep.rows.filter((r) => r.error);
  const data = velocitySweep.rows
    .filter((r) => !r.error && r.rateMmYr !== null)
    .map((r) => ({
      v: r.velocityFtS, rate: r.rateMmYr, uninhibited: r.uninhibitedMmYr,
    }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const strip = velocitySweep.strippingVelocityFtS;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Rate against velocity</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 ? <ErrorNote>No swept velocity produced a rate.</ErrorNote> : (
          <ChartFrame height={300} exportFilename="corrosion-velocity-sweep">
            <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 24, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis type="number" dataKey="v" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Velocity (ft/s)', position: 'insideBottom', offset: -8, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
                label={{ value: 'Rate (mm/yr)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 3), n]} labelFormatter={(v) => `${fmt(v, 1)} ft/s`} />
              <Legend verticalAlign="top" />
              {strip !== null && (
                <ReferenceLine x={strip} stroke="#dc2626" strokeDasharray="4 3"
                  label={{ value: 'inhibitor film stripped', fill: '#dc2626', fontSize: CHART_TYPOGRAPHY.axisFontSize, position: 'insideTopRight' }} />
              )}
              <Line dataKey="uninhibited" name="Uninhibited (mm/yr)" stroke="#d97706" strokeWidth={2} dot />
              <Line dataKey="rate" name="With inhibition (mm/yr)" stroke="#059669" strokeWidth={2} dot />
            </ComposedChart>
          </ChartFrame>
        )}
        {strip !== null && (
          <WarnNote>
            At {fmt(strip, 1)} ft/s and above the wall shear passes the threshold at which this
            studio takes the inhibitor film to be stripped, so the inhibitor credit is removed and
            the green line joins the orange one. That step is the film going, not the chemistry
            changing.
          </WarnNote>
        )}
        {refused.length > 0 && (
          <ErrorNote>
            {refused.length} swept {refused.length === 1 ? 'velocity' : 'velocities'} produced no rate:
            {' '}{refused[0].error}
          </ErrorNote>
        )}
        {velocitySweep.allZero ? (
          <p className="text-[12px] text-slate-500">
            Every swept velocity gives a rate of zero, because the wetting regime is
            {' '}{velocitySweep.flowRegime === 'oilWet' ? 'oil wet and the water wetting factor is zero' : 'set so that no water reaches the wall'}.
            That is an assumption in the input rather than a result, and it is the largest single
            lever in this model.
          </p>
        ) : (
          <p className="text-[12px] text-slate-500">
            The rate rises with velocity because mass transfer feeds the reaction faster, and it
            saturates where the kinetics take over. A model with a flat multiplier instead of a
            transfer term cannot draw this curve at all, which is why the same fluid in a bigger
            line used to look identical.
          </p>
        )}
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
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">H2S screening threshold</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="H2S partial pressure" value={fmt(s.ph2sPsia, 4)} unit="psia"
              hint={`${fmt(s.ph2sBar, 6)} bar`} />
            <Stat label="Against the threshold" value={s.sour ? 'above' : 'below'}
              accent={s.sour ? 'text-amber-400' : 'text-emerald-400'}
              hint={`the threshold used here is ${fmt(s.thresholdBar, 4)} bar, which is ${fmt(s.thresholdPsia, 6)} psia`} />
            <Stat label="Decades above the threshold"
              value={s.decadesAboveThreshold === null ? '--' : fmt(s.decadesAboveThreshold, 2)} />
          </div>
          <ErrorNote>
            <p className="font-semibold">This studio does not classify sour service severity and does not select materials.</p>
            <p className="mt-1">
              It used to. It drew severity regions from the H2S partial pressure and the pH, gave
              them a standard's name, and printed material guidance against each one. That curve
              was written here rather than read from the standard, and it has been withdrawn
              instead of adjusted. Nothing replaces it: a region and a material choice need the
              standard itself, not this screen.
            </p>
            <p className="mt-1">
              The threshold above is a screening comparison only, and the value of the threshold is
              not sourced in the engine either. Use it to decide whether the question arises, and
              take the question to the standard.
            </p>
          </ErrorNote>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Which film governs</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Stat label="H2S to CO2 ratio" value={g.ratio === null ? '--' : fmt(g.ratio, 5)}
              hint="both are partial pressures, so the ratio is the ratio of the mole fractions" />
            <Stat label="Regime" value={g.regime}
              accent={g.regime === 'sulphide' ? 'text-amber-400' : 'text-slate-100'} />
            <Stat label="Does the CO2 rate model apply"
              value={g.rateApplies === null ? 'not known' : (g.rateApplies ? 'yes' : 'no')}
              accent={g.rateApplies === false ? 'text-red-400' : 'text-slate-100'}
              hint={g.rateIsUpperBound ? 'as an upper bound only' : undefined} />
          </div>
          <p className="text-[12px] text-slate-500">{g.note}</p>
          <p className="text-[12px] text-slate-500">
            The two ratios that set these bands are not sourced in the engine. When the regime is
            sulphide the studio stops grading the rate and stops reporting a remaining life, and
            what is left on the rate tab is a stated upper bound.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export const IntegrityResults = () => {
  const { result } = useCorrosion();
  if (result.error) return <ErrorNote>{result.error}</ErrorNote>;
  const l = result.life;
  if (result.withheld) {
    return (
      <ErrorNote>
        <p className="font-semibold">No remaining life: {result.withheld.what}</p>
        <p className="mt-1">{result.withheld.why}</p>
      </ErrorNote>
    );
  }
  if (!l) return <ErrorNote>Enter a corrosion allowance to get a remaining life.</ErrorNote>;
  if (l.error) return <ErrorNote>{l.error}</ErrorNote>;
  const unbounded = l.remainingYears === null;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Allowance and remaining life</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Allowance left" value={fmt(l.remainingMm / 25.4, 4)} unit="in"
              hint={`${fmt(l.remainingMm, 2)} mm`} />
            <Stat label="Remaining life"
              value={unbounded ? 'not computed' : fmt(l.remainingYears, 1)}
              unit={unbounded ? '' : 'years'}
              accent={l.meetsDesignLife === false ? 'text-red-400'
                : (l.meetsDesignLife === true ? 'text-emerald-400' : 'text-slate-100')}
              hint={`at ${fmt(result.rateMpy, 1)} mpy`} />
            <Stat label="Allowance the design life needs"
              value={l.requiredAllowanceMm === null ? '--' : fmt(l.requiredAllowanceMm / 25.4, 4)} unit="in" />
            <Stat label="Verdict"
              value={l.meetsDesignLife === null ? 'not assessed' : (l.meetsDesignLife ? 'MEETS' : 'SHORT')}
              accent={l.meetsDesignLife === false ? 'text-red-400'
                : (l.meetsDesignLife === true ? 'text-emerald-400' : 'text-slate-100')}
              hint={l.shortfallMm > 0 ? `short by ${fmt(l.shortfallMm / 25.4, 4)} in` : undefined} />
          </div>
          {l.note && <WarnNote>{l.note}</WarnNote>}
          <p className="text-[12px] text-slate-500">
            Remaining life is the allowance divided by the rate the mitigation actually delivers,
            not the datasheet rate. If the inhibitor availability is the thing failing the design
            life, fixing the injection system is cheaper than upgrading the metallurgy.
          </p>
          <ErrorNote>
            This is the whole of what the studio computes for integrity. There is no inspection
            interval here, no minimum thickness and no retirement thickness, and no
            fitness-for-service assessment. Producing any of those means adopting a standard the
            engine does not carry, so it does not guess at one.
          </ErrorNote>
        </CardContent>
      </Card>

      <HeldNote notProvided={result.notProvided} limits={result.limits} />
    </div>
  );
};

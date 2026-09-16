// Rating (eps-NTU) and Air Cooler tabs.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useHeatExchanger } from '@/contexts/HeatExchangerContext';
import { fmt, Stat, ErrorNote, InfoNote, Field, NumberInput } from './fields';

export const RatingInputs = () => {
  const { inputs, setSection } = useHeatExchanger();
  return (
    <div className="space-y-4">
      <Field label="Arrangement">
        <Select value={inputs.rating.arrangement} onValueChange={(v) => setSection('rating', 'arrangement', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="counter">Counter-current</SelectItem>
            <SelectItem value="shell1">1 shell pass, 2 tube passes</SelectItem>
            <SelectItem value="parallel">Parallel flow</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Installed area (ft2)"><NumberInput section="rating" name="areaFt2" /></Field>
        <Field label="U (Btu/hr ft2 F)"><NumberInput section="rating" name="uBtuHrFt2F" /></Field>
      </div>
      <p className="text-[11px] text-slate-600">
        Rating answers the other question. The Sizing tab asks what area a duty needs; this tab
        asks what duty an exchanger you already own will deliver on these streams.
      </p>
    </div>
  );
};

export const RatingResults = () => {
  const { thermal, rating } = useHeatExchanger();
  if (thermal.error) return <ErrorNote>{thermal.error}</ErrorNote>;
  if (rating.error) return <ErrorNote>{rating.error}</ErrorNote>;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">What this exchanger delivers</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="NTU" value={fmt(rating.ntu, 2)} hint="UA over the smaller capacity rate" />
          <Stat label="Capacity ratio" value={fmt(thermal.cr, 3)} />
          <Stat label="Effectiveness" value={fmt(rating.effectiveness * 100, 1)} unit="%"
            hint={rating.ceiling === null
              ? 'of the thermodynamic maximum. Counter-current flow has no ceiling below 100 %'
              : `of the thermodynamic maximum. This arrangement cannot pass ${fmt(rating.ceiling * 100, 1)} % at any area`} />
          <Stat label="Duty delivered" value={fmt(rating.qBtuHr / 1e6, 2)} unit="MMBtu/hr" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Hot outlet" value={fmt(rating.thOut, 1)} unit="F" />
          <Stat label="Cold outlet" value={fmt(rating.tcOut, 1)} unit="F" />
          <Stat label="Maximum possible duty" value={fmt(rating.qMaxBtuHr / 1e6, 2)} unit="MMBtu/hr"
            hint="an infinitely large counter-current exchanger" />
          {Number.isFinite(rating.dutyVsDesign) && (
            <Stat label="Against the design duty" value={fmt(rating.dutyVsDesign * 100, 0)} unit="%"
              accent={rating.dutyVsDesign >= 1 ? 'text-emerald-400' : 'text-amber-400'}
              hint={rating.dutyVsDesign >= 1 ? 'meets the Sizing tab duty' : 'short of the Sizing tab duty'} />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const DraftTypeField = () => {
  const { inputs, setSection } = useHeatExchanger();
  return (
    <Field label="Draft type"
      hint="The fan handles ambient air in a forced-draft bay and the heated air leaving the bundle in an induced-draft one. The two differ by about 5 % on fan power, so the studio asks rather than taking a mean that belongs to neither.">
      <Select value={inputs.air.draftType} onValueChange={(v) => setSection('air', 'draftType', v)}>
        <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="forced">Forced draft (fan below the bundle)</SelectItem>
          <SelectItem value="induced">Induced draft (fan above the bundle)</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
};

export const CoolerInputs = () => (
  <div className="space-y-4">
    <Field label="Duty (MMBtu/hr)"><NumberInput section="air" name="qMMBtuHr" step="0.1" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Process in (F)"><NumberInput section="air" name="processInF" /></Field>
      <Field label="Process out (F)"><NumberInput section="air" name="processOutF" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Design ambient (F)"><NumberInput section="air" name="ambientF" /></Field>
      <Field label="Air rise (F)" hint="20 to 35 F is customary."><NumberInput section="air" name="airRiseF" /></Field>
    </div>
    <Field label="U (Btu/hr ft2 F)" hint="Bare-tube basis; finned-surface U values are much lower per finned foot.">
      <NumberInput section="air" name="uBtuHrFt2F" step="0.1" />
    </Field>
    <div className="grid grid-cols-3 gap-2">
      <Field label="Static (in H2O)"><NumberInput section="air" name="staticPressureInH2O" step="0.05" /></Field>
      <Field label="Fan eff"><NumberInput section="air" name="fanEfficiency" step="0.01" /></Field>
      <Field label="Motor eff"><NumberInput section="air" name="motorEfficiency" step="0.01" /></Field>
    </div>
    <DraftTypeField />
    <Field label="Barometric pressure (psia)"
      hint="Air density sets the duty of this machine, so elevation belongs here. 14.7 psia is sea level.">
      <NumberInput section="air" name="barometricPsia" step="0.1" />
    </Field>
    <Field label="Hot-day ambient to check (F)" hint="The design ambient is exceeded some days; this is what limits the plant then.">
      <NumberInput section="air" name="checkAmbientF" />
    </Field>
  </div>
);

export const CoolerResults = () => {
  const { cooler } = useHeatExchanger();
  if (cooler.error) return <ErrorNote>{cooler.error}</ErrorNote>;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Air cooler at the design ambient</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="LMTD" value={fmt(cooler.lmtdF, 1)} unit="F" />
            <Stat label="Bare-tube area" value={fmt(cooler.areaFt2, 0)} unit="ft2" />
            <Stat label="Air outlet" value={fmt(cooler.airOutF, 1)} unit="F"
              hint="the design ambient plus the air rise" />
            <Stat label="Air flow" value={fmt(cooler.acfm, 0)} unit="ACFM"
              hint={`${fmt(cooler.airLbHr / 1000, 0)} klb/hr at ${fmt(cooler.airDensityLbFt3, 4)} lb/ft3`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <Stat label="Fan power" value={fmt(cooler.fanBhp, 1)} unit="bhp"
              hint={`${fmt(cooler.motorHp, 1)} hp at the motor`} />
            <Stat label="Fan inlet air" value={fmt(cooler.fanInletF, 1)} unit="F"
              hint={`${cooler.draftType} draft, at ${fmt(cooler.barometricPsia, 1)} psia`} />
          </div>
          <InfoNote>{cooler.fNote}</InfoNote>
        </CardContent>
      </Card>

      {cooler.hotDay && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">On a hot day</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cooler.hotDay.error ? <ErrorNote>{cooler.hotDay.error}</ErrorNote> : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Ambient" value={fmt(cooler.hotDay.ambientF, 0)} unit="F"
                    hint={cooler.hotDay.regime} />
                  <Stat label={cooler.hotDay.dutyFraction > 1 ? 'Capacity available' : 'Capacity retained'}
                    value={fmt(cooler.hotDay.dutyFraction * 100, 0)} unit="%"
                    accent={cooler.hotDay.dutyFraction > 1
                      ? 'text-sky-400'
                      : (cooler.hotDay.dutyFraction < 0.85 ? 'text-amber-400' : 'text-emerald-400')} />
                  <Stat label="Duty then" value={fmt(cooler.hotDay.qBtuHr / 1e6, 2)} unit="MMBtu/hr" />
                  <Stat label="Process leaves at" value={fmt(cooler.hotDay.processOutF, 1)} unit="F"
                    accent={cooler.hotDay.designOutletReached ? 'text-emerald-400' : 'text-amber-400'}
                    hint={cooler.hotDay.designOutletReached
                      ? 'the design outlet still holds'
                      : 'above the design outlet'} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Stat label="Air rise then" value={fmt(cooler.hotDay.airRiseF, 1)} unit="F"
                    hint={`air leaves at ${fmt(cooler.hotDay.airOutF, 1)} F`} />
                  <Stat label="LMTD then" value={fmt(cooler.hotDay.lmtdF, 1)} unit="F" />
                  <Stat label="Effectiveness held" value={fmt(cooler.hotDay.effectiveness * 100, 1)} unit="%"
                    hint={`NTU ${fmt(cooler.hotDay.ntu, 2)}, Cr ${fmt(cooler.hotDay.cr, 2)}`} />
                  <Stat label="UA held" value={fmt(cooler.hotDay.uaBtuHrF / 1000, 1)} unit="kBtu/hr F" />
                </div>
                {cooler.hotDay.note && <InfoNote>{cooler.hotDay.note}</InfoNote>}
                <p className="text-[12px] text-slate-500">
                  Same bundle, same fans, so the surface and the air mass are what stay fixed. That
                  fixes NTU and the capacity ratio, and therefore the effectiveness, whatever the
                  arrangement. The duty then follows from the inlet temperature difference alone,
                  and the process leaves warmer and the air rises less. This is the number that
                  limits the plant in August, and it is why an air cooler is chosen on the hot day
                  rather than the average one.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

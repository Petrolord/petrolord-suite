// Sweetening and dew point tabs.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGasProcessing, nonFiniteNote } from '@/contexts/GasProcessingContext';
import {
  fmt, accentFor, Stat, ErrorNote, WarnNote, Field, NumberInput,
} from './fields';

export const SweeteningInputs = () => {
  const { inputs, setSection, amines } = useGasProcessing();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gas rate (MMscfd)"><NumberInput section="amine" name="gasMMscfd" step="0.1" /></Field>
        <Field label="Pressure (psia)"><NumberInput section="amine" name="pPsia" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="CO2 in (mol %)"><NumberInput section="amine" name="co2MolPct" step="0.1" /></Field>
        <Field label="CO2 spec (mol %)"><NumberInput section="amine" name="co2SpecMolPct" step="0.1" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="H2S in (mol %)"><NumberInput section="amine" name="h2sMolPct" step="0.01" /></Field>
        <Field label="H2S spec (mol %)" hint="4 ppmv pipeline custom is 0.0004."><NumberInput section="amine" name="h2sSpecMolPct" step="0.0001" /></Field>
      </div>
      <Field label="Amine">
        <Select value={inputs.amine.amineId} onValueChange={(v) => setSection('amine', 'amineId', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {amines.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.id} (typical {a.wtPctTypical} wt %, rich to {a.maxLoading})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Strength (wt %)"><NumberInput section="amine" name="amineWtPct" /></Field>
        <Field label="Lean loading"><NumberInput section="amine" name="leanLoading" step="0.01" /></Field>
        <Field label="Rich loading"><NumberInput section="amine" name="richLoading" step="0.01" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Duty (Btu/gal)" hint="Customary values offered per amine; type your own.">
          <NumberInput section="amine" name="dutyBtuPerGal" />
        </Field>
        <Field label="Contactor K (ft/s)"><NumberInput section="amine" name="ksFtS" step="0.01" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Temperature (F)"><NumberInput section="amine" name="tF" /></Field>
        <Field label="Gas gravity"><NumberInput section="amine" name="gasSg" step="0.01" /></Field>
      </div>
    </div>
  );
};

export const SweeteningResults = () => {
  const { sweetening: s } = useGasProcessing();
  if (s.error) return <ErrorNote>{s.error}</ErrorNote>;
  const broken = nonFiniteNote(s.nonFinite);
  // The column on this tab holds amine solution. Until the engine reads
  // the liquid density this studio passes it, it sizes every contactor
  // against glycol, so the screen names the liquid the number came from
  // rather than the one it was asked for (FC4 findings F-C4, F-U1).
  const wrongLiquid = Number.isFinite(s.liquidAsked) && Number.isFinite(s.liquidUsed)
    && Math.abs(s.liquidUsed - s.liquidAsked) > 1e-6 * s.liquidAsked;
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Amine unit</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Acid gas picked up" value={fmt(s.acidMolesDay, 0)} unit="lbmol/day" />
          <Stat label="Circulation" value={fmt(s.circGpm, 0)} unit="gpm"
            accent={accentFor(s.circGpm)} />
          <Stat label="Rich loading" value={fmt(s.richLoadingUsed, 2)} unit="mol/mol" />
          <Stat label="Reboiler duty" value={fmt(s.reboilerMMBtuHr, 1)} unit="MMBtu/hr"
            accent={accentFor(s.reboilerMMBtuHr)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Contactor diameter"
            value={s.contactor?.error ? '--' : fmt(s.contactor.diameterFt, 1)} unit="ft"
            accent={s.contactor?.error ? 'text-amber-400' : accentFor(s.contactor?.diameterFt)}
            hint={s.contactor?.error
              || `Souders-Brown at z = ${fmt(s.contactor?.z, 3)}, against a liquid at ${fmt(s.liquidUsed, 1)} lb/ft3`} />
        </div>
        {broken && <ErrorNote>{broken}</ErrorNote>}
        {wrongLiquid && (
          <WarnNote>
            {`The diameter above was sized against a liquid at ${fmt(s.liquidUsed, 1)} lb/ft3, which is the glycol a dehydration contactor holds. The ${s.amineLabel || 'amine'} solution in this column is ${fmt(s.liquidAsked, 1)} lb/ft3. A lighter liquid allows a lower gas velocity, so the column this service needs is wider than the one above. Treat the figure as a lower bound until the sizing reads the solution density.`}
          </WarnNote>
        )}
        {s.zWarning && <WarnNote>{s.zWarning}</WarnNote>}
        {s.warning && <WarnNote>{s.warning}</WarnNote>}
        <p className="text-[12px] text-slate-500">
          A mole balance sets the circulation floor; real absorber performance (selectivity,
          approach to equilibrium, stage efficiency) needs rate-based simulation. Treat this as
          the screening bound it is.
        </p>
      </CardContent>
    </Card>
  );
};

export const DewpointInputs = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
      <Field label="Upstream pressure (psia)"><NumberInput section="dewpoint" name="p1Psia" /></Field>
      <Field label="Downstream pressure (psia)"><NumberInput section="dewpoint" name="p2Psia" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Upstream temperature (F)"><NumberInput section="dewpoint" name="tF" /></Field>
      <Field label="Gas gravity"><NumberInput section="dewpoint" name="gasSg" step="0.01" /></Field>
    </div>
    <Field label="Cp (Btu/lbmol F)" hint="About 9 to 12 for lean natural gas at field conditions.">
      <NumberInput section="dewpoint" name="cpBtuLbmolF" step="0.1" />
    </Field>
  </div>
);

export const DewpointResults = () => {
  const { dewpoint: d } = useGasProcessing();
  if (d.error) return <ErrorNote>{d.error}</ErrorNote>;
  const broken = nonFiniteNote(d.nonFinite);
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Joule-Thomson screening</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="JT coefficient at the inlet" value={fmt(d.muFPerPsi * 100, 1)} unit="F/100 psi"
            accent={accentFor(d.muFPerPsi)}
            hint="from the DAK z-factor's own temperature derivative at the upstream pressure; the march below re-reads it at twenty pressures along the let-down" />
          {Number.isFinite(d.muMeanFPerPsi) && (
            <Stat label="JT coefficient, mean over the drop"
              value={fmt(d.muMeanFPerPsi * 100, 1)} unit="F/100 psi"
              accent={accentFor(d.muMeanFPerPsi)}
              hint="the cooling divided by the pressure drop, which is the coefficient the march actually delivered" />
          )}
          {d.dropError ? (
            <Stat label="Drop" value="--" hint={d.dropError} accent="text-amber-400" />
          ) : (
            <>
              <Stat label="Cooling across the drop" value={fmt(d.dropF, 1)} unit="F"
                accent={accentFor(d.dropF)} />
              <Stat label="Downstream temperature" value={fmt(d.t2F, 1)} unit="F"
                accent={accentFor(d.t2F)} />
              <Stat label="Water the cold gas can hold"
                value={d.waterAtOutlet?.error ? '--' : fmt(d.waterAtOutlet.lbPerMMscf, 1)} unit="lb/MMscf"
                accent={d.waterAtOutlet?.error ? 'text-amber-400' : accentFor(d.waterAtOutlet?.lbPerMMscf)}
                hint={d.waterAtOutlet?.error || 'anything above this condenses at the cold spot'} />
            </>
          )}
        </div>
        {broken && <ErrorNote>{broken}</ErrorNote>}
        {d.warning && <WarnNote>{d.warning}</WarnNote>}
        {d.zWarning && <WarnNote>{d.zWarning}</WarnNote>}
        <p className="text-[12px] text-slate-500">
          A JT drop is where hydrates form: the cold spot sits right where free water appears.
          Screen the hydrate margin in the Production module's Flow Assurance Studio, which owns
          that question.
        </p>
      </CardContent>
    </Card>
  );
};

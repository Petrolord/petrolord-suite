// Sweetening and dew point tabs.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGasProcessing } from '@/contexts/GasProcessingContext';
import { fmt, Stat, ErrorNote, WarnNote, Field, NumberInput } from './fields';

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
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Amine unit</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Acid gas picked up" value={fmt(s.acidMolesDay, 0)} unit="lbmol/day" />
          <Stat label="Circulation" value={fmt(s.circGpm, 0)} unit="gpm" />
          <Stat label="Rich loading" value={fmt(s.richLoadingUsed, 2)} unit="mol/mol" />
          <Stat label="Reboiler duty" value={fmt(s.reboilerMMBtuHr, 1)} unit="MMBtu/hr" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Contactor diameter"
            value={s.contactor?.error ? '--' : fmt(s.contactor.diameterFt, 1)} unit="ft"
            hint={s.contactor?.error || `Souders-Brown at z = ${fmt(s.contactor?.z, 3)}`} />
        </div>
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
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Joule-Thomson screening</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="JT coefficient" value={fmt(d.muFPerPsi * 100, 1)} unit="F/100 psi"
            hint="derived from the DAK z-factor's temperature derivative, not assumed" />
          {d.dropError ? (
            <Stat label="Drop" value="--" hint={d.dropError} accent="text-amber-400" />
          ) : (
            <>
              <Stat label="Cooling across the drop" value={fmt(d.dropF, 1)} unit="F" />
              <Stat label="Downstream temperature" value={fmt(d.t2F, 1)} unit="F" />
              <Stat label="Water the cold gas can hold"
                value={d.waterAtOutlet?.error ? '--' : fmt(d.waterAtOutlet.lbPerMMscf, 1)} unit="lb/MMscf"
                hint="anything above this condenses at the cold spot" />
            </>
          )}
        </div>
        <p className="text-[12px] text-slate-500">
          A JT drop is where hydrates form: the cold spot sits right where free water appears.
          Screen the hydrate margin in the Production module's Flow Assurance Studio, which owns
          that question.
        </p>
      </CardContent>
    </Card>
  );
};

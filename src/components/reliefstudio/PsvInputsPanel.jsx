// Left rail, PSV tab: the scenario and its inputs.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useRelief } from '@/contexts/ReliefStudioContext';
import { Field, NumberInput } from './fields';

const GasFields = () => (
  <>
    <Field label="Relief load (lb/hr)"><NumberInput section="gas" name="wLbHr" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Set pressure (psig)"><NumberInput section="gas" name="setPsig" /></Field>
      <Field label="Overpressure (%)"><NumberInput section="gas" name="overpressurePct" /></Field>
    </div>
    <Field label="Back pressure (psig)" hint="Above 30 percent of relieving pressure a balanced-bellows valve needs its chart Kb, typed below.">
      <NumberInput section="gas" name="backPsig" />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Temperature (F)"><NumberInput section="gas" name="tF" /></Field>
      <Field label="Molecular weight"><NumberInput section="gas" name="mw" step="0.1" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="z"><NumberInput section="gas" name="z" step="0.01" /></Field>
      <Field label="k (Cp/Cv)"><NumberInput section="gas" name="k" step="0.01" /></Field>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Field label="Kd"><NumberInput section="gas" name="kd" step="0.001" /></Field>
      <Field label="Kb"><NumberInput section="gas" name="kb" step="0.01" /></Field>
      <Field label="Kc"><NumberInput section="gas" name="kc" step="0.01" /></Field>
    </div>
  </>
);

const LiquidFields = () => (
  <>
    <Field label="Relief rate (gpm)"><NumberInput section="liquid" name="qGpm" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Set pressure (psig)"><NumberInput section="liquid" name="setPsig" /></Field>
      <Field label="Overpressure (%)"><NumberInput section="liquid" name="overpressurePct" /></Field>
    </div>
    <Field label="Back pressure (psig)"><NumberInput section="liquid" name="backPsig" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Specific gravity"><NumberInput section="liquid" name="sg" step="0.01" /></Field>
      <Field label="Viscosity (cp)"><NumberInput section="liquid" name="muCp" step="0.1" /></Field>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Field label="Kd"><NumberInput section="liquid" name="kd" step="0.001" /></Field>
      <Field label="Kw"><NumberInput section="liquid" name="kw" step="0.01" /></Field>
      <Field label="Kc"><NumberInput section="liquid" name="kc" step="0.01" /></Field>
    </div>
  </>
);

const SteamFields = () => (
  <>
    <Field label="Steam flow (lb/hr)"><NumberInput section="steam" name="wLbHr" /></Field>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Set pressure (psig)"><NumberInput section="steam" name="setPsig" /></Field>
      <Field label="Overpressure (%)"><NumberInput section="steam" name="overpressurePct" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="KSH (superheat)" hint="1.0 saturated; superheated values come from the API 520 table."><NumberInput section="steam" name="ksh" step="0.01" /></Field>
      <Field label="Kd"><NumberInput section="steam" name="kd" step="0.001" /></Field>
    </div>
  </>
);

const FireFields = () => {
  const { inputs, setSection } = useRelief();
  return (
    <>
      <Field label="Vessel orientation">
        <Select value={inputs.fire.orientation} onValueChange={(v) => setSection('fire', 'orientation', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal">Horizontal</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Diameter (ft)"><NumberInput section="fire" name="diameterFt" step="0.1" /></Field>
        <Field label="Length (ft)"><NumberInput section="fire" name="lengthFt" step="0.1" /></Field>
        <Field label="Liquid level (ft)"><NumberInput section="fire" name="liquidLevelFt" step="0.1" /></Field>
      </div>
      <Field label="Drainage and firefighting">
        <Select value={inputs.fire.adequateDrainage} onValueChange={(v) => setSection('fire', 'adequateDrainage', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Adequate (Q = 21000 F A^0.82)</SelectItem>
            <SelectItem value="no">Not adequate (Q = 34500 F A^0.82)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Environment factor F" hint="1.0 bare vessel; insulation credits come from the API 521 table.">
          <NumberInput section="fire" name="envFactor" step="0.01" />
        </Field>
        <Field label="Latent heat (Btu/lb)"><NumberInput section="fire" name="latentBtuLb" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Set pressure (psig)"><NumberInput section="fire" name="setPsig" /></Field>
        <Field label="Overpressure (%)" hint="21 percent is the fire-case allowance."><NumberInput section="fire" name="overpressurePct" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Temp (F)"><NumberInput section="fire" name="tF" /></Field>
        <Field label="MW"><NumberInput section="fire" name="mw" step="0.1" /></Field>
        <Field label="k"><NumberInput section="fire" name="k" step="0.01" /></Field>
      </div>
    </>
  );
};

const PsvInputsPanel = () => {
  const { inputs, setScenario } = useRelief();
  return (
    <div className="space-y-4">
      <Field label="Scenario">
        <Select value={inputs.scenario} onValueChange={setScenario}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gas">Gas / vapor</SelectItem>
            <SelectItem value="liquid">Liquid</SelectItem>
            <SelectItem value="steam">Steam</SelectItem>
            <SelectItem value="fire">Fire (API 521 wetted area)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {inputs.scenario === 'gas' && <GasFields />}
      {inputs.scenario === 'liquid' && <LiquidFields />}
      {inputs.scenario === 'steam' && <SteamFields />}
      {inputs.scenario === 'fire' && <FireFields />}
    </div>
  );
};

export default PsvInputsPanel;

// The fluid for the active sizing mode (left rail, Sizing tab).
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { Field, NumberInput } from './fields';

const ModeSelect = () => {
  const { inputs, setMode } = useLineSizing();
  return (
    <Field label="Line service">
      <Select value={inputs.mode} onValueChange={setMode}>
        <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="liquid">Liquid (single phase)</SelectItem>
          <SelectItem value="gas">Gas (single phase)</SelectItem>
          <SelectItem value="multiphase">Multiphase (Beggs &amp; Brill)</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
};

const LiquidFields = () => {
  const { inputs, setSection } = useLineSizing();
  return (
    <>
      <Field label="Liquid rate (bpd)"><NumberInput section="liquid" name="qBpd" /></Field>
      <Field label="Density from">
        <Select value={inputs.liquid.rhoMode} onValueChange={(v) => setSection('liquid', 'rhoMode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="api">API gravity</SelectItem>
            <SelectItem value="direct">Density directly</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {inputs.liquid.rhoMode === 'api' ? (
        <Field label="Oil gravity (API)"><NumberInput section="liquid" name="oilApi" step="0.1" /></Field>
      ) : (
        <Field label="Density (lb/ft3)"><NumberInput section="liquid" name="rhoLbFt3" step="0.1" /></Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Viscosity (cp)"><NumberInput section="liquid" name="muCp" step="0.1" /></Field>
        <Field label="Velocity limit (ft/s)"><NumberInput section="liquid" name="maxVFtS" /></Field>
      </div>
    </>
  );
};

const GasFields = () => {
  const { inputs, setSection, gasEquations } = useLineSizing();
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Gas rate (MMscfd)"><NumberInput section="gas" name="qMMscfd" step="0.1" /></Field>
        <Field label="Inlet pressure (psia)"><NumberInput section="gas" name="p1Psia" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Flowing temperature (F)"><NumberInput section="gas" name="tAvgF" /></Field>
        <Field label="Gas gravity (air = 1)"><NumberInput section="gas" name="sg" step="0.01" /></Field>
      </div>
      <Field
        label="Flow equation"
        hint="Weymouth undersizes long lines and Panhandle flatters short ones; they are different fits, not one truth."
      >
        <Select value={inputs.gas.equation} onValueChange={(v) => setSection('gas', 'equation', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            {gasEquations.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Efficiency E"><NumberInput section="gas" name="efficiency" step="0.01" /></Field>
        <Field label="Gas viscosity (cp)"><NumberInput section="gas" name="muCp" step="0.001" /></Field>
      </div>
      <Field label="z-factor">
        <Select value={inputs.gas.zMode} onValueChange={(v) => setSection('gas', 'zMode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">From DAK at inlet conditions</SelectItem>
            <SelectItem value="manual">Type an average z</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {inputs.gas.zMode === 'manual' && (
        <Field label="Average z"><NumberInput section="gas" name="zAvg" step="0.01" /></Field>
      )}
    </>
  );
};

const MultiphaseFields = () => (
  <>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Liquid rate (bpd)"><NumberInput section="multiphase" name="qLiquidBpd" /></Field>
      <Field label="Water cut (%)"><NumberInput section="multiphase" name="wctPct" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Gas rate (MMscfd)"><NumberInput section="multiphase" name="qGasMMscfd" step="0.1" /></Field>
      <Field label="Line pressure (psia)"><NumberInput section="multiphase" name="pPsia" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Temperature (F)"><NumberInput section="multiphase" name="tF" /></Field>
      <Field label="Oil gravity (API)"><NumberInput section="multiphase" name="oilApi" step="0.1" /></Field>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Water SG"><NumberInput section="multiphase" name="waterSg" step="0.01" /></Field>
      <Field label="Gas gravity"><NumberInput section="multiphase" name="gasSg" step="0.01" /></Field>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Field label="Oil visc (cp)"><NumberInput section="multiphase" name="muOilCp" step="0.1" /></Field>
      <Field label="Water visc"><NumberInput section="multiphase" name="muWaterCp" step="0.1" /></Field>
      <Field label="Gas visc"><NumberInput section="multiphase" name="muGasCp" step="0.001" /></Field>
    </div>
    <Field label="Surface tension (dyn/cm)"><NumberInput section="multiphase" name="sigmaLDynCm" /></Field>
    <p className="text-[11px] text-slate-600">
      Rates are taken at line conditions: the dead-liquid case downstream of separation.
      A live-oil line upstream of separation belongs in the Production module's Flow
      Assurance Studio, which carries full PVT.
    </p>
  </>
);

const FluidPanel = () => {
  const { inputs } = useLineSizing();
  return (
    <div className="space-y-4">
      <ModeSelect />
      {inputs.mode === 'liquid' && <LiquidFields />}
      {inputs.mode === 'gas' && <GasFields />}
      {inputs.mode === 'multiphase' && <MultiphaseFields />}
    </div>
  );
};

export default FluidPanel;

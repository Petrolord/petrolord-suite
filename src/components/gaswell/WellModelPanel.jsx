// The gas well studio's well model tab, over the SHARED well model
// panel (P6.5) plus the gas inflow this studio needs.
//
// This is the first studio built on the shared record from the start
// rather than carrying its own copy of it, which is what that phase
// was for.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { Field, NumberInput } from './fields';

const GasInflowFields = () => {
  const { inputs, setSection } = useGasWell();
  const g = inputs.gasInflow;
  return (
    <div className="border-t border-slate-800 pt-3 space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Gas inflow</p>
      <Field
        label="Deliverability model"
        hint="Reservoir pressure, gas gravity and bottomhole temperature come from the sections above: a well described once is described once."
      >
        <Select value={g.model} onValueChange={(v) => setSection('gasInflow', 'model', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="backPressure">Back pressure (Rawlins and Schellhardt)</SelectItem>
            <SelectItem value="lit">Laminar-inertial-turbulent (Houpeurt)</SelectItem>
            <SelectItem value="darcy">Pseudo-pressure deliverability (Darcy)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {g.model === 'backPressure' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="C (Mscf/d/psi2n)"><NumberInput section="gasInflow" name="c" step="0.0001" /></Field>
          <Field label="n"><NumberInput section="gasInflow" name="n" step="0.01" /></Field>
        </div>
      )}
      {g.model === 'lit' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="a (psi2/(Mscf/d))"><NumberInput section="gasInflow" name="a" /></Field>
          <Field label="b (psi2/(Mscf/d)2)"><NumberInput section="gasInflow" name="b" step="0.0001" /></Field>
        </div>
      )}
      {g.model === 'darcy' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Permeability (md)"><NumberInput section="gasInflow" name="k" step="0.1" /></Field>
            <Field label="Net pay (ft)"><NumberInput section="gasInflow" name="h" /></Field>
            <Field label="Drainage radius (ft)"><NumberInput section="gasInflow" name="re" /></Field>
            <Field label="Wellbore radius (ft)"><NumberInput section="gasInflow" name="rw" step="0.01" /></Field>
            <Field label="Skin"><NumberInput section="gasInflow" name="skin" step="0.1" /></Field>
            <Field label="Non-Darcy D (1/(Mscf/d))"><NumberInput section="gasInflow" name="dNonDarcy" step="0.00001" /></Field>
          </div>
          <p className="text-[11px] text-slate-600">
            The pseudo-pressure route runs on real-gas m(p) rather than pressure squared, so it
            stays honest at high pressure where the squared form drifts.
          </p>
        </>
      )}
    </div>
  );
};

const WellModelPanel = () => {
  const { inputs, setSection } = useGasWell();
  return (
    <div className="space-y-4">
      <Field
        label="Well phase"
        hint="The record carries both inflows, so switching phase does not lose what was already entered."
      >
        <Select value={inputs.well.phase} onValueChange={(v) => setSection('well', 'phase', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="gas">Gas well</SelectItem>
            <SelectItem value="oil">Oil well</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <SharedWellModelPanel
        inputs={inputs}
        setSection={setSection}
        showCompletion
        depthLabel="Perforation depth (ft TVD)"
        depthHint="The node depth, entered once. The gas column is marched from the wellhead down to here."
        fluidNote="Gas gravity drives the column weight and the droplet balance. The oil gas-oil ratio is not used on a gas well."
      />
      <GasInflowFields />
    </div>
  );
};

export default WellModelPanel;

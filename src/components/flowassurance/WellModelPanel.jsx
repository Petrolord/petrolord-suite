// The flow assurance studio's well model tab, over the SHARED panel
// (P6.5). Both phases: a subsea tieback does not care which, and the
// record's phase decides the inflow without the user restating it.
import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Field, NumberInput } from './fields';

const GasInflowFields = () => {
  const { inputs, setSection } = useFlowAssurance();
  const g = inputs.gasInflow;
  return (
    <div className="border-t border-slate-800 pt-3 space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Gas inflow</p>
      <Field label="Deliverability model">
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
          <Field label="C"><NumberInput section="gasInflow" name="c" step="0.0001" /></Field>
          <Field label="n"><NumberInput section="gasInflow" name="n" step="0.01" /></Field>
        </div>
      )}
      {g.model === 'lit' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="a"><NumberInput section="gasInflow" name="a" /></Field>
          <Field label="b"><NumberInput section="gasInflow" name="b" step="0.0001" /></Field>
        </div>
      )}
      {g.model === 'darcy' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Permeability (md)"><NumberInput section="gasInflow" name="k" step="0.1" /></Field>
          <Field label="Net pay (ft)"><NumberInput section="gasInflow" name="h" /></Field>
          <Field label="Drainage radius (ft)"><NumberInput section="gasInflow" name="re" /></Field>
          <Field label="Wellbore radius (ft)"><NumberInput section="gasInflow" name="rw" step="0.01" /></Field>
          <Field label="Skin"><NumberInput section="gasInflow" name="skin" step="0.1" /></Field>
          <Field label="Non-Darcy D"><NumberInput section="gasInflow" name="dNonDarcy" step="0.00001" /></Field>
        </div>
      )}
    </div>
  );
};

const WellModelPanel = () => {
  const { inputs, setSection } = useFlowAssurance();
  const isGas = inputs.well.phase === 'gas';
  return (
    <div className="space-y-4">
      <Field
        label="Well phase"
        hint="Decides the inflow and which duty inputs apply. The pipe legs are the same either way."
      >
        <Select value={inputs.well.phase} onValueChange={(v) => setSection('well', 'phase', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="oil">Oil well</SelectItem>
            <SelectItem value="gas">Gas well</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <SharedWellModelPanel
        inputs={inputs}
        setSection={setSection}
        showCompletion
        depthLabel="Perforation depth (ft TVD)"
        depthHint="The node depth, entered once. The trace starts here."
        fluidNote="The flowing temperature profile here is what the wellbore leg of the trace uses. It is an input, the same one every other production studio sees, not a wellbore heat-transfer solution: the thermal model in this studio governs the flowline."
      />
      {isGas && <GasInflowFields />}
    </div>
  );
};

export default WellModelPanel;

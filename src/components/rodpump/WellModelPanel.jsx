// Well model inputs (left rail, Well Model tab). A rod pump is sized
// against a well: the intake pressure comes off this inflow, and the
// submergence it leaves is what decides both the fluid load and whether
// the barrel fills at all.
import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { Field, NumberInput } from './fields';

const WellModelPanel = () => {
  const { inputs, setSection } = useRodPump();
  const { well, inflow } = inputs;

  return (
    <div className="space-y-4">
      <Field label="Trajectory">
        <Select value={well.mode} onValueChange={(v) => setSection('well', 'mode', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="vertical">Vertical</SelectItem>
            <SelectItem value="deviated">Deviated survey</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {well.mode === 'vertical' ? (
        <Field
          label="Perforation depth (ft TVD)"
          hint="The node depth, entered once. The intake pressure is worked back from here, so it is never a second number that can drift."
        >
          <NumberInput section="well" name="depthFt" />
        </Field>
      ) : (
        <Field
          label="Survey (md, inc, azi)"
          hint="One station per line. Rod strings and pump depths are worked in TVD."
        >
          <Textarea
            rows={4}
            value={well.surveyText}
            onChange={(e) => setSection('well', 'surveyText', e.target.value)}
            className="bg-slate-800 border-slate-700 font-mono text-xs"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Wellhead temp (F)"><NumberInput section="well" name="whtF" /></Field>
        <Field label="Bottomhole temp (F)"><NumberInput section="well" name="bhtF" /></Field>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Fluid</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Oil API"><NumberInput section="fluid" name="api" /></Field>
          <Field label="Gas gravity"><NumberInput section="fluid" name="gasSg" step="0.01" /></Field>
          <Field label="Producing GOR (scf/stb)"><NumberInput section="fluid" name="gor" /></Field>
          <Field label="Salinity (ppm)"><NumberInput section="fluid" name="salinityPpm" /></Field>
        </div>
        <p className="text-[11px] text-slate-600">
          The gas-oil ratio matters here for one reason: the free gas at intake conditions is what
          keeps liquid out of the barrel.
        </p>
      </div>

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Inflow</p>
        <Field label="IPR model">
          <Select value={inflow.model} onValueChange={(v) => setSection('inflow', 'model', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="composite">Composite (Vogel below bubble point)</SelectItem>
              <SelectItem value="pi">Straight-line productivity index</SelectItem>
              <SelectItem value="vogel">Vogel</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reservoir pressure (psia)"><NumberInput section="inflow" name="pr" /></Field>
          <Field label="Bubble point (psia)"><NumberInput section="inflow" name="pb" /></Field>
        </div>
        <Field label="Calibration">
          <Select value={inflow.calMode} onValueChange={(v) => setSection('inflow', 'calMode', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="pi">Productivity index</SelectItem>
              <SelectItem value="qmax">Absolute open flow</SelectItem>
              <SelectItem value="test">A production test</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {inflow.calMode === 'pi' && (
          <Field label="PI (stb/d/psi)"><NumberInput section="inflow" name="pi" step="0.01" /></Field>
        )}
        {inflow.calMode === 'qmax' && (
          <Field label="Qmax (stb/d)"><NumberInput section="inflow" name="qmax" /></Field>
        )}
        {inflow.calMode === 'test' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Test rate (stb/d)"><NumberInput section="inflow" name="testQ" /></Field>
            <Field label="Test pwf (psia)"><NumberInput section="inflow" name="testPwf" /></Field>
          </div>
        )}
      </div>
    </div>
  );
};

export default WellModelPanel;

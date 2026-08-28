// Well model inputs (left rail, Well Model tab). An ESP is sized
// against a well, not against a rate: the intake pressure comes off
// this IPR and the discharge pressure comes off a traverse through this
// completion, so the whole nodal description is a first-class panel
// rather than a set of buried constants.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useEsp } from '@/contexts/EspDesignContext';

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

const NumberInput = ({ section, name, step = 'any', ...rest }) => {
  const { inputs, setSection } = useEsp();
  return (
    <Input
      type="number"
      step={step}
      value={inputs[section][name] ?? ''}
      onChange={(e) => setSection(section, name, e.target.value)}
      className="h-9 bg-slate-800 border-slate-700"
      {...rest}
    />
  );
};

const WellModelPanel = () => {
  const { inputs, setSection } = useEsp();
  const { well, inflow, completion } = inputs;

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
          hint="The node depth. This is the perforation depth the intake pressure is worked back from, so it is entered once and used everywhere."
        >
          <NumberInput section="well" name="depthFt" />
        </Field>
      ) : (
        <Field
          label="Survey (md, inc, azi)"
          hint="One station per line. The pump depth is entered in TVD and converted to measured depth for the traverse."
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
          The gas-oil ratio is the produced one. What the pump swallows is this less whatever the
          intake separator takes out, and the tubing above the pump carries the difference.
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

      <div className="border-t border-slate-800 pt-3 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Completion</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tubing ID (in)"><NumberInput section="completion" name="idIn" step="0.001" /></Field>
          <Field label="Casing ID (in)"><NumberInput section="completion" name="casingIdIn" step="0.001" /></Field>
          <Field label="Roughness (in)"><NumberInput section="completion" name="roughnessIn" step="0.0001" /></Field>
          <Field label="Traverse step (ft)"><NumberInput section="completion" name="stepFt" /></Field>
        </div>
        <Field label="Flow correlation">
          <Select
            value={completion.correlation}
            onValueChange={(v) => setSection('completion', 'correlation', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="beggsBrill">Beggs and Brill (Payne)</SelectItem>
              <SelectItem value="hagedornBrown">Modified Hagedorn-Brown</SelectItem>
              <SelectItem value="gray">Gray</SelectItem>
              <SelectItem value="fancherBrown">Fancher-Brown</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <p className="text-[11px] text-slate-600">
          Casing ID is carried for the equipment clearance check only. It is not part of the
          hydraulics: the traverse above the pump runs in the tubing.
        </p>
      </div>
    </div>
  );
};

export default WellModelPanel;

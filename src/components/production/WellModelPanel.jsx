// The shared well model panel (Production P6.5).
//
// One panel, used by every production studio that needs a well. It was
// three near-identical copies until this phase; the copies drifted in
// wording and in which fields they offered, which is exactly the
// problem a shared well record exists to stop.
//
// The COMPLETION block is optional, because it is genuinely optional:
// gas lift and ESP march a multiphase traverse through the tubing and
// need it, a rod pump lifts a liquid column and never does. Studios say
// which they are with `showCompletion`.
//
// The depth label differs by studio only because the node means
// something slightly different in each ("perforation depth" for a pump
// that sits above it, "well depth" for a gas-lift node at the packer),
// so it is a prop rather than three forks of the same panel.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
  </div>
);

/**
 * @param {object} inputs      the studio's inputs (well, fluid, inflow, completion)
 * @param {Function} setSection (section, key, value) => void
 * @param {boolean} showCompletion  studios that march a tubing traverse
 * @param {string} depthLabel  what the node depth is called here
 * @param {string} depthHint   why it is entered once
 * @param {React.ReactNode} fluidNote      studio note under the fluid block
 * @param {React.ReactNode} completionNote studio note under the completion block
 */
const WellModelPanel = ({
  inputs,
  setSection,
  showCompletion = true,
  depthLabel = 'Well depth (ft TVD)',
  depthHint = 'The node depth, entered once and used everywhere.',
  fluidNote = null,
  completionNote = null,
}) => {
  const { well, inflow, fluid, completion = {} } = inputs;
  const NumberInput = ({ section, name, step = 'any' }) => (
    <Input
      type="number"
      step={step}
      value={inputs[section]?.[name] ?? ''}
      onChange={(e) => setSection(section, name, e.target.value)}
      className="h-9 bg-slate-800 border-slate-700"
    />
  );

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
        <Field label={depthLabel} hint={depthHint}>
          <NumberInput section="well" name="depthFt" />
        </Field>
      ) : (
        <Field
          label="Survey (md, inc, azi)"
          hint="One station per line. Depths are worked in TVD and converted back to measured depth where a traverse needs it."
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
        {fluidNote && <p className="text-[11px] text-slate-600">{fluidNote}</p>}
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
              {/* Absolute open flow calibrates a Vogel inflow and only a
                  Vogel inflow: the others are defined by a productivity
                  index or a test point. Offering it everywhere used to
                  produce an inflow that never calibrated at all. */}
              {inflow.model === 'vogel' && (
                <SelectItem value="qmax">Absolute open flow</SelectItem>
              )}
              <SelectItem value="test">A production test</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {inflow.calMode === 'pi' && (
          <Field label="PI (stb/d/psi)"><NumberInput section="inflow" name="pi" step="0.01" /></Field>
        )}
        {inflow.calMode === 'qmax' && inflow.model === 'vogel' && (
          <Field label="Qmax (stb/d)"><NumberInput section="inflow" name="qmax" /></Field>
        )}
        {inflow.calMode === 'qmax' && inflow.model !== 'vogel' && (
          <p className="text-[11px] text-amber-300">
            Absolute open flow calibrates a Vogel inflow. Pick a productivity index or a production
            test for this model, or change the model to Vogel.
          </p>
        )}
        {inflow.calMode === 'test' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Test rate (stb/d)"><NumberInput section="inflow" name="testQ" /></Field>
            <Field label="Test pwf (psia)"><NumberInput section="inflow" name="testPwf" /></Field>
          </div>
        )}
      </div>

      {showCompletion && (
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
          {completionNote && <p className="text-[11px] text-slate-600">{completionNote}</p>}
        </div>
      )}
    </div>
  );
};

export default WellModelPanel;

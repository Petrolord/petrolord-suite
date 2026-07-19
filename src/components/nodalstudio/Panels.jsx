// Left-rail panels for the traverse view, sensitivity, gas lift and choke
// tabs.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { CHOKE_COEFFS } from '@/utils/nodal/chokes';
import { Field, UnitField, SectionLabel } from './primitives';

const PanelCard = ({ title, children }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const SelectField = ({ label, value, onChange, options }) => (
  <div className="space-y-1">
    <Label className="text-xs text-slate-400">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const TraverseViewPanel = () => {
  const { traverseView, setTraverseViewField, unitSystem, isGasWell } = useNodalStudio();
  if (isGasWell) return null;
  return (
    <PanelCard title="Traverse view">
      <UnitField kind="oilRate" system={unitSystem} label="Rate for the traverse plot" value={traverseView.rate} onChange={(v) => setTraverseViewField('rate', v)} />
    </PanelCard>
  );
};

const SWEEP_PARAMS = [
  { value: 'whp', label: 'Wellhead pressure (psia)' },
  { value: 'idIn', label: 'Tubing ID (in)' },
  { value: 'wctPct', label: 'Water cut (%)' },
  { value: 'prodGor', label: 'Producing GOR (scf/STB)' },
  { value: 'pr', label: 'Reservoir pressure (psia)' },
];

export const SensitivityPanel = () => {
  const { sensitivityConfig, setSensitivityField, runSensitivity, sensitivityStale, sensitivity, isGasWell } = useNodalStudio();
  return (
    <div className="space-y-4">
      <SectionLabel>Sensitivity sweep</SectionLabel>
      <PanelCard title="Sweep configuration">
        <SelectField
          label="Parameter"
          value={sensitivityConfig.parameter}
          onChange={(v) => setSensitivityField('parameter', v)}
          options={SWEEP_PARAMS}
        />
        <Field
          label="Values (oilfield units, comma separated)"
          value={sensitivityConfig.valuesText}
          onChange={(v) => setSensitivityField('valuesText', v)}
          placeholder="150, 250, 400"
        />
        <Button onClick={runSensitivity} disabled={isGasWell} className="w-full">
          Run sweep
        </Button>
        {isGasWell && <div className="text-xs text-slate-500">Sensitivity sweeps run on oil wells in this version.</div>}
        {sensitivity && sensitivityStale && (
          <div className="text-xs text-amber-400">Inputs changed since this sweep ran. Run it again to refresh.</div>
        )}
      </PanelCard>
    </div>
  );
};

export const GasLiftPanel = () => {
  const { gasLiftConfig, setGasLiftField, runGasLift, gasLift, gasLiftStale, isScreening, isGasWell } = useNodalStudio();
  return (
    <div className="space-y-4">
      <SectionLabel>Gas lift screening</SectionLabel>
      <PanelCard title="Injection sweep">
        <Field label="Maximum injection rate" suffix="Mscf/d" value={gasLiftConfig.maxQgi} onChange={(v) => setGasLiftField('maxQgi', v)} />
        <Field label="Points" value={gasLiftConfig.nPoints} onChange={(v) => setGasLiftField('nPoints', v)} />
        <Field label="Economic slope" suffix="stb/d per Mscf/d" value={gasLiftConfig.econSlope} onChange={(v) => setGasLiftField('econSlope', v)} />
        <Button onClick={runGasLift} disabled={isGasWell || isScreening} className="w-full">
          {isScreening ? 'Screening…' : 'Run screening'}
        </Button>
        {isGasWell && <div className="text-xs text-slate-500">Gas lift screening applies to oil wells.</div>}
        {gasLift && gasLiftStale && (
          <div className="text-xs text-amber-400">Inputs changed since this screening ran. Run it again to refresh.</div>
        )}
      </PanelCard>
    </div>
  );
};

export const ChokesPanel = () => {
  const { choke, setChokeField, unitSystem } = useNodalStudio();
  const liquid = choke.mode !== 'gas';
  return (
    <div className="space-y-4">
      <SectionLabel>Choke performance</SectionLabel>
      <PanelCard title="Choke type">
        <SelectField
          label="Stream"
          value={choke.mode}
          onChange={(v) => setChokeField('mode', v)}
          options={[
            { value: 'liquid', label: 'Two-phase liquid (Gilbert family)' },
            { value: 'gas', label: 'Single-phase gas' },
          ]}
        />
      </PanelCard>
      {liquid ? (
        <PanelCard title="Two-phase critical flow">
          <SelectField
            label="Correlation"
            value={choke.correlation}
            onChange={(v) => setChokeField('correlation', v)}
            options={Object.keys(CHOKE_COEFFS).map((id) => ({ value: id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
          />
          <UnitField kind="liquidRate" system={unitSystem} label="Gross liquid rate" value={choke.q} onChange={(v) => setChokeField('q', v)} />
          <UnitField kind="gasLiquidRatio" system={unitSystem} label="Producing GLR" value={choke.glr} onChange={(v) => setChokeField('glr', v)} />
          <Field label="Bean size" suffix="64ths in" value={choke.s64} onChange={(v) => setChokeField('s64', v)} />
          <UnitField kind="pressure" system={unitSystem} label="Downstream (flowline) pressure" value={choke.pDownstream} onChange={(v) => setChokeField('pDownstream', v)} />
        </PanelCard>
      ) : (
        <PanelCard title="Gas choke">
          <UnitField kind="pressure" system={unitSystem} label="Upstream pressure" value={choke.pUp} onChange={(v) => setChokeField('pUp', v)} />
          <UnitField kind="pressure" system={unitSystem} label="Downstream pressure" value={choke.pDn} onChange={(v) => setChokeField('pDn', v)} />
          <UnitField kind="diameter" system={unitSystem} label="Bean diameter" value={choke.dIn} onChange={(v) => setChokeField('dIn', v)} />
          <UnitField kind="temperature" system={unitSystem} label="Upstream temperature" value={choke.tUpF} onChange={(v) => setChokeField('tUpF', v)} />
          <Field label="Specific heat ratio k" value={choke.k} onChange={(v) => setChokeField('k', v)} />
          <Field label="Discharge coefficient" value={choke.cd} onChange={(v) => setChokeField('cd', v)} />
        </PanelCard>
      )}
    </div>
  );
};

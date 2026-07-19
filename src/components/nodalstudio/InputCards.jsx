// Input cards for the Nodal Analysis Studio left rail. All values are
// oilfield-unit strings in state; UnitField renders them in the active
// display system.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { CORRELATIONS } from '@/utils/nodal/correlations/index';
import { Field, UnitField, SectionLabel } from './primitives';

const InputCard = ({ title, children }) => (
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

export const UnitSystemSelect = () => {
  const { unitSystem, setUnitSystem } = useNodalStudio();
  return (
    <SelectField
      label="Display units"
      value={unitSystem}
      onChange={setUnitSystem}
      options={[
        { value: 'oilfield', label: 'Oilfield (psia, STB/D, ft)' },
        { value: 'si', label: 'SI (kPa, m³/d, m)' },
      ]}
    />
  );
};

export const FluidCard = () => {
  const { fluid, setFluidField, unitSystem } = useNodalStudio();
  return (
    <InputCard title="Fluid">
      <Field label="Oil gravity" suffix="API" value={fluid.api} onChange={(v) => setFluidField('api', v)} />
      <Field label="Gas specific gravity" suffix="air = 1" value={fluid.gasSg} onChange={(v) => setFluidField('gasSg', v)} />
      <UnitField kind="gasLiquidRatio" system={unitSystem} label="Solution GOR at Pb" value={fluid.gor} onChange={(v) => setFluidField('gor', v)} />
      <Field label="Water salinity" suffix="ppm" value={fluid.salinityPpm} onChange={(v) => setFluidField('salinityPpm', v)} />
    </InputCard>
  );
};

const OIL_MODELS = [
  { value: 'pi', label: 'Straight-line PI' },
  { value: 'vogel', label: 'Vogel' },
  { value: 'composite', label: 'Composite (Standing)' },
  { value: 'fetkovich', label: 'Fetkovich' },
  { value: 'jones', label: 'Jones' },
];

export const InflowCard = () => {
  const { inflow, setInflowField, unitSystem } = useNodalStudio();
  const oil = inflow.wellType !== 'gas';
  return (
    <InputCard title="Reservoir and inflow">
      <SelectField
        label="Well type"
        value={inflow.wellType}
        onChange={(v) => setInflowField('wellType', v)}
        options={[{ value: 'oil', label: 'Oil well' }, { value: 'gas', label: 'Gas well' }]}
      />
      <UnitField kind="pressure" system={unitSystem} label="Reservoir pressure" value={inflow.pr} onChange={(v) => setInflowField('pr', v)} />
      {oil ? (
        <>
          <SelectField label="IPR model" value={inflow.model} onChange={(v) => setInflowField('model', v)} options={OIL_MODELS} />
          {(inflow.model === 'composite' || inflow.model === 'vogel') && (
            <UnitField kind="pressure" system={unitSystem} label="Bubble point" value={inflow.pb} onChange={(v) => setInflowField('pb', v)} />
          )}
          {(inflow.model === 'pi' || inflow.model === 'composite' || inflow.model === 'vogel') && (
            <SelectField
              label="Calibration"
              value={inflow.calMode}
              onChange={(v) => setInflowField('calMode', v)}
              options={[
                { value: 'pi', label: inflow.model === 'vogel' ? 'Enter qmax' : 'Enter PI (J)' },
                { value: 'test', label: 'From a well test point' },
              ]}
            />
          )}
          {inflow.calMode === 'test' ? (
            <>
              <UnitField kind="oilRate" system={unitSystem} label="Test rate" value={inflow.testQ} onChange={(v) => setInflowField('testQ', v)} />
              <UnitField kind="pressure" system={unitSystem} label="Test flowing pressure" value={inflow.testPwf} onChange={(v) => setInflowField('testPwf', v)} />
            </>
          ) : inflow.model === 'vogel' ? (
            <UnitField kind="oilRate" system={unitSystem} label="Vogel qmax (AOF)" value={inflow.qmax} onChange={(v) => setInflowField('qmax', v)} />
          ) : inflow.model === 'fetkovich' ? (
            <>
              <Field label="Fetkovich C" suffix="stb/d/psi²ⁿ" value={inflow.c} onChange={(v) => setInflowField('c', v)} />
              <Field label="Exponent n" value={inflow.n} onChange={(v) => setInflowField('n', v)} />
            </>
          ) : inflow.model === 'jones' ? (
            <>
              <Field label="Jones a (laminar)" suffix="psi/stb/d" value={inflow.a} onChange={(v) => setInflowField('a', v)} />
              <Field label="Jones b (turbulent)" suffix="psi/(stb/d)²" value={inflow.b} onChange={(v) => setInflowField('b', v)} />
            </>
          ) : (
            <UnitField kind="productivityIndex" system={unitSystem} label="Productivity index J" value={inflow.pi} onChange={(v) => setInflowField('pi', v)} />
          )}
        </>
      ) : (
        <>
          <SelectField
            label="Deliverability model"
            value={inflow.gasModel}
            onChange={(v) => setInflowField('gasModel', v)}
            options={[
              { value: 'backPressure', label: 'Back pressure (C, n)' },
              { value: 'lit', label: 'LIT / Houpeurt (a, b)' },
              { value: 'darcy', label: 'Darcy (k, h, skin)' },
            ]}
          />
          {inflow.gasModel === 'backPressure' && (
            <>
              <Field label="C" suffix="Mscf/d/psi²ⁿ" value={inflow.gasC} onChange={(v) => setInflowField('gasC', v)} />
              <Field label="n" value={inflow.gasN} onChange={(v) => setInflowField('gasN', v)} />
            </>
          )}
          {inflow.gasModel === 'lit' && (
            <>
              <Field label="a (laminar)" suffix="psi²/Mscf/d" value={inflow.gasA} onChange={(v) => setInflowField('gasA', v)} />
              <Field label="b (turbulent)" suffix="psi²/(Mscf/d)²" value={inflow.gasB} onChange={(v) => setInflowField('gasB', v)} />
            </>
          )}
          {inflow.gasModel === 'darcy' && (
            <>
              <Field label="Permeability k" suffix="md" value={inflow.k} onChange={(v) => setInflowField('k', v)} />
              <UnitField kind="length" system={unitSystem} label="Net pay h" value={inflow.h} onChange={(v) => setInflowField('h', v)} />
              <UnitField kind="length" system={unitSystem} label="Drainage radius re" value={inflow.re} onChange={(v) => setInflowField('re', v)} />
              <UnitField kind="length" system={unitSystem} label="Wellbore radius rw" value={inflow.rw} onChange={(v) => setInflowField('rw', v)} />
              <Field label="Skin" value={inflow.skin} onChange={(v) => setInflowField('skin', v)} />
              <UnitField kind="temperature" system={unitSystem} label="Reservoir temperature" value={inflow.resTempF} onChange={(v) => setInflowField('resTempF', v)} />
            </>
          )}
        </>
      )}
    </InputCard>
  );
};

export const WellCard = () => {
  const { well, setWellField, unitSystem } = useNodalStudio();
  return (
    <InputCard title="Well and trajectory">
      <SelectField
        label="Geometry"
        value={well.mode}
        onChange={(v) => setWellField('mode', v)}
        options={[{ value: 'vertical', label: 'Vertical' }, { value: 'deviated', label: 'Deviated (survey)' }]}
      />
      {well.mode === 'vertical' ? (
        <UnitField kind="length" system={unitSystem} label="Node depth (MD = TVD)" value={well.depthFt} onChange={(v) => setWellField('depthFt', v)} />
      ) : (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Survey rows: md, inc, azi <span className="text-slate-600">(ft, deg)</span></Label>
          <Textarea
            value={well.surveyText}
            onChange={(e) => setWellField('surveyText', e.target.value)}
            rows={5}
            className="bg-slate-800 border-slate-700 font-mono text-xs"
          />
        </div>
      )}
      <UnitField kind="temperature" system={unitSystem} label="Wellhead temperature" value={well.whtF} onChange={(v) => setWellField('whtF', v)} />
      <UnitField kind="temperature" system={unitSystem} label="Bottomhole temperature" value={well.bhtF} onChange={(v) => setWellField('bhtF', v)} />
    </InputCard>
  );
};

export const CompletionCard = () => {
  const { completion, setCompletionField, unitSystem, isGasWell } = useNodalStudio();
  const correlationOptions = Object.entries(CORRELATIONS).map(([value, def]) => ({ value, label: def.label }));
  return (
    <InputCard title="Completion and rates">
      <UnitField kind="diameter" system={unitSystem} label="Tubing ID" value={completion.idIn} onChange={(v) => setCompletionField('idIn', v)} />
      <Field label="Roughness" suffix="in" value={completion.roughnessIn} onChange={(v) => setCompletionField('roughnessIn', v)} />
      <UnitField kind="pressure" system={unitSystem} label="Wellhead pressure" value={completion.whp} onChange={(v) => setCompletionField('whp', v)} />
      {isGasWell ? (
        <>
          <SelectField
            label="Outflow model"
            value={completion.outflow}
            onChange={(v) => setCompletionField('outflow', v)}
            options={[
              { value: 'cullenderSmith', label: 'Cullender-Smith (dry gas)' },
              { value: 'gray', label: 'Gray (wet gas)' },
            ]}
          />
          {completion.outflow === 'gray' && (
            <>
              <Field label="Water-gas ratio" suffix="stb/MMscf" value={completion.wgr} onChange={(v) => setCompletionField('wgr', v)} />
              <Field label="Condensate-gas ratio" suffix="stb/MMscf" value={completion.cgr} onChange={(v) => setCompletionField('cgr', v)} />
            </>
          )}
        </>
      ) : (
        <>
          <SelectField label="VLP correlation" value={completion.correlation} onChange={(v) => setCompletionField('correlation', v)} options={correlationOptions} />
          <Field label="Water cut" suffix="%" value={completion.wctPct} onChange={(v) => setCompletionField('wctPct', v)} />
          <UnitField kind="gasLiquidRatio" system={unitSystem} label="Producing GOR" value={completion.prodGor} onChange={(v) => setCompletionField('prodGor', v)} />
          <UnitField kind="length" system={unitSystem} label="Traverse step" value={completion.stepFt} onChange={(v) => setCompletionField('stepFt', v)} />
        </>
      )}
    </InputCard>
  );
};

export const SetupRail = ({ sections = ['fluid', 'inflow', 'well', 'completion'] }) => (
  <div className="space-y-4">
    <SectionLabel>Inputs</SectionLabel>
    <UnitSystemSelect />
    {sections.includes('fluid') && <FluidCard />}
    {sections.includes('inflow') && <InflowCard />}
    {sections.includes('well') && <WellCard />}
    {sections.includes('completion') && <CompletionCard />}
  </div>
);

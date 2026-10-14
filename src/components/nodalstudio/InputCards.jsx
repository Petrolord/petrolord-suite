// Input cards for the Nodal Analysis Studio left rail. All values are
// oilfield-unit strings in state; UnitField renders them in the active
// display system.
import React from 'react';
import ProjectUnitSystemNote from '@/components/units/ProjectUnitSystemNote';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { unitLabel, fromOilfield } from '@/utils/nodal/units';
import { wellTestProductivityStatus, wellTestIntakeCurrent } from '@/utils/nodal/wellTestIntake';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { CORRELATIONS } from '@/utils/nodal/correlations/index';
import { Field, UnitField, SectionLabel } from './primitives';

const InputCard = ({ title, children }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const SelectField = ({ label, value, onChange, options }) => (
  <div className="space-y-1">
    <Label className="text-xs text-pl-muted">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const UnitSystemSelect = () => {
  const { unitSystem, setUnitSystem, profileUnitSystem } = useNodalStudio();
  return (
    <>
      <SelectField
        label="Display units"
        value={unitSystem}
        onChange={setUnitSystem}
        options={[
          { value: 'oilfield', label: 'Oilfield (psia, STB/D, ft)' },
          { value: 'si', label: 'SI (kPa, m³/d, m)' },
        ]}
      />
      <ProjectUnitSystemNote system={unitSystem} profileSystem={profileUnitSystem} />
    </>
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

// 2026-10-14: the Well Test Analysis Studio intake (wta-1 productivity, read
// by id from ?wellTestProject=). Nothing is applied until a choice is clicked;
// the provenance of what was applied is saved with the project.
const show = (kind, v, system, digits = 1) => {
  if (!Number.isFinite(v)) return 'not given';
  const d = fromOilfield(kind, v, system);
  const t = kind === 'productivityIndex' ? Number(d).toPrecision(3) : Number(d).toFixed(digits);
  return `${t} ${unitLabel(kind, system)}`;
};
const prWords = (m, line) => (m === 'p*' ? `p* of the ${line || 'Horner'} line` : 'initial pressure as entered');
const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : 'not given');

const Row = ({ label, children, testId }) => (
  <div className="flex items-start justify-between gap-2 text-xs" data-testid={testId}>
    <span className="text-pl-muted shrink-0">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);

export const WellTestIntakeCard = () => {
  const { wellTestSource, wellTestIntake, applyWellTestIntake, dismissWellTestSource, inflow, unitSystem } = useNodalStudio();
  if (!wellTestSource && !wellTestIntake) return null;
  const c = wellTestSource?.status === 'ok' ? wellTestSource.contract : null;
  const status = c ? wellTestProductivityStatus(c) : null;
  const p = c?.productivity;
  const current = wellTestIntakeCurrent(wellTestIntake, inflow);
  return (
    <InputCard title="From Well Test Analysis Studio">
      <div data-testid="nodal-wt-intake" className="space-y-3">
        {wellTestSource?.status === 'loading' && (
          <p className="text-xs text-pl-muted">Reading the Well Test project…</p>
        )}
        {wellTestSource?.status === 'error' && (
          <p className="text-xs text-pl-warning-text" data-testid="nodal-wt-intake-error">{wellTestSource.reason}</p>
        )}
        {c && (
          <div className="space-y-1.5">
            <Row label="Project" testId="nodal-wt-project">{wellTestSource.projectName || c.project?.name || 'unnamed'}</Row>
            <Row label="Well">{c.project?.well || 'not given'}</Row>
            <Row label="Method">{[c.project?.test_type, c.permeability?.method].filter(Boolean).join(', ') || 'not given'}</Row>
            <Row label="Test date">{c.project?.test_dates || 'not given'}</Row>
            {p && (
              <>
                <Row label="Reservoir pressure" testId="nodal-wt-pr">{show('pressure', p.pr_psia, unitSystem)} ({prWords(p.pr_method, p.pr_line)})</Row>
                <Row label="Test point" testId="nodal-wt-test-point">{show('oilRate', p.q_stb_d, unitSystem, 0)} at {show('pressure', p.pwf_psia, unitSystem)}</Row>
                <Row label="Productivity index J" testId="nodal-wt-j">{show('productivityIndex', p.pi_stbd_psi, unitSystem)}</Row>
                <Row label="J with the skin removed" testId="nodal-wt-j-ideal">
                  {Number.isFinite(p.ideal_pi_stbd_psi) ? show('productivityIndex', p.ideal_pi_stbd_psi, unitSystem) : 'not available'}
                  {Number.isFinite(p.flow_efficiency) ? ` (flow efficiency ${(p.flow_efficiency * 100).toFixed(0)}%)` : ''}
                </Row>
              </>
            )}
          </div>
        )}
        {c && !status.ok && (
          <p className="text-xs text-pl-warning-text" data-testid="nodal-wt-intake-refused">{status.reason}</p>
        )}
        {c && status.ok && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => applyWellTestIntake('asTested')} data-testid="nodal-wt-apply-tested">As tested</Button>
              <Button
                size="sm" variant="outline"
                onClick={() => applyWellTestIntake('skinRemoved')}
                disabled={!Number.isFinite(p.ideal_pi_stbd_psi)}
                data-testid="nodal-wt-apply-ideal"
              >
                Skin removed
              </Button>
            </div>
            <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="nodal-wt-intake-note">
              Either choice sets the reservoir pressure and the productivity index J for an oil well, with the straight-line PI model (a composite model stays composite). The Well Test has no bubble point, so the composite (Vogel) bubble point stays the Nodal entry. Pressures are at the Well Test gauge depth. Nothing changes until you pick a choice.
            </p>
          </>
        )}
        {wellTestIntake && (
          <p className="text-[11px] text-pl-muted leading-relaxed border-t border-pl-border pt-2" data-testid="nodal-wt-applied">
            Applied {wellTestIntake.choice_label.toLowerCase()} on {dateOf(wellTestIntake.applied_at)} from {wellTestIntake.project_name || 'a Well Test project'}{wellTestIntake.well ? ` (well ${wellTestIntake.well})` : ''}: reservoir pressure {show('pressure', wellTestIntake.pr_psia, unitSystem)} ({prWords(wellTestIntake.pr_method, wellTestIntake.pr_line)}), J {show('productivityIndex', wellTestIntake.pi_stbd_psi, unitSystem)}.
            {current ? '' : ' The inflow has been edited since, so the values on screen are your own.'}
          </p>
        )}
        {wellTestSource && wellTestSource.status !== 'loading' && (
          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={dismissWellTestSource} data-testid="nodal-wt-dismiss">Close the Well Test record</Button>
        )}
      </div>
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
          <Label className="text-xs text-pl-muted">Survey rows: md, inc, azi <span className="text-pl-muted">(ft, deg)</span></Label>
          <Textarea
            value={well.surveyText}
            onChange={(e) => setWellField('surveyText', e.target.value)}
            rows={5}
            className="font-mono text-xs"
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
    {sections.includes('inflow') && <WellTestIntakeCard />}
    {sections.includes('inflow') && <InflowCard />}
    {sections.includes('well') && <WellCard />}
    {sections.includes('completion') && <CompletionCard />}
  </div>
);

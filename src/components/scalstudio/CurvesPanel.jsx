// Curves tab, left rail (SC3): Corey parameter sets for the oil-water and
// gas-oil systems, plus the curves-only fractional-flow preview (mobility
// context; Welge and displacement stay in the Waterflood Design Studio).
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { SectionLabel } from '@/components/waterflooddesign/primitives';
import ScalField from './ScalField';

const OW_FIELDS = [
  { k: 'Swc', label: 'Swc, connate water' },
  { k: 'Sor', label: 'Sor, residual oil to water' },
  { k: 'krwMax', label: 'krw @ Sor (endpoint)' },
  { k: 'kroMax', label: 'kro @ Swc (endpoint)' },
  { k: 'nw', label: 'nw, water exponent' },
  { k: 'no', label: 'no, oil exponent' },
];

const GO_FIELDS = [
  { k: 'Swc', label: 'Swc, connate water' },
  { k: 'Sgc', label: 'Sgc, critical gas' },
  { k: 'Sorg', label: 'Sorg, residual oil to gas' },
  { k: 'krgMax', label: 'krg endpoint' },
  { k: 'krogMax', label: 'krog endpoint' },
  { k: 'ng', label: 'ng, gas exponent' },
  { k: 'nog', label: 'nog, oil exponent' },
];

const CurvesPanel = () => {
  const {
    curves, setCurveField, setOwField, setGoField, ow, go, owStatus, goStatus,
  } = useScalStudio();
  const isOw = curves.phase === 'oilwater';

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Fluid system</SectionLabel>
        <Tabs value={curves.phase} onValueChange={(v) => setCurveField('phase', v)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="oilwater">Oil-water</TabsTrigger>
            <TabsTrigger value="gasoil">Gas-oil</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      <section className="space-y-3">
        <SectionLabel>Corey parameters</SectionLabel>
        {(isOw ? OW_FIELDS : GO_FIELDS).map(({ k, label }) => (
          <ScalField
            key={k}
            testId={`corey-${isOw ? 'ow' : 'go'}-${k}`}
            label={!isOw && k === 'Swc' ? 'Swc, connate water (the oil-water Swc)' : label}
            value={isOw ? curves.ow[k] : curves.go[k]}
            disabled={!isOw && k === 'Swc'}
            onChange={(v) => (isOw ? setOwField(k, v) : setGoField(k, v))}
          />
        ))}
        {!isOw && (
          <p className="text-[11px] text-pl-muted" data-testid="scal-go-swc-pairing">
            The gas-oil set is held at the oil-water Swc: one connate water, as a simulator takes it (SGOF ends at 1 - Swc of SWOF).
            {curves.goSwcPairing ? ` Moved from Swc ${curves.goSwcPairing.from} to ${curves.goSwcPairing.to}: ${curves.goSwcPairing.why}; the other gas-oil parameters are kept.` : ''}
          </p>
        )}
        {(isOw ? ow.error : go.error) && (
          <p className="text-xs text-pl-danger-text">{isOw ? ow.error : go.error}</p>
        )}
        {isOw && (
          <p className={`text-[11px] ${owStatus.kind === 'edited-after-fit' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid="scal-ow-origin" data-origin={owStatus.kind}>
            Source of this set: {owStatus.text}.
          </p>
        )}
        {!isOw && (
          <p className={`text-[11px] ${goStatus?.kind === 'edited-after-fit' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid="scal-go-origin" data-origin={goStatus?.kind}>
            Source of this set: {goStatus?.text || 'Entered by the user'}. Fit a sample's gas-oil table on the Lab Data tab to apply it here.
          </p>
        )}
      </section>

      {isOw && (
        <section className="space-y-3">
          <SectionLabel>Fractional flow preview</SectionLabel>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-pl-muted">Show fw curve</Label>
            <Switch
              checked={curves.fwPreviewOn}
              onCheckedChange={(v) => setCurveField('fwPreviewOn', v)}
            />
          </div>
          {curves.fwPreviewOn && (
            <>
              <ScalField kind="viscosity" label="μw, water viscosity" value={curves.muW} onChange={(v) => setCurveField('muW', v)} />
              <ScalField kind="viscosity" label="μo, oil viscosity" value={curves.muO} onChange={(v) => setCurveField('muO', v)} />
              <p className="text-[11px] text-pl-muted">
                Curves only. Welge tangents, breakthrough and displacement design live in the Waterflood Design
                Studio; send these curves there from the Export tab.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default CurvesPanel;

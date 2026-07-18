// Curves tab, left rail (SC3): Corey parameter sets for the oil-water and
// gas-oil systems, plus the curves-only fractional-flow preview (mobility
// context; Welge and displacement stay in the Waterflood Design Studio).
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Field, SectionLabel } from '@/components/waterflooddesign/primitives';

const OW_FIELDS = [
  { k: 'Swc', label: 'Swc — connate water' },
  { k: 'Sor', label: 'Sor — residual oil to water' },
  { k: 'krwMax', label: 'krw @ Sor (endpoint)' },
  { k: 'kroMax', label: 'kro @ Swc (endpoint)' },
  { k: 'nw', label: 'nw — water exponent' },
  { k: 'no', label: 'no — oil exponent' },
];

const GO_FIELDS = [
  { k: 'Swc', label: 'Swc — connate water' },
  { k: 'Sgc', label: 'Sgc — critical gas' },
  { k: 'Sorg', label: 'Sorg — residual oil to gas' },
  { k: 'krgMax', label: 'krg endpoint' },
  { k: 'krogMax', label: 'krog endpoint' },
  { k: 'ng', label: 'ng — gas exponent' },
  { k: 'nog', label: 'nog — oil exponent' },
];

const CurvesPanel = () => {
  const {
    curves, setCurveField, setOwField, setGoField, ow, go,
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
          <Field
            key={k}
            label={label}
            value={isOw ? curves.ow[k] : curves.go[k]}
            onChange={(v) => (isOw ? setOwField(k, v) : setGoField(k, v))}
          />
        ))}
        {(isOw ? ow.error : go.error) && (
          <p className="text-xs text-rose-400">{isOw ? ow.error : go.error}</p>
        )}
      </section>

      {isOw && (
        <section className="space-y-3">
          <SectionLabel>Fractional flow preview</SectionLabel>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Show fw curve</Label>
            <Switch
              checked={curves.fwPreviewOn}
              onCheckedChange={(v) => setCurveField('fwPreviewOn', v)}
            />
          </div>
          {curves.fwPreviewOn && (
            <>
              <Field label="μw — water viscosity (cp)" value={curves.muW} onChange={(v) => setCurveField('muW', v)} />
              <Field label="μo — oil viscosity (cp)" value={curves.muO} onChange={(v) => setCurveField('muO', v)} />
              <p className="text-[11px] text-slate-500">
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

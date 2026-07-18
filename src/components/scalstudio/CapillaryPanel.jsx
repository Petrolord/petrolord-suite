// Capillary tab, left rail (SC3): the working J-function spec (manual power
// law now; averaged lab samples once the Lab Data tab lands in SC4) and the
// reservoir rock the J curve scales to.
import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Field, SectionLabel } from '@/components/waterflooddesign/primitives';

const RESERVOIR_FIELDS = [
  { k: 'k_md', label: 'k — reservoir permeability (md)' },
  { k: 'phi', label: 'φ — reservoir porosity (frac)' },
  { k: 'sigma_dyncm', label: 'σ — IFT at reservoir (dyn/cm)' },
  { k: 'thetaDeg', label: 'θ — contact angle (deg)' },
];

const CapillaryPanel = () => {
  const {
    capillary, setCapillaryField, setManualJField, setReservoirField,
    samplesDerived, jResolved,
  } = useScalStudio();
  const usableSamples = samplesDerived.filter((s) => (s.jRows?.length ?? 0) >= 3);

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>J-function source</SectionLabel>
        <Tabs value={capillary.jMode} onValueChange={(v) => setCapillaryField('jMode', v)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="samples">From samples</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {capillary.jMode === 'manual' ? (
        <section className="space-y-3">
          <SectionLabel>Power law J = a·Sw*^(-b)</SectionLabel>
          <Field label="a — J at Sw* = 1" value={capillary.manual.a} onChange={(v) => setManualJField('a', v)} />
          <Field label="b — curvature exponent" value={capillary.manual.b} onChange={(v) => setManualJField('b', v)} />
          <Field label="Swirr — irreducible water" value={capillary.manual.Swirr} onChange={(v) => setManualJField('Swirr', v)} />
          <p className="text-[11px] text-slate-500">
            Sw* is (Sw − Swirr)/(1 − Swirr). Type a published or field-calibrated J correlation here, or switch to
            From samples once lab capillary data is loaded on the Lab Data tab.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <SectionLabel>Averaged from lab samples</SectionLabel>
          {usableSamples.length === 0 ? (
            <p className="text-xs text-slate-400">
              No sample carries a computed J table yet. Load core capillary data on the Lab Data tab; each sample
              with at least 3 Pc points appears here for inclusion.
            </p>
          ) : (
            <div className="space-y-2">
              {usableSamples.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-cyan-600"
                    checked={capillary.includedSampleIds.includes(s.id)}
                    onChange={(e) => setCapillaryField(
                      'includedSampleIds',
                      e.target.checked
                        ? [...capillary.includedSampleIds, s.id]
                        : capillary.includedSampleIds.filter((id) => id !== s.id),
                    )}
                  />
                  {s.name} <span className="text-slate-500">({s.jRows.length} J points)</span>
                </label>
              ))}
            </div>
          )}
          <Field
            label="Shared Swirr override (blank = data-driven)"
            value={capillary.SwirrOverride}
            onChange={(v) => setCapillaryField('SwirrOverride', v)}
            placeholder="e.g. 0.12"
          />
          <p className="text-[11px] text-slate-500">
            Samples are normalized to Sw*, averaged geometrically and refitted. If the refit quality is poor, the
            data-driven Swirr guess is probably too high; set the override.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <SectionLabel>Reservoir rock and fluids</SectionLabel>
        {RESERVOIR_FIELDS.map(({ k, label }) => (
          <Field key={k} label={label} value={capillary.reservoir[k]} onChange={(v) => setReservoirField(k, v)} />
        ))}
        <p className="text-[11px] text-slate-500">
          The J curve scales to this rock as Pc = J·σcosθ / (0.21645·√(k/φ)). Height conversion happens on the
          Height and Saturation tab.
        </p>
      </section>

      {jResolved.error && <p className="text-xs text-rose-400">{jResolved.error}</p>}
    </div>
  );
};

export default CapillaryPanel;

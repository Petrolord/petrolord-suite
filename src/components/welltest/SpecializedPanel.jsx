// Left rail for the Specialized (straight-line) tab: analysis window bounds.
// Empty bounds mean full range; the Diagnostics tab's radial window is the
// guide for the semilog line.
import React from 'react';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel, Field, fmt } from './primitives';

const SpecializedPanel = () => {
  const { windows, setWindowField, configSpec, regimes } = useWellTestStudio();
  const isBuildup = configSpec.config?.testType === 'buildup';
  const radial = regimes.find((r) => r.regime === 'radial');

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>{isBuildup ? 'Horner window' : 'MDH window'}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" suffix="hr" value={windows.semilogMin} onChange={(v) => setWindowField('semilogMin', v)} placeholder="auto" />
          <Field label="To" suffix="hr" value={windows.semilogMax} onChange={(v) => setWindowField('semilogMax', v)} placeholder="auto" />
        </div>
        {radial ? (
          <p className="text-[11px] text-slate-500 mt-2">
            Detected radial flow spans {fmt.sig3(radial.xStart)} to {fmt.sig3(radial.xEnd)} hr (equivalent time). Set the
            window inside it for a clean straight line.
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 mt-2">
            No radial stabilization detected yet. Fit windows chosen inside storage-dominated data will bias k high.
          </p>
        )}
      </section>

      <section>
        <SectionLabel>sqrt(t) window</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" suffix="hr" value={windows.sqrtMin} onChange={(v) => setWindowField('sqrtMin', v)} placeholder="auto" />
          <Field label="To" suffix="hr" value={windows.sqrtMax} onChange={(v) => setWindowField('sqrtMax', v)} placeholder="auto" />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Linear-flow diagnostic. Fracture half-length interpretation arrives with the fracture models (WT3).
        </p>
      </section>

      {!isBuildup && (
        <section>
          <SectionLabel>PSS window</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" suffix="hr" value={windows.pssMin} onChange={(v) => setWindowField('pssMin', v)} placeholder="auto" />
            <Field label="To" suffix="hr" value={windows.pssMax} onChange={(v) => setWindowField('pssMax', v)} placeholder="auto" />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Cartesian pwf vs t line during pseudo-steady state gives the connected pore volume.
          </p>
        </section>
      )}
    </div>
  );
};

export default SpecializedPanel;

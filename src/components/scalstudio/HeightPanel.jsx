// Height & Saturation tab, left rail (SC5): fluid gravities, the free
// water level and the saturation window. The profile itself derives from
// the Capillary tab's working J spec and reservoir rock.
import React from 'react';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Field, SectionLabel } from '@/components/waterflooddesign/primitives';

const FIELDS = [
  { k: 'gammaW', label: 'γw — water specific gravity' },
  { k: 'gammaHc', label: 'γhc — hydrocarbon specific gravity' },
  { k: 'fwl_tvdss', label: 'Free water level TVDSS (ft, optional)' },
  { k: 'swMin', label: 'Sw axis minimum' },
  { k: 'swMax', label: 'Sw axis maximum' },
];

const HeightPanel = () => {
  const { height, setHeightField, jResolved, reservoir } = useScalStudio();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionLabel>Fluids and datum</SectionLabel>
        {FIELDS.map(({ k, label }) => (
          <Field key={k} label={label} value={height[k]} onChange={(v) => setHeightField(k, v)} />
        ))}
        <p className="text-[11px] text-slate-500">
          Height above the free water level is h = Pc divided by 0.4335 times the specific gravity difference.
          With a FWL entered, the table and CSV also carry TVDSS = FWL minus h.
        </p>
      </section>
      {(!jResolved.jSpec || !reservoir.props) && (
        <p className="text-xs text-amber-400">
          The profile needs a working J-function and reservoir rock from the Capillary tab first.
        </p>
      )}
    </div>
  );
};

export default HeightPanel;

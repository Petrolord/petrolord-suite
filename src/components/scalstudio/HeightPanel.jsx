// Height & Saturation tab, left rail (SC5): fluid gravities, the free
// water level and the saturation window. The profile itself derives from
// the Capillary tab's working J spec and reservoir rock.
import React from 'react';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { SectionLabel } from '@/components/waterflooddesign/primitives';
import ScalField from './ScalField';

const FIELDS = [
  { k: 'gammaW', label: 'γw, water specific gravity', kind: 'gravity' },
  { k: 'gammaHc', label: 'γhc, hydrocarbon specific gravity', kind: 'gravity' },
  { k: 'fwl_tvdss', label: 'Free water level, TVDSS (optional)', kind: 'length' },
  { k: 'swMin', label: 'Sw axis minimum', kind: 'fraction' },
  { k: 'swMax', label: 'Sw axis maximum', kind: 'fraction' },
];

const HeightPanel = () => {
  const { height, setHeightField, jResolved, reservoir } = useScalStudio();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionLabel>Fluids and datum</SectionLabel>
        {FIELDS.map(({ k, label, kind }) => (
          <ScalField key={k} label={label} kind={kind} testId={`height-${k}`} value={height[k]} onChange={(v) => setHeightField(k, v)} />
        ))}
        <p className="text-[11px] text-pl-muted">
          Height above the free water level is h = Pc divided by 0.4335 times the specific gravity difference.
          With a FWL entered, the table and CSV also carry TVDSS = FWL minus h. TVDSS is depth below the vertical
          datum of the field (MSL unless the well says otherwise), positive down.
        </p>
      </section>
      {(!jResolved.jSpec || !reservoir.props) && (
        <p className="text-xs text-pl-warning-text">
          The profile needs a working J-function and reservoir rock from the Capillary tab first.
        </p>
      )}
    </div>
  );
};

export default HeightPanel;

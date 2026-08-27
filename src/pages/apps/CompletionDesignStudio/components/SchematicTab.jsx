import React from 'react';
import CdSchematic from '../charts/CdSchematic';

export default function SchematicTab({ caseDraft, res, depthUnit, wellboreName }) {
  return (
    <div className="p-3">
      <CdSchematic caseDraft={caseDraft} res={res} depthUnit={depthUnit} wellboreName={wellboreName} height={720} />
      <p className="mt-2 text-[10px] text-slate-500">
        Diameters are drawn to scale from the catalog dimensions; lengths are to MD scale, so short jewelry reads as thin bands with labels. Only modeled elements are drawn: no cement tops, fluids or wellhead are implied.
      </p>
    </div>
  );
}

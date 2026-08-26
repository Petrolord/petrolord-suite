import React from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';
import WellboreVisualization from '../visualizer/WellboreVisualization';

// Full-well schematic of every casing and tubing string in the case.
// The old mock baseline comparison and fake integration buttons are gone;
// cross-app wiring is real (wp spine + pp-1.0.0) and lives in the
// environment tab.
const StringVisualizerTab = () => {
  const { caseDoc, depthUnit } = useCasingTubingDesign();
  const casingStrings = caseDoc?.strings?.casingStrings || [];
  const tubingStrings = caseDoc?.strings?.tubingStrings || [];

  return (
    <div className="h-full flex flex-col bg-slate-950 px-0 py-0 space-y-0 overflow-hidden w-full">
      <div className="flex justify-between items-center bg-slate-900/50 p-2 border-b border-slate-800 mt-0 shrink-0">
        <span className="text-xs text-slate-500 px-2">
          Visualizing {casingStrings.length} casing string{casingStrings.length === 1 ? '' : 's'}, {tubingStrings.length} tubing string{tubingStrings.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex-1 min-h-0 bg-slate-950 relative overflow-hidden p-0">
        <WellboreVisualization
          casingStrings={casingStrings}
          tubingStrings={tubingStrings}
          packer={caseDoc?.packer}
          depthUnit={depthUnit}
          width={600}
        />
      </div>
    </div>
  );
};

export default StringVisualizerTab;

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
    <div className="flex-1 min-h-0 h-full flex flex-col bg-pl-bg px-0 py-0 space-y-0 overflow-hidden w-full">
      <div className="flex justify-between items-center bg-pl-surface p-2 border-b border-pl-border mt-0 shrink-0">
        <span className="text-xs text-pl-muted px-2">
          Visualizing {casingStrings.length} casing string{casingStrings.length === 1 ? '' : 's'}, {tubingStrings.length} tubing string{tubingStrings.length === 1 ? '' : 's'}
        </span>
      </div>

      <div data-canvas="chart" className="flex-1 min-h-0 bg-white relative overflow-hidden p-0">
        <WellboreVisualization
          casingStrings={casingStrings}
          tubingStrings={tubingStrings}
          packer={caseDoc?.packer}
          depthUnit={depthUnit}
          storageKey="full"
        />
      </div>
    </div>
  );
};

export default StringVisualizerTab;

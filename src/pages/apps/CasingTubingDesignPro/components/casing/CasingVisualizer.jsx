import React from 'react';
import WellboreVisualization from '../visualizer/WellboreVisualization';

// One casing string on the shared white schematic: shoe with depth,
// vertical exaggeration control, Petrolord mark (tester fix 2026-09-07).
const CasingVisualizer = ({ activeString, depthUnit = 'm' }) => (
  <WellboreVisualization
    casingStrings={activeString ? [activeString] : []}
    depthUnit={depthUnit}
    compact
    storageKey="casing"
    emptyText="No active string to visualize."
  />
);

export default CasingVisualizer;

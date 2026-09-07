import React from 'react';
import WellboreVisualization from '../visualizer/WellboreVisualization';

// The tubing string with its packer on the shared white schematic.
// Completion jewelry is drawn by Completion Design Studio (D7); legacy
// `components` markers on saved cases are tolerated on load and ignored.
const TubingVisualizer = ({ activeString, packer, depthUnit = 'm' }) => (
  <WellboreVisualization
    tubingStrings={activeString ? [activeString] : []}
    packer={packer}
    depthUnit={depthUnit}
    compact
    storageKey="tubing"
    emptyText="No active string to visualize."
  />
);

export default TubingVisualizer;

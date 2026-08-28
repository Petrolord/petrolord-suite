// The gas lift studio's well model tab, over the SHARED well model
// panel (Production P6.5). The panel lives in components/production
// because gas lift, ESP and rod pump all need the same one.
//
// The wellhead pressure and the water cut are NOT here any more: they
// moved to the Injection panel at P6.5, because they are what the well
// is doing on the day rather than what the well is, and the shared
// record holds only the latter.
import React from 'react';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const WellModelPanel = () => {
  const { inputs, setSection } = useGasLift();
  return (
    <SharedWellModelPanel
      inputs={inputs}
      setSection={setSection}
      showCompletion
      depthLabel="Well depth (ft)"
      depthHint="Node depth: the perforations or the packer. Entered once and used everywhere."
      fluidNote="Valve depths are reported in TVD and converted back to measured depth for the traverse."
    />
  );
};

export default WellModelPanel;

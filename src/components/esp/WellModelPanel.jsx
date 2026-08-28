// The ESP studio's well model tab, over the SHARED well model panel
// (Production P6.5). The panel itself lives in components/production
// because gas lift, ESP and rod pump all need the same one; what stays
// here is the wording that is genuinely specific to sizing a pump.
import React from 'react';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useEsp } from '@/contexts/EspDesignContext';

const WellModelPanel = () => {
  const { inputs, setSection } = useEsp();
  return (
    <SharedWellModelPanel
      inputs={inputs}
      setSection={setSection}
      showCompletion
      depthLabel="Perforation depth (ft TVD)"
      depthHint="The node depth. This is the perforation depth the intake pressure is worked back from, so it is entered once and used everywhere."
      fluidNote="The gas-oil ratio is the produced one. What the pump swallows is this less whatever the intake separator takes out, and the tubing above the pump carries the difference."
    />
  );
};

export default WellModelPanel;

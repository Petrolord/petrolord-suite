// The rod pump studio's well model tab, over the SHARED well model
// panel (Production P6.5). The panel lives in components/production
// because gas lift, ESP and rod pump all need the same one.
import React from 'react';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useRodPump } from '@/contexts/RodPumpDesignContext';

const WellModelPanel = () => {
  const { inputs, setSection } = useRodPump();
  return (
    <SharedWellModelPanel
      inputs={inputs}
      setSection={setSection}
      showCompletion
      depthLabel="Perforation depth (ft TVD)"
      depthHint="The node depth, entered once. The intake pressure is worked back from here, so it is never a second number that can drift."
      fluidNote="The gas-oil ratio matters here for one reason: the free gas at intake conditions is what keeps liquid out of the barrel."
      completionNote="A rod pump lifts a liquid column and marches no multiphase traverse, so it does not use these. They are part of the well, and the studios that do march one need them, so they are carried with the shared well model."
    />
  );
};

export default WellModelPanel;

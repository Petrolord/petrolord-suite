// The advisor's well model tab, over the SHARED panel (P6.5).
//
// The point of the whole phase: every method is designed against this
// one description, so a comparison between them means something.
import React from 'react';
import SharedWellModelPanel from '@/components/production/WellModelPanel';
import { useLiftAdvisor } from '@/contexts/LiftAdvisorContext';

const WellModelPanel = () => {
  const { inputs, setSection } = useLiftAdvisor();
  return (
    <SharedWellModelPanel
      inputs={inputs}
      setSection={setSection}
      showCompletion
      depthLabel="Perforation depth (ft TVD)"
      depthHint="The node depth, entered once. Every lift method is designed against this same well."
      fluidNote="The gas-oil ratio drives nearly every comparison here: it is what makes an ESP struggle and a plunger possible."
      completionNote="The tubing the lifted or pumped column flows in. A rod pump ignores it; gas lift and ESP march a traverse through it."
    />
  );
};

export default WellModelPanel;

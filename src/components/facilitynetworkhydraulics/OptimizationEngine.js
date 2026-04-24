import { calculatePipelineHydraulics, calculatePipeStress } from './PipelineSizerEngine';
import { PipeSchedules } from './PipeDatabase';

export const optimizePipeline = (inputs, constraints) => {
  const { maxVelocity, maxPressureDrop, minSafetyFactor } = constraints;
  
  const validConfigs = [];
  
  for (const pipe of PipeSchedules) {
    const hydInputs = {
      ...inputs,
      diameter: pipe.id, // internal diameter for hydraulics
    };
    
    const results = calculatePipelineHydraulics(hydInputs);
    const stress = calculatePipeStress(inputs.operatingPressure || 100, pipe.od, pipe.wallThickness, inputs.yieldStrength || 35000);
    
    if (
      results.velocity <= maxVelocity &&
      results.totalPressureDropBar <= maxPressureDrop &&
      stress.safetyFactor >= minSafetyFactor
    ) {
      validConfigs.push({
        pipe,
        hydraulics: results,
        stress: stress,
        score: pipe.weight // lower weight = cheaper = better score
      });
    }
  }
  
  // Sort by weight (cost proxy)
  validConfigs.sort((a, b) => a.score - b.score);
  
  return validConfigs.length > 0 ? validConfigs[0] : null;
};
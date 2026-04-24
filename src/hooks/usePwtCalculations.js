import { useState, useEffect, useCallback } from 'react';

const WATER_PRESETS = {
  conventional: { flowRate: 50000, oiw: 500, tss: 200, tds: 35000, temp: 120 },
  unconventional: { flowRate: 20000, oiw: 1500, tss: 800, tds: 150000, temp: 140 },
  flowback: { flowRate: 10000, oiw: 2000, tss: 1500, tds: 80000, temp: 110 },
};

const TECH_DB = {
  primary: {
    api: { name: 'API Separator', oiwRemoval: 0.6, tssRemoval: 0.4, pDrop: 2, energy: 0.1, cost: 0.05, footprintFactor: 1.5 },
    cpi: { name: 'CPI Separator', oiwRemoval: 0.8, tssRemoval: 0.6, pDrop: 5, energy: 0.2, cost: 0.08, footprintFactor: 0.8 },
  },
  secondary: {
    hydrocyclone: { name: 'De-oiling Hydrocyclone', oiwRemoval: 0.9, tssRemoval: 0.3, pDrop: 40, energy: 1.5, cost: 0.15, footprintFactor: 0.3 },
    igf: { name: 'Induced Gas Flotation', oiwRemoval: 0.92, tssRemoval: 0.8, pDrop: 10, energy: 1.2, cost: 0.20, footprintFactor: 1.0 },
    daf: { name: 'Dissolved Air Flotation', oiwRemoval: 0.95, tssRemoval: 0.85, pDrop: 15, energy: 1.8, cost: 0.25, footprintFactor: 1.2 },
  },
  tertiary: {
    nutshell: { name: 'Nutshell Filter', oiwRemoval: 0.9, tssRemoval: 0.95, pDrop: 15, energy: 0.5, cost: 0.12, footprintFactor: 0.6 },
    media: { name: 'Multi-Media Filter', oiwRemoval: 0.85, tssRemoval: 0.98, pDrop: 20, energy: 0.6, cost: 0.10, footprintFactor: 0.7 },
  }
};

const computeResults = (inputs, train) => {
  let currentOiw = inputs.oiw;
  let currentTss = inputs.tss;
  let totalPDrop = 0;
  let totalEnergy = 0;
  let totalCost = 0;
  let totalFootprint = 0;
  
  const stageResults = [];
  const stages = ['primary', 'secondary', 'tertiary'];
  
  // Flow in m3/hr (approx from bwpd)
  const flowM3hr = inputs.flowRate * 0.158987 / 24; 

  stages.forEach(stage => {
    const techKey = train[stage];
    if (techKey && techKey !== 'none' && TECH_DB[stage][techKey]) {
      const tech = TECH_DB[stage][techKey];
      
      const oiwRemoved = currentOiw * tech.oiwRemoval;
      const tssRemoved = currentTss * tech.tssRemoval;
      
      currentOiw -= oiwRemoved;
      currentTss -= tssRemoved;
      
      totalPDrop += tech.pDrop;
      totalEnergy += tech.energy;
      totalCost += tech.cost;
      totalFootprint += (flowM3hr * tech.footprintFactor);

      stageResults.push({
        stage,
        name: tech.name,
        outOiw: currentOiw,
        outTss: currentTss,
        pDrop: tech.pDrop,
        energy: tech.energy,
        cost: tech.cost
      });
    }
  });

  const oiwEfficiency = inputs.oiw > 0 ? ((inputs.oiw - currentOiw) / inputs.oiw) * 100 : 0;
  const tssEfficiency = inputs.tss > 0 ? ((inputs.tss - currentTss) / inputs.tss) * 100 : 0;

  // Chart Data
  const qualityChartData = [
    { stage: 'Inlet', OIW: inputs.oiw, TSS: inputs.tss },
    ...stageResults.map(s => ({ stage: s.name, OIW: s.outOiw, TSS: s.outTss }))
  ];

  const costChartData = [
    { name: 'Primary', value: stageResults.find(s => s.stage === 'primary')?.cost || 0 },
    { name: 'Secondary', value: stageResults.find(s => s.stage === 'secondary')?.cost || 0 },
    { name: 'Tertiary', value: stageResults.find(s => s.stage === 'tertiary')?.cost || 0 },
  ].filter(d => d.value > 0);

  return {
    effluent: { oiw: currentOiw, tss: currentTss },
    metrics: {
      oiwEfficiency,
      tssEfficiency,
      totalPDrop,
      totalEnergy,
      totalCost,
      totalFootprint
    },
    stageResults,
    charts: { qualityChartData, costChartData }
  };
};

export const usePwtCalculations = () => {
  const [inputs, setInputs] = useState(WATER_PRESETS.conventional);
  const [train, setTrain] = useState({ primary: 'cpi', secondary: 'igf', tertiary: 'nutshell' });
  const [isCalculating, setIsCalculating] = useState(false);
  const [results, setResults] = useState(() => computeResults(inputs, train));

  const applyPreset = (presetName) => {
    if (WATER_PRESETS[presetName]) {
      setInputs(WATER_PRESETS[presetName]);
    }
  };

  const updateInput = (key, value) => {
    setInputs(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const updateTrain = (stage, tech) => {
    setTrain(prev => ({ ...prev, [stage]: tech }));
  };

  const triggerCalculation = useCallback(async () => {
    setIsCalculating(true);
    // Simulate complex calculation time
    await new Promise(resolve => setTimeout(resolve, 1000));
    setResults(computeResults(inputs, train));
    setIsCalculating(false);
    return true;
  }, [inputs, train]);

  return {
    inputs,
    updateInput,
    applyPreset,
    train,
    updateTrain,
    results,
    isCalculating,
    triggerCalculation,
    TECH_DB
  };
};
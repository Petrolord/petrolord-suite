import React, { createContext, useContext, useState } from 'react';

export const initialScreening = { 
  targetRate: 3000, depth: 8000, gor: 800, waterCut: 20, 
  apiGravity: 35, isOffshore: false, hasSand: false, 
  isDeviated: true, powerAvailable: true, gasAvailable: true 
};

export const initialGasLift = { 
  tubingID: 2.441, wellDepth: 8000, whp: 200, bhp: 2000, 
  liquidRate: 1500, waterCut: 30, gor: 300, oilApi: 35, 
  gasGravity: 0.7, waterSalinity: 30000, wellheadTemp: 120, 
  bottomholeTemp: 180, surfaceInjectionPressure: 1500, 
  injectionGasGravity: 0.65, valveSpacingSafetyFactor: 100 
};

export const initialESP = { 
  targetRate: 2500, wellDepth: 7500, pumpDepth: 7000, 
  whp: 150, waterCut: 50, gor: 500, oilApi: 32, 
  gasGravity: 0.75, tubingID: 3.958, casingID: 6.366, 
  frequency: 60, pumpModel: 'REDADN2600' 
};

export const initialRodPump = { 
  strokeLength: 120, pumpingSpeed: 10, pumpDepth: 6000, 
  pumpDiameter: 1.75, tubingPressure: 200, casingPressure: 100, 
  liquidRate: 300, waterCut: 60, oilApi: 30, 
  rodString: "7/8,3/4", rodPercentages: "50,50" 
};

const ArtificialLiftContext = createContext();

export const ArtificialLiftProvider = ({ children }) => {
  const [designData, setDesignData] = useState({
    screening: initialScreening,
    gas_lift: initialGasLift,
    esp: initialESP,
    rod_pump: initialRodPump
  });

  const updateDesign = (module, key, value) => {
    setDesignData(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [key]: value
      }
    }));
  };

  const loadDesignData = (data) => {
    setDesignData(data);
  };

  return (
    <ArtificialLiftContext.Provider value={{ designData, updateDesign, loadDesignData }}>
      {children}
    </ArtificialLiftContext.Provider>
  );
};

export const useArtificialLift = () => useContext(ArtificialLiftContext);
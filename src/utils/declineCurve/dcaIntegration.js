/**
 * DCA Integration Utilities
 * These functions simulate sending forecast data to other application modules
 */

export const sendForecastToNPVBuilder = async (wellId, forecastData) => {
  console.log(`Sending forecast for well ${wellId} to NPV Builder...`);
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 800));
  return { success: true, timestamp: new Date().toISOString() };
};

export const sendForecastToFDPAccelerator = async (wellId, forecastData) => {
  console.log(`Sending forecast for well ${wellId} to FDP Accelerator...`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  return { success: true, timestamp: new Date().toISOString() };
};

export const receiveDataFromReservoirSimulation = async (wellId) => {
  console.log(`Fetching simulation data for well ${wellId}...`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  // Return mock simulation data
  return { 
    success: true, 
    data: { pressure: 3500, saturation: 0.65 },
    timestamp: new Date().toISOString() 
  };
};
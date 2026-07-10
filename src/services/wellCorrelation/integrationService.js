/**
 * Integration Service
 * Handles data exchange with other EarthModel modules.
 */

export const INTEGRATION_TARGETS = {
  EARTHMODEL_PRO: 'EarthModel Pro',
  PPFG: 'Pore Pressure & Frac Gradient',
  GEOMECHANICS: '1D Geomechanics'
};

export const formatForEarthModelPro = (horizons, markers, wells) => {
  // EarthModel Pro expects PointSets or Surfaces
  const points = [];
  
  markers.forEach(m => {
    const well = wells.find(w => w.id === m.wellId);
    const horizon = horizons.find(h => h.id === m.horizonId);
    
    if (well && horizon) {
      points.push({
        x: well.location?.x || 0, // Placeholder if coords missing
        y: well.location?.y || 0,
        z: m.depth, // Assuming TVD or handling MD->TVD elsewhere
        surfaceName: horizon.name,
        wellName: well.name
      });
    }
  });

  return {
    type: 'SURFACE_POINTS',
    source: 'Well Correlation Tool',
    data: points
  };
};

export const exportToApp = async (targetApp, data) => {
  console.log(`Exporting to ${targetApp}...`, data);
  // Stub for actual inter-app communication (e.g., via Context, Custom Events, or API)
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, message: `Exported ${data.data.length} points to ${targetApp}` });
    }, 800);
  });
};
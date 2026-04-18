import { fitHyperbolic } from './dcaEngine';

// --- Normalization Utilities ---

/**
 * Normalize data by time (t = days since first production)
 */
export const normalizeByTime = (data) => {
  // Filter out invalid data
  const validData = data.filter(d => d.rate > 0 && d.date);
  if (validData.length === 0) return [];

  // Sort by date
  validData.sort((a, b) => new Date(a.date) - new Date(b.date));

  const startDate = new Date(validData[0].date).getTime();

  return validData.map(d => ({
    ...d,
    originalDate: d.date,
    t_normalized: (new Date(d.date).getTime() - startDate) / (1000 * 60 * 60 * 24), // Days
    rate_normalized: d.rate // No rate normalization yet
  }));
};

/**
 * Normalize data by rate (q = q / q_peak)
 */
export const normalizeByRate = (data) => {
  const maxRate = Math.max(...data.map(d => d.rate));
  if (maxRate <= 0) return data;

  return data.map(d => ({
    ...d,
    rate_normalized: d.rate / maxRate,
    peakRate: maxRate
  }));
};

/**
 * Normalize by both time and rate
 */
export const normalizeByTimeAndRate = (data) => {
  const timeNorm = normalizeByTime(data);
  return normalizeByRate(timeNorm);
};

// --- Fitting & Application ---

/**
 * Fits a single hyperbolic curve to an aggregated set of normalized data points
 */
export const fitTypeCurve = (normalizedData, modelType = 'Hyperbolic') => {
  // Prepare x (time) and y (rate) arrays for the fitting engine
  // If multiple wells are present, normalizedData should be a flat array of all their points
  
  const x = normalizedData.map(d => d.t_normalized);
  const y = normalizedData.map(d => d.rate_normalized);

  // Use existing engine to fit
  // Note: fitHyperbolic expects simple arrays
  const fit = fitHyperbolic(x, y);

  if (!fit) return null;

  return {
    ...fit,
    qi: fit.qi, // Normalized qi (usually close to 1 if rate normalized)
    Di: fit.Di,
    b: fit.b,
    type: modelType
  };
};

/**
 * Applies a type curve to a target well
 * Scales the normalized type curve back to the well's magnitude
 */
export const applyTypeCurve = (typeCurveParams, targetWellData) => {
  if (!targetWellData || targetWellData.length === 0) return null;

  // Simple application: Match peak rate of target well to scale the curve
  // A better approach fits the type curve (fixed b) to the history (solving for qi, Di)
  // For now, we'll just scale qi based on the target's peak or last rate.
  
  const peakRate = Math.max(...targetWellData.map(d => d.rate));
  
  // Scaled parameters
  const qi_real = typeCurveParams.qi * peakRate; 
  const Di_real = typeCurveParams.Di; // Di stays same if time is consistent
  const b_real = typeCurveParams.b;

  // Calculate forecast based on these parameters
  // This logic duplicates some of generateForecast, but specific for TC application result
  
  return {
    qi: qi_real,
    Di: Di_real,
    b: b_real,
    matchMethod: 'Peak Rate Scaling',
    quality: 'Estimated'
  };
};

export const calculateTypeCurveQuality = (R2, dataPoints) => {
  if (R2 > 0.85 && dataPoints > 20) return 'Good';
  if (R2 > 0.6) return 'Fair';
  return 'Poor';
};
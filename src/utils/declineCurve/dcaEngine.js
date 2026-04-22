import { saveAs } from 'file-saver';

// --- Helpers ---
function linearRegression(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }
  
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
  const sumYY = ys.reduce((sum, y) => sum + y * y, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const meanY = sumY / n;
  const ssRes = ys.reduce((sum, y, i) => sum + Math.pow(y - (intercept + slope * xs[i]), 2), 0);
  const ssTot = ys.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
  const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
  
  return { slope, intercept, r2 };
}

// --- Forward Models (PRESERVED EXACTLY AS-IS) ---

/**
 * Arps Hyperbolic Decline Rate Equation
 * q(t) = qi / (1 + b * Di * t)^(1/b)
 * @param {number} qi - Initial rate [units/time]
 * @param {number} Di - Initial decline rate [1/time]
 * @param {number} b - Decline exponent [dimensionless] 
 * @param {number} t - Time [same units as Di]
 * @returns {number} Rate at time t
 */
export const calculateArpsHyperbolic = (qi, Di, b, t) => {
  if (qi <= 0 || Di < 0 || t < 0) return 0;
  if (b <= 0) return qi * Math.exp(-Di * t); // Exponential case
  return qi / Math.pow(1 + b * Di * t, 1/b);
};

/**
 * Arps Exponential Decline Rate Equation  
 * q(t) = qi * exp(-Di * t)
 * @param {number} qi - Initial rate [units/time]
 * @param {number} Di - Decline rate [1/time]
 * @param {number} t - Time [same units as Di]
 * @returns {number} Rate at time t
 */
export const calculateArpsExponential = (qi, Di, t) => {
  if (qi <= 0 || Di < 0 || t < 0) return 0;
  return qi * Math.exp(-Di * t);
};

/**
 * Calculate EUR using Arps decline equations
 * @param {number} qi - Initial rate [units/time]
 * @param {number} Di - Initial decline rate [1/time] 
 * @param {number} b - Decline exponent [dimensionless]
 * @param {number} qLimit - Economic limit rate [units/time]
 * @param {string} modelType - 'exponential', 'hyperbolic', or 'harmonic'
 * @returns {number} Estimated Ultimate Recovery [units]
 */
export const calculateEUR = (qi, Di, b, qLimit, modelType = 'hyperbolic') => {
  if (qi <= qLimit || Di <= 0) return 0;
  
  try {
    if (modelType === 'exponential' || b === 0) {
      // EUR = (qi - qLimit) / Di
      return (qi - qLimit) / Di;
    } else if (modelType === 'harmonic' || Math.abs(b - 1) < 0.001) {
      // EUR = (qi / Di) * ln(qi / qLimit)
      return (qi / Di) * Math.log(qi / qLimit);
    } else {
      // Hyperbolic: EUR = (qi^b / (Di * (b - 1))) * (qi^(1-b) - qLimit^(1-b))
      if (Math.abs(b - 1) < 0.001) return calculateEUR(qi, Di, 1, qLimit, 'harmonic');
      const term1 = Math.pow(qi, b) / (Di * (b - 1));
      const term2 = Math.pow(qi, 1 - b) - Math.pow(qLimit, 1 - b);
      return term1 * term2;
    }
  } catch (e) {
    console.error('EUR calculation error:', e);
    return 0;
  }
};

// --- Curve Fitting Functions (NEWLY IMPLEMENTED) ---

/**
 * Fit Arps decline model to production data
 * @param {Array} data - Array of {date: string ISO, rate: number} objects
 * @param {string} modelType - 'Auto-Select', 'Exponential', 'Hyperbolic', 'Harmonic'
 * @param {Object} window - {startDate: string, endDate: string} or null
 * @param {Object} constraints - {minB: number, maxB: number} or null
 * @returns {Object} Fit results with R2, RMSE, parameters, and t0
 */
export const fitArpsModel = (data, modelType, window = null, constraints = null) => {
  // Default constraints
  const { minB = 0, maxB = 2 } = constraints || {};
  
  // Filter and validate data
  let filteredData = data.filter(d => d.rate > 0 && !isNaN(d.rate) && d.date);
  
  // Apply time window if specified
  if (window && window.startDate && window.endDate) {
    const startTime = new Date(window.startDate).getTime();
    const endTime = new Date(window.endDate).getTime();
    filteredData = filteredData.filter(d => {
      const time = new Date(d.date).getTime();
      return time >= startTime && time <= endTime;
    });
  }
  
  // Check minimum data points
  if (filteredData.length < 3) {
    return {
      R2: 0,
      RMSE: Infinity,
      parameters: { qi: 0, Di: 0, b: 0, modelType: 'None' },
      t0: new Date().toISOString()
    };
  }
  
  // Sort by date and convert to time series
  filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
  const t0Date = filteredData[0].date;
  const t0Time = new Date(t0Date).getTime();
  
  const timeSeries = filteredData.map(d => ({
    t: (new Date(d.date).getTime() - t0Time) / (1000 * 60 * 60 * 24), // Convert to days
    rate: d.rate
  }));
  
  const candidates = [];
  
  // Try Exponential model
  if (modelType === 'Exponential' || modelType === 'Auto-Select' || modelType === 'Auto') {
    try {
      const logRates = timeSeries.map(p => Math.log(p.rate));
      const times = timeSeries.map(p => p.t);
      const { slope, intercept, r2: logR2 } = linearRegression(times, logRates);
      
      const qi = Math.exp(intercept);
      const Di = -slope;
      
      if (qi > 0 && Di > 0 && isFinite(qi) && isFinite(Di)) {
        // Calculate RMSE on original scale
        const predicted = timeSeries.map(p => qi * Math.exp(-Di * p.t));
        const actual = timeSeries.map(p => p.rate);
        const rmse = Math.sqrt(predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0) / predicted.length);
        
        // Calculate R2 on original scale
        const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
        const ssTot = actual.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0);
        const ssRes = predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0);
        const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 0;
        
        candidates.push({ R2: r2, RMSE: rmse, qi, Di, b: 0, modelType: 'Exponential', parameters: { qi, Di, b: 0, modelType: 'Exponential' }, t0: t0Date });
      }
    } catch (e) {
      console.warn('Exponential fit failed:', e);
    }
  }
  
  // Try Harmonic model (b = 1)
  if (modelType === 'Harmonic' || modelType === 'Auto-Select' || modelType === 'Auto') {
    try {
      const invRates = timeSeries.map(p => 1 / p.rate);
      const times = timeSeries.map(p => p.t);
      const { slope, intercept } = linearRegression(times, invRates);
      
      const qi = 1 / intercept;
      const Di = slope * qi;
      
      if (qi > 0 && Di > 0 && isFinite(qi) && isFinite(Di)) {
        const predicted = timeSeries.map(p => qi / (1 + Di * p.t));
        const actual = timeSeries.map(p => p.rate);
        const rmse = Math.sqrt(predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0) / predicted.length);
        
        const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
        const ssTot = actual.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0);
        const ssRes = predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0);
        const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 0;
        
        candidates.push({ R2: r2, RMSE: rmse, qi, Di, b: 1, modelType: 'Harmonic', parameters: { qi, Di, b: 1, modelType: 'Harmonic' }, t0: t0Date });
      }
    } catch (e) {
      console.warn('Harmonic fit failed:', e);
    }
  }
  
  // Try Hyperbolic models (grid search)
  if (modelType === 'Hyperbolic' || modelType === 'Auto-Select' || modelType === 'Auto') {
    const bStep = 0.05;
    let bestHyperbolic = null;
    
    for (let b = Math.max(minB, bStep); b <= maxB; b += bStep) {
      if (Math.abs(b - 1) < 0.001) continue; // Skip harmonic (handled above)
      
      try {
        // Linearization: q^(-b) = qi^(-b) + b*Di*qi^(-b)*t
        const transformedRates = timeSeries.map(p => Math.pow(p.rate, -b));
        const times = timeSeries.map(p => p.t);
        const { slope, intercept } = linearRegression(times, transformedRates);
        
        const qi = Math.pow(intercept, -1/b);
        const Di = slope / (b * Math.pow(qi, -b));
        
        if (qi > 0 && Di > 0 && isFinite(qi) && isFinite(Di)) {
          const predicted = timeSeries.map(p => calculateArpsHyperbolic(qi, Di, b, p.t));
          const actual = timeSeries.map(p => p.rate);
          const rmse = Math.sqrt(predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0) / predicted.length);
          
          if (!bestHyperbolic || rmse < bestHyperbolic.RMSE) {
            const meanActual = actual.reduce((a, b) => a + b, 0) / actual.length;
            const ssTot = actual.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0);
            const ssRes = predicted.reduce((sum, pred, i) => sum + Math.pow(actual[i] - pred, 2), 0);
            const r2 = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 0;
            
            bestHyperbolic = { R2: r2, RMSE: rmse, qi, Di, b, modelType: 'Hyperbolic', parameters: { qi, Di, b, modelType: 'Hyperbolic' }, t0: t0Date };
          }
        }
      } catch (e) {
        // Skip this b value
      }
    }
    
    if (bestHyperbolic) {
      candidates.push(bestHyperbolic);
    }
  }
  
  // Select best model
  if (candidates.length === 0) {
    return { R2: 0, RMSE: Infinity, qi: 0, Di: 0, b: 0, modelType: 'None', parameters: { qi: 0, Di: 0, b: 0, modelType: 'None' }, t0: t0Date };
  }
  
  if (modelType === 'Auto-Select' || modelType === 'Auto') {
    // Return the model with lowest RMSE
    candidates.sort((a, b) => a.RMSE - b.RMSE);
    return candidates[0];
  } else {
    // Return the specific model requested
    const targetType = modelType;
    const match = candidates.find(c => c.parameters.modelType === targetType);
    return match || candidates[0];
  }
};

/**
 * Generate forecast using fitted model parameters
 * @param {Object} params - {qi, Di, b, modelType}
 * @param {Object} config - {forecastDurationDays, economicLimit, stopAtLimit}
 * @param {Date|string} t0 - Zero time reference
 * @returns {Array} Array of {date, rate, cumulative} objects
 */
export const generateForecast = (params, config, t0) => {
  const { qi, Di, b, modelType } = params;
  const { forecastDurationDays, durationDays, economicLimit, stopAtLimit, facilityLimit } = config;
  const totalDays = forecastDurationDays || durationDays || 3650;
  
  if (!qi || !Di || !totalDays) return { rates: [], eur: 0, timeToLimit: null, chartData: [] };
  
  const startDate = new Date(t0);
  const forecast = [];
  let cumulativeProduction = 0;
  
  let timeToLimitDays = null;
  for (let day = 1; day <= totalDays; day++) {
    let rate;
    
    if (modelType === 'Exponential' || b === 0) {
      rate = calculateArpsExponential(qi, Di, day);
    } else if (modelType === 'Harmonic' || b === 1) {
      rate = qi / (1 + Di * day);
    } else {
      rate = calculateArpsHyperbolic(qi, Di, b, day);
    }
    
    // Check economic limit
    if (stopAtLimit && economicLimit && rate < economicLimit) { timeToLimitDays = day; break; }
    
    cumulativeProduction += rate;
    
    const forecastDate = new Date(startDate);
    forecastDate.setDate(forecastDate.getDate() + day);
    
    forecast.push({
      date: forecastDate.toISOString(),
      rate: Math.max(0, rate),
      cumulative: cumulativeProduction
    });
  }
  
  return {
    rates: forecast,
    eur: cumulativeProduction,
    timeToLimit: timeToLimitDays !== null ? timeToLimitDays : totalDays,
    chartData: forecast
  };
};

/**
 * Legacy function - wrapper for backward compatibility
 * @param {Array} data - Production data
 * @returns {Object} Hyperbolic fit parameters
 */
export const fitHyperbolic = (data) => {
  const result = fitArpsModel(data, 'Hyperbolic', null, null);
  return result.parameters;
};

// --- Quality Assessment ---
export const getFitQuality = (r2, rmse, pointCount) => {
  const r2Num = typeof r2 === "number" && isFinite(r2) ? r2 : 0;
  const rmseNum = typeof rmse === "number" && isFinite(rmse) ? rmse : Infinity;
  const n = typeof pointCount === "number" ? pointCount : 0;

  let tier = "Poor";
  if (r2Num >= 0.95) tier = "Excellent";
  else if (r2Num >= 0.90) tier = "Good";
  else if (r2Num >= 0.80) tier = "Fair";

  return { tier, r2: r2Num, rmse: rmseNum, n };
};

// --- Export Functions ---
export const exportToLAS = (wellData, filename = 'decline_curve_analysis.las') => {
  let lasContent = '~VERSION INFORMATION\n';
  lasContent += 'VERS. 2.0: CWLS LOG ASCII STANDARD - VERSION 2.0\n';
  lasContent += 'WRAP. NO: ONE LINE PER DEPTH STEP\n';
  lasContent += '\n~WELL INFORMATION\n';
  lasContent += `STRT.M ${wellData[0]?.date || '2024-01-01'}: START DATE\n`;
  lasContent += `STOP.M ${wellData[wellData.length - 1]?.date || '2024-12-31'}: STOP DATE\n`;
  lasContent += `STEP.M 1: STEP (DAYS)\n`;
  lasContent += 'NULL. -999.25: NULL VALUE\n';
  lasContent += 'WELL. DECLINE_CURVE: WELL NAME\n';
  lasContent += '\n~CURVE INFORMATION\n';
  lasContent += 'DATE. : DATE\n';
  lasContent += 'RATE.BBL/D: PRODUCTION RATE\n';
  lasContent += 'CUMULATIVE.BBL: CUMULATIVE PRODUCTION\n';
  lasContent += '\n~ASCII\n';
  
  wellData.forEach(point => {
    lasContent += `${point.date || ''} ${point.rate || -999.25} ${point.cumulative || -999.25}\n`;
  });
  
  const blob = new Blob([lasContent], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
};

export const exportToCSV = (data, filename = 'decline_curve_data.csv') => {
  const headers = Object.keys(data[0] || {}).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  const csvContent = [headers, ...rows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, filename);
};
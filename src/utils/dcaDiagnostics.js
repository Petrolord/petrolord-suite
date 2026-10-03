/**
 * DCA Diagnostics Utility Functions
 * Statistical calculations for decline curve analysis fit quality
 */

/**
 * Calculate coefficient of determination (R²)
 */
export const calculateR2 = (actualData, predictedData) => {
  if (!actualData || !predictedData || actualData.length !== predictedData.length) {
    return 0;
  }
  
  const actual = actualData.map(d => d.rate || d.value || 0);
  const predicted = predictedData.map(d => d.rate || d.value || 0);
  
  const actualMean = actual.reduce((sum, val) => sum + val, 0) / actual.length;
  
  const totalSumSquares = actual.reduce((sum, val) => sum + Math.pow(val - actualMean, 2), 0);
  const residualSumSquares = actual.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);
  
  if (totalSumSquares === 0) return 0;
  
  return Math.max(0, 1 - (residualSumSquares / totalSumSquares));
};

/**
 * Calculate Root Mean Square Error (RMSE)
 */
export const calculateRMSE = (actualData, predictedData) => {
  if (!actualData || !predictedData || actualData.length !== predictedData.length) {
    return 0;
  }
  
  const actual = actualData.map(d => d.rate || d.value || 0);
  const predicted = predictedData.map(d => d.rate || d.value || 0);
  
  const sumSquaredErrors = actual.reduce((sum, val, i) => {
    return sum + Math.pow(val - predicted[i], 2);
  }, 0);
  
  return Math.sqrt(sumSquaredErrors / actual.length);
};

/**
 * Calculate normalized residuals for plotting
 */
export const calculateResiduals = (actualData, predictedData) => {
  if (!actualData || !predictedData || actualData.length !== predictedData.length) {
    return [];
  }
  
  const actual = actualData.map(d => d.rate || d.value || 0);
  const predicted = predictedData.map(d => d.rate || d.value || 0);
  const times = actualData.map(d => d.time || d.date || 0);
  
  const residuals = actual.map((val, i) => {
    const residual = val - predicted[i];
    const normalized = predicted[i] !== 0 ? residual / predicted[i] : residual;
    
    return {
      time: times[i],
      residual: normalized,
      absolute: Math.abs(residual)
    };
  });
  
  return residuals;
};

/**
 * Get verdict information based on R² value
 */
export const getVerdictInfo = (r2) => {
  if (r2 >= 0.95) {
    return {
      title: "Excellent Fit",
      description: "Model accurately represents the decline behavior. Reliable for forecasting.",
      color: "text-green-500",
      icon: "check"
    };
  } else if (r2 >= 0.80) {
    // one scale with the engine's getFitQuality (Fair from 0.80) and the badge (DCA-U1-014)
    return {
      title: "Reasonable Fit: Caution on Late-Time Extrapolation",
      description: "Model fits most data well but may have limitations for long-term forecasts.",
      color: "text-yellow-500",
      icon: "warning"
    };
  } else {
    return {
      title: "Poor Fit: Check for Multi-Segment Behavior or Data Anomalies",
      description: "Model does not adequately represent the data. Consider alternative models or data cleaning.",
      color: "text-red-500",
      icon: "warning"
    };
  }
};

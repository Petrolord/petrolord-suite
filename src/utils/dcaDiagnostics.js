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
  } else if (r2 >= 0.85) {
    return {
      title: "Reasonable Fit — Caution on Late-Time Extrapolation",
      description: "Model fits most data well but may have limitations for long-term forecasts.",
      color: "text-yellow-500",
      icon: "warning"
    };
  } else {
    return {
      title: "Poor Fit — Check for Multi-Segment Behavior or Data Anomalies",
      description: "Model does not adequately represent the data. Consider alternative models or data cleaning.",
      color: "text-red-500",
      icon: "warning"
    };
  }
};

/**
 * Calculate 95% confidence intervals for Arps parameters
 * Simplified approach - in practice would use more sophisticated statistical methods
 */
export const calculateArpsConfidenceIntervals = (parameters, actualData, predictedData) => {
  if (!parameters || !actualData || !predictedData || actualData.length < 5) {
    return { hasIntervals: false };
  }
  
  const { qi, Di, b } = parameters;
  const n = actualData.length;
  const rmse = calculateRMSE(actualData, predictedData);
  
  // Simplified confidence interval calculation
  // Real implementation would use Jacobian matrix and covariance analysis
  const tValue = 1.96; // Approximate 95% CI for large samples
  const relativeSE = rmse / Math.sqrt(n); // Simplified standard error
  
  try {
    const intervals = {
      hasIntervals: true,
      qi: qi ? Math.abs(qi * relativeSE * tValue * 0.1) : null, // 10% relative error assumption
      Di: Di ? Math.abs(Di * relativeSE * tValue * 0.15) : null, // 15% relative error assumption  
      b: b ? Math.abs(b * relativeSE * tValue * 0.2) : null // 20% relative error assumption
    };
    
    // Only return intervals if they seem reasonable (not larger than the parameter itself)
    if (intervals.qi && intervals.qi > qi) intervals.qi = null;
    if (intervals.Di && intervals.Di > Di) intervals.Di = null;
    if (intervals.b && intervals.b > Math.abs(b)) intervals.b = null;
    
    return intervals;
  } catch (error) {
    return { hasIntervals: false };
  }
};

/**
 * Detect flow regimes in pressure derivative data
 * Used for advanced diagnostics (future enhancement)
 */
export const detectFlowRegimes = (derivativeData) => {
  if (!derivativeData || derivativeData.length < 10) {
    return [];
  }
  
  const regimes = [];
  
  // Simplified regime detection based on derivative slope
  // Real implementation would use more sophisticated pattern recognition
  
  return regimes;
};

/**
 * Calculate quality metrics summary
 */
export const getFitQualitySummary = (actualData, predictedData, parameters) => {
  const r2 = calculateR2(actualData, predictedData);
  const rmse = calculateRMSE(actualData, predictedData);
  const residuals = calculateResiduals(actualData, predictedData);
  const verdict = getVerdictInfo(r2);
  const confidenceIntervals = calculateArpsConfidenceIntervals(parameters, actualData, predictedData);
  
  // Calculate additional metrics
  const meanAbsoluteError = residuals.reduce((sum, r) => sum + r.absolute, 0) / residuals.length;
  const maxResidual = Math.max(...residuals.map(r => r.absolute));
  
  return {
    r2,
    rmse,
    meanAbsoluteError,
    maxResidual,
    verdict,
    confidenceIntervals,
    totalPoints: actualData.length,
    outlierCount: residuals.filter(r => Math.abs(r.residual) > 2).length
  };
};
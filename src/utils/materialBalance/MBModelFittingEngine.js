import { calculateLinearRegression } from './DiagnosticCalculator';

/**
 * MB Model Fitting Engine
 * Performs regression analysis for specific Material Balance Models.
 * Heavily refactored for robust NaN prevention and error propagation (Task 6).
 */

export const calculateResiduals = (actualData, fittedModelFn, xKey, yKey) => {
  return actualData.map(point => {
    const x = Number(point[xKey]);
    const y = Number(point[yKey]);
    if (!isFinite(x) || !isFinite(y)) return 0;
    return y - fittedModelFn(x);
  });
};

export const calculateRMSE = (residuals) => {
  const validRes = residuals.filter(r => isFinite(r) && !isNaN(r));
  if (!validRes.length) return NaN;
  const sumSq = validRes.reduce((acc, r) => acc + r * r, 0);
  return Math.sqrt(sumSq / validRes.length);
};

/**
 * Fit Volumetric Oil Model (F = N * Eo)
 */
export const fitVolumetricModel = (diagnosticData) => {
  console.log("[Fit] Volumetric Model Fitting...");
  const regression = calculateLinearRegression(diagnosticData, 'Eo', 'F');
  
  if (regression.error) return { type: 'volumetric', error: regression.error };

  const N = regression.slope;
  const residuals = calculateResiduals(diagnosticData, (x) => regression.slope * x + regression.intercept, 'Eo', 'F');
  const rmse = calculateRMSE(residuals);

  return {
    type: 'volumetric',
    N,
    R2: regression.r2,
    RMSE: rmse,
    intercept: regression.intercept,
    params: { N },
    error: null
  };
};

/**
 * Fit Gas Cap Model (F/Eo = N + m*N*(Eg/Eo))
 */
export const fitGasCapModel = (diagnosticData) => {
  console.log("[Fit] Gas Cap Model Fitting...");
  const validData = diagnosticData.filter(d => Math.abs(d.Eo) > 1e-6);
  
  if (validData.length < 3) {
    return { type: 'gascap', error: `Insufficient points where Eo > 0. Found ${validData.length}, need >= 3.` };
  }

  const regression = calculateLinearRegression(validData, 'Eg_over_Eo', 'F_over_Eo');
  
  if (regression.error) return { type: 'gascap', error: regression.error };

  const N = regression.intercept;
  const mN = regression.slope;
  const m = Math.abs(N) > 1e-6 ? mN / N : NaN;
  
  if (!isFinite(m)) {
    return { type: 'gascap', error: `Calculated OOIP (N) is zero, cannot calculate ratio (m).` };
  }

  const residuals = calculateResiduals(validData, (x) => regression.slope * x + regression.intercept, 'Eg_over_Eo', 'F_over_Eo');
  const rmse = calculateRMSE(residuals);

  return {
    type: 'gascap',
    N,
    m,
    R2: regression.r2,
    RMSE: rmse,
    params: { N, m },
    error: null
  };
};

/**
 * Fit Water Drive Model 
 * Pot Aquifer Approx: X = (Pi-P)/Et, Y = F/Et. Slope = U, Intercept = N.
 */
export const fitWaterDriveModel = (diagnosticData) => {
  console.log("[Fit] Water Drive Model Fitting...");
  const validData = diagnosticData.filter(d => Math.abs(d.Et) > 1e-6);
  
  if (validData.length < 3) {
    return { type: 'water', error: `Insufficient points where Total Expansion (Et) > 0. Found ${validData.length}, need >= 3.` };
  }

  const xyData = validData.map(d => ({
    X: (d.P_init - d.P) / d.Et,
    Y: d.F / d.Et
  }));
  
  const regression = calculateLinearRegression(xyData, 'X', 'Y');
  if (regression.error) return { type: 'water', error: regression.error };

  const N = regression.intercept;
  const U = regression.slope;
  
  const residuals = calculateResiduals(xyData, (x) => regression.slope * x + regression.intercept, 'X', 'Y');
  const rmse = calculateRMSE(residuals);

  return {
    type: 'water',
    N,
    U, 
    R2: regression.r2,
    RMSE: rmse,
    params: { N, U },
    error: null
  };
};
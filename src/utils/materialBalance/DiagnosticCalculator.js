import * as Engine from './MaterialBalanceEngine';

/**
 * Calculates diagnostic terms for plotting from the pre-computed engine timeSeries
 */
export const calculateDiagnosticDataFromSeries = (timeSeries) => {
  console.log("[Diagnostic Calc] Generating diagnostic ratios from time series...");
  
  return timeSeries.map(pt => {
    const { day, date, pressure: P, F, Eo, Eg, Efw, Et, relativeNp: Np, relativeGp: Gp, relativeWp: Wp, P_init } = pt;
    
    // Protect against division by zero in UI plotting
    const F_over_Eo = Math.abs(Eo) > 1e-6 ? F / Eo : 0;
    const Eg_over_Eo = Math.abs(Eo) > 1e-6 ? Eg / Eo : 0;
    
    // Gas diagnostics proxy
    const P_over_Z = P; // Without Z-factor history, plot P vs Gp proxy
    const F_gas = Gp * 1.0 + Wp * 1.0; 

    return {
      day,
      date,
      P,
      P_init,
      Np, Gp, Wp,
      F, Eo, Eg, Efw, Et,
      F_gas, P_over_Z,
      F_over_Eo: isFinite(F_over_Eo) ? F_over_Eo : 0,
      Eg_over_Eo: isFinite(Eg_over_Eo) ? Eg_over_Eo : 0,
    };
  });
};

// Task 1.4, Task 5, Task 6: Robust Linear Regression
export const calculateLinearRegression = (data, xKey, yKey) => {
  console.log(`[Regression] Starting regression for Y:${yKey} vs X:${xKey} using ${data.length} raw points.`);
  
  // 1. Strict Validation
  const validData = data.filter(pt => {
    const x = Number(pt[xKey]);
    const y = Number(pt[yKey]);
    const isValid = isFinite(x) && !isNaN(x) && isFinite(y) && !isNaN(y);
    if (!isValid) {
      console.warn(`[Regression] Skipping invalid point: X=${pt[xKey]}, Y=${pt[yKey]}`);
    }
    return isValid;
  });

  const n = validData.length;
  
  // Need at least 3 points for meaningful statistics
  if (n < 3) {
    const msg = `Insufficient valid points. Found ${n}, need >= 3.`;
    console.error(`[Regression] ${msg}`);
    return { slope: NaN, intercept: NaN, r2: NaN, error: msg };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

  validData.forEach(pt => {
    const x = pt[xKey];
    const y = pt[yKey];
    sumX += x;
    sumY += y;
    sumXY += (x * y);
    sumXX += (x * x);
    sumYY += (y * y);
  });

  const denominator = (n * sumXX - sumX * sumX);
  
  if (Math.abs(denominator) < 1e-10) {
    const msg = `Division by zero detected. All X values are likely identical.`;
    console.error(`[Regression] ${msg}`);
    return { slope: NaN, intercept: NaN, r2: NaN, error: msg };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R² Calculation
  let ssTot = sumYY - (sumY * sumY) / n;
  let ssResReal = 0;
  
  validData.forEach(pt => {
    const fi = intercept + slope * pt[xKey];
    ssResReal += (pt[yKey] - fi) ** 2;
  });
  
  let r2 = 0;
  if (ssTot !== 0 && isFinite(ssTot) && isFinite(ssResReal)) {
    r2 = 1 - (ssResReal / ssTot);
  } else {
    console.warn(`[Regression] Cannot calculate R2 (SS_tot=${ssTot}, SS_res=${ssResReal}). Defaulting to 0.`);
  }

  console.log(`[Regression] Complete. N=${n}, Slope=${slope}, Int=${intercept}, R2=${r2}`);

  return { 
    slope: isFinite(slope) ? slope : NaN, 
    intercept: isFinite(intercept) ? intercept : NaN, 
    r2: isFinite(r2) ? r2 : NaN, 
    error: null 
  };
};
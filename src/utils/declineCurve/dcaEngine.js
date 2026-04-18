export const fitArpsModel = (data, modelType, window, constraints) => {
  // Placeholder for fitting logic
  // Returns a mock result object
  return {
    R2: 0.98,
    RMSE: 5.2,
    parameters: { qi: 1000, Di: 0.15, b: 0.5 },
    t0: new Date().toISOString()
  };
};

export const getFitQuality = (r2, rmse, points) => {
  if (r2 > 0.9) return 'Excellent';
  if (r2 > 0.7) return 'Good';
  return 'Poor';
};

export const generateForecast = (params, config, t0) => {
  // Placeholder forecast generation
  return Array.from({ length: 12 }, (_, i) => ({
    date: new Date(t0.getTime() + i * 30 * 24 * 60 * 60 * 1000).toISOString(),
    rate: params.qi * Math.exp(-params.Di * (i/12))
  }));
};

export const fitHyperbolic = (x, y) => {
  // Placeholder
  return { qi: 1000, Di: 0.1, b: 0.5 };
};

export const calculateArpsHyperbolic = (qi, Di, b, t) => {
  // Arps Hyperbolic equation: q(t) = qi / (1 + b * Di * t)^(1/b)
  // Note: Di is usually nominal decline rate. t is time.
  if (b === 0) {
    // Exponential decline limit
    return qi * Math.exp(-Di * t);
  }
  return qi / Math.pow(1 + b * Di * t, 1 / b);
};

export const calculateArpsExponential = (qi, Di, t) => {
  // Arps Exponential equation: q(t) = qi * exp(-Di * t)
  return qi * Math.exp(-Di * t);
};

export const calculateEUR = (qi, Di, b, q_limit, model) => {
  // Simple EUR calculation
  // Exponential: EUR = (qi - q_limit) / Di
  // Hyperbolic: EUR = (qi^b / ((1-b) * Di)) * (qi^(1-b) - q_limit^(1-b))
  
  if (model === 'Exponential' || b === 0) {
    return (qi - q_limit) / Di;
  } else if (b === 1) {
    // Harmonic
    return (qi / Di) * Math.log(qi / q_limit);
  } else {
    // Hyperbolic
    return (Math.pow(qi, b) / ((1 - b) * Di)) * (Math.pow(qi, 1 - b) - Math.pow(q_limit, 1 - b));
  }
};
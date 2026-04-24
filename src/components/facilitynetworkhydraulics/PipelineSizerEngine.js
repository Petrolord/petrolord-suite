/**
 * Calculates Darcy friction factor using Swamee-Jain equation (explicit approximation of Colebrook-White)
 */
export const calculateFrictionFactor = (reynolds, relativeRoughness) => {
  if (reynolds < 2300) {
    return 64 / reynolds; // Laminar flow
  }
  // Swamee-Jain equation
  const term1 = relativeRoughness / 3.7;
  const term2 = 5.74 / Math.pow(reynolds, 0.9);
  const f = 0.25 / Math.pow(Math.log10(term1 + term2), 2);
  return f;
};

/**
 * Main Pipeline Sizer Calculation Engine
 * @param {Object} inputs 
 * @returns {Object} results
 */
export const calculatePipelineHydraulics = (inputs) => {
  const {
    flowRate, // m3/hr
    density, // kg/m3
    viscosity, // cP
    diameter, // inches
    length, // meters
    roughness, // inches
    elevationChange, // meters
    fittingsK = 0,
  } = inputs;

  // Unit conversions
  const d_m = diameter * 0.0254; // meters
  const e_m = roughness * 0.0254; // meters
  const q_m3s = flowRate / 3600; // m3/s
  const mu_pas = viscosity * 0.001; // Pa.s (kg/(m.s))
  const area = Math.PI * Math.pow(d_m, 2) / 4;
  
  // Velocity
  const velocity = q_m3s / area; // m/s
  
  // Reynolds Number
  const reynolds = (density * velocity * d_m) / mu_pas;
  
  // Friction Factor
  const relativeRoughness = e_m / d_m;
  const frictionFactor = calculateFrictionFactor(reynolds, relativeRoughness);
  
  // Pressure Drop Components
  const g = 9.81;
  const dp_friction = frictionFactor * (length / d_m) * (density * Math.pow(velocity, 2) / 2); // Pa
  const dp_elevation = density * g * elevationChange; // Pa
  const dp_fittings = fittingsK * (density * Math.pow(velocity, 2) / 2); // Pa
  
  const totalDpPa = dp_friction + dp_elevation + dp_fittings;
  const totalDpBar = totalDpPa / 100000;
  
  return {
    velocity,
    reynolds,
    frictionFactor,
    dpFrictionBar: dp_friction / 100000,
    dpElevationBar: dp_elevation / 100000,
    dpFittingsBar: dp_fittings / 100000,
    totalPressureDropBar: totalDpBar,
    flowRegime: reynolds < 2300 ? 'Laminar' : (reynolds > 4000 ? 'Turbulent' : 'Transitional')
  };
};

export const calculatePipeStress = (pressure, diameter, wallThickness, materialYieldStrength) => {
  // Simple Barlow's formula for hoop stress
  const p_psi = pressure * 14.5038; // bar to psi
  const hoopStress = (p_psi * diameter) / (2 * wallThickness);
  const safetyFactor = materialYieldStrength / hoopStress;
  
  return {
    hoopStress,
    safetyFactor,
    isSafe: safetyFactor >= 1.5
  };
};
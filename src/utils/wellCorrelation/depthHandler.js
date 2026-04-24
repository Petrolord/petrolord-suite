export const createDepthArray = (start, stop, step) => {
  const arr = [];
  for (let d = start; d <= stop; d += step) {
    arr.push(d);
  }
  return arr;
};

export const getValueAtDepth = (depth, curveData, depthArray) => {
  // Find nearest index
  if (!depthArray || !curveData) return null;
  const index = depthArray.findIndex(d => Math.abs(d - depth) < 0.01);
  return index !== -1 ? curveData[index] : null;
};

export const convertDepth = (value, fromUnit, toUnit) => {
  if (fromUnit === toUnit) return value;
  if (fromUnit === 'M' && toUnit === 'FT') return value * 3.28084;
  if (fromUnit === 'FT' && toUnit === 'M') return value / 3.28084;
  return value;
};
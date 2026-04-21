// Multi-segment detection for Decline Curve Analysis
// Phase 3a: Detection and read-only display only

/**
 * Local smoothing function - moving average
 * @param {Array} values - Array of numeric values
 * @param {number} windowSize - Size of moving average window
 * @returns {Array} Smoothed values
 */
function smoothData(values, windowSize = 10) {
  const smoothed = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(values.length, i + halfWindow + 1);
    const window = values.slice(start, end);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    smoothed.push(avg);
  }
  
  return smoothed;
}

/**
 * Local slope computation function
 * @param {Array} xValues - X coordinates
 * @param {Array} yValues - Y coordinates
 * @param {number} windowSize - Window for slope calculation
 * @returns {Array} Slopes at each point
 */
function computeSlopes(xValues, yValues, windowSize = 5) {
  const slopes = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < xValues.length; i++) {
    if (i < halfWindow || i >= xValues.length - halfWindow) {
      slopes.push(0);
      continue;
    }
    
    const x1 = xValues[i - halfWindow];
    const x2 = xValues[i + halfWindow];
    const y1 = yValues[i - halfWindow];
    const y2 = yValues[i + halfWindow];
    
    const slope = (y2 - y1) / (x2 - x1);
    slopes.push(slope);
  }
  
  return slopes;
}

/**
 * Local breakpoint detection function
 * @param {Array} slopes - Slope values
 * @param {number} threshold - Minimum change threshold (0.20 = 20%)
 * @returns {Array} Breakpoint indices
 */
function findBreakpoints(slopes, threshold = 0.20) {
  const breakpoints = [];
  
  for (let i = 1; i < slopes.length - 1; i++) {
    const prevSlope = slopes[i - 1];
    const currSlope = slopes[i];
    
    if (Math.abs(prevSlope) > 0.001) {
      const slopeChange = Math.abs((currSlope - prevSlope) / prevSlope);
      if (slopeChange > threshold) {
        breakpoints.push({
          index: i,
          slopeChange: slopeChange
        });
      }
    }
  }
  
  return breakpoints;
}

/**
 * Main segment detection function
 * @param {Array} productionData - Array of {date, rate, time} objects
 * @param {Object} options - Detection parameters
 * @returns {Array} Array of breakpoint objects
 */
export function detectSegmentBreakpoints(productionData, options = {}) {
  const {
    smoothingWindow = 10,
    slopeChangeThreshold = 0.20,
    maxBreakpoints = 3
  } = options;
  
  // Return empty array if insufficient data
  if (!productionData || productionData.length < 90) {
    return [];
  }
  
  // Filter to positive rates and convert to log-log space
  const validData = productionData
    .filter(d => d.rate > 0 && d.time > 0)
    .sort((a, b) => a.time - b.time);
    
  if (validData.length < 60) {
    return [];
  }
  
  const logTimes = validData.map(d => Math.log10(d.time));
  const logRates = validData.map(d => Math.log10(d.rate));
  
  // Smooth the log-rate series
  const smoothedRates = smoothData(logRates, smoothingWindow);
  
  // Compute slopes across the smoothed data
  const slopes = computeSlopes(logTimes, smoothedRates);
  
  // Find breakpoints where slope changes exceed threshold
  const rawBreakpoints = findBreakpoints(slopes, slopeChangeThreshold);
  
  // Limit to maxBreakpoints and convert to output format
  const limitedBreakpoints = rawBreakpoints
    .slice(0, maxBreakpoints)
    .map(bp => {
      const dataPoint = validData[bp.index];
      return {
        index: bp.index,
        date: dataPoint.date,
        rate: dataPoint.rate,
        slopeChange: bp.slopeChange * 100 // Convert to percentage
      };
    });
  
  return limitedBreakpoints;
}

export default detectSegmentBreakpoints;